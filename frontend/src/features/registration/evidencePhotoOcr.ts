import { PSM, type Line, type Worker } from 'tesseract.js';
import type { Observations, VerificationField } from '../../api/registration';

const LABELS: Record<VerificationField, RegExp> = {
  name: /^(?:(?:대\s*상\s*자\s*)?(?:성\s*명|이\s*름)|(?:full\s+)?name)(?=\s|[:=|]|$)/i,
  birthDate: /^(?:생\s*년\s*월\s*일|출\s*생\s*일|date\s+of\s+birth|birth\s*date|dob)(?=\s|[:=|]|$)/i,
  demoId: /^(?:(?:가\s*상\s*)?식\s*별\s*자|가\s*상\s*id|demo\s+(?:identifier|id))(?=\s|[:=|]|$)/i,
  address: /^(?:(?:대\s*상\s*자\s*)?주\s*소|거\s*주\s*지|address)(?=\s|[:=|]|$)/i,
};
const fields = Object.entries(LABELS) as [VerificationField, RegExp][];
const missing = { value: null, confidence: 0 };
const DEMO_ID = /^DEMO-[A-Z0-9]{2,12}(?:-[A-Z0-9]{1,8})?$/i;
const RESCAN_BELOW = 80;

interface Candidate {
  value: string;
  confidence: number;
  line: Line;
}

function lineText(line: Line) {
  return line.text.normalize('NFKC').trim();
}

function isLabel(line: Line) {
  return fields.some(([, pattern]) => pattern.test(lineText(line)));
}

function nearbyValue(label: Line, lines: Line[]) {
  const { x0, x1, y0, y1 } = label.bbox;
  const height = y1 - y0;
  // OCR may segment a label and its value as separate blocks in a table.
  const right = lines.filter((line) => {
    const box = line.bbox;
    const overlap = Math.min(y1, box.y1) - Math.max(y0, box.y0);
    return box.x0 >= x1 && overlap >= Math.min(height, box.y1 - box.y0) / 2;
  }).sort((a, b) => a.bbox.x0 - b.bbox.x0)[0];
  if (right) return isLabel(right) ? undefined : right;

  const below = lines.filter(({ bbox: box }) => (
    box.y0 >= y1 && box.y0 - y1 <= height * 2 && box.x0 >= x0 - height && box.x0 <= x1 + height
  )).sort((a, b) => a.bbox.y0 - b.bbox.y0)[0];
  return below && !isLabel(below) ? below : undefined;
}

function extract(lines: Line[], pattern: RegExp): Candidate | null | undefined {
  const candidates: Candidate[] = [];
  for (const line of lines) {
    const label = pattern.exec(lineText(line));
    if (!label) continue;
    const tail = lineText(line).slice(label[0].length).replace(/^[\s:=|]+/, '');
    const separate = tail ? undefined : nearbyValue(line, lines);
    const value = tail || (separate ? lineText(separate) : '');
    if (value && value.length <= 100) {
      const valueLine = separate ?? line;
      candidates.push({ value, confidence: valueLine.confidence, line: valueLine });
    }
  }
  if (!candidates.length) return undefined;
  if (new Set(candidates.map(({ value }) => value.replace(/\s/g, '').toLowerCase())).size !== 1) return null;
  return candidates.reduce((best, next) => next.confidence > best.confidence ? next : best);
}

function observation(candidate: Candidate | null | undefined) {
  return candidate ? { value: candidate.value, confidence: candidate.confidence } : missing;
}

function usable(candidate: Candidate | null | undefined, field: VerificationField) {
  return Boolean(candidate && candidate.confidence >= RESCAN_BELOW
    && (field !== 'demoId' || DEMO_ID.test(candidate.value.replace(/\s/g, ''))));
}

function valueRectangle(canvas: HTMLCanvasElement, candidate: Candidate) {
  const { words, bbox } = candidate.line;
  // Locate the value using words OCR found from the end of the line.
  const valueLength = candidate.value.replace(/\s/g, '').length;
  let valueStart = bbox.x0;
  let characters = 0;
  for (let i = words.length - 1; i >= 0 && characters < valueLength; i--) {
    characters += words[i].text.normalize('NFKC').replace(/\s/g, '').length;
    valueStart = words[i].bbox.x0;
  }
  const left = Math.max(0, valueStart - 8);
  const top = Math.max(0, bbox.y0 - 12);
  const width = Math.min(canvas.width, bbox.x1 + 8) - left;
  const height = Math.min(canvas.height, bbox.y1 + 12) - top;
  return width > 0 && height > 0 ? { left, top, width, height } : null;
}

async function readTextValue(worker: Worker, canvas: HTMLCanvasElement, candidate: Candidate | null | undefined) {
  // A label in a different script can affect recognition of the neighboring value.
  if (!candidate || candidate.confidence >= 90) return observation(candidate);
  const rectangle = valueRectangle(canvas, candidate);
  if (!rectangle) return observation(candidate);
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE });
  const { data } = await worker.recognize(canvas, { rectangle });
  const value = data.text.trim();
  return value.length && value.length <= 100 && data.confidence > candidate.confidence
    ? { value, confidence: data.confidence } : observation(candidate);
}

async function readIdentifier(worker: Worker, canvas: HTMLCanvasElement, candidate: Candidate | null | undefined) {
  if (!candidate || usable(candidate, 'demoId')) return observation(candidate);
  const rectangle = valueRectangle(canvas, candidate);
  if (!rectangle) return observation(candidate);
  await worker.reinitialize('eng');
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE, tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-' });
  const { data } = await worker.recognize(canvas, { rectangle });
  const value = data.text.replace(/\s/g, '');
  return DEMO_ID.test(value) && data.confidence >= RESCAN_BELOW ? { value, confidence: data.confidence } : observation(candidate);
}

async function readLines(worker: Worker, canvas: HTMLCanvasElement, mode: PSM) {
  await worker.setParameters({ tessedit_pageseg_mode: mode });
  const { data } = await worker.recognize(canvas, { rotateAuto: true }, { blocks: true });
  return (data.blocks ?? []).flatMap((block) => block.paragraphs.flatMap((paragraph) => paragraph.lines));
}

export async function readUploadedPhoto(worker: Worker, image: Blob): Promise<Observations> {
  // Limit OCR work while keeping the stored original and its EXIF intact.
  const bitmap = await createImageBitmap(image, { imageOrientation: 'from-image' });
  const canvas = document.createElement('canvas');
  try {
    const scale = Math.min(1, 2800 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('가상 증빙 사진을 열 수 없습니다.');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  } finally {
    bitmap.close();
  }
  const lines = await readLines(worker, canvas, PSM.SINGLE_BLOCK);
  let candidates = fields.map(([, pattern]) => extract(lines, pattern));
  if (fields.some(([field], index) => candidates[index] !== null && !usable(candidates[index], field))) {
    const column = await readLines(worker, canvas, PSM.SINGLE_COLUMN);
    candidates = fields.map(([field, pattern], index) => {
      const first = candidates[index];
      if (first === null || usable(first, field)) return first;
      const next = extract(column, pattern);
      return usable(next, field) || first === undefined ? next : first;
    });
  }
  if (candidates.includes(undefined)) {
    const sparse = await readLines(worker, canvas, PSM.SPARSE_TEXT);
    candidates = fields.map(([, pattern], index) =>
      candidates[index] === undefined ? extract(sparse, pattern) : candidates[index]);
  }
  const [name, birthDate, demoId, address] = candidates;
  const nameObservation = await readTextValue(worker, canvas, name);
  const addressObservation = await readTextValue(worker, canvas, address);
  return {
    name: nameObservation,
    birthDate: observation(birthDate),
    demoId: await readIdentifier(worker, canvas, demoId),
    address: addressObservation,
  };
}
