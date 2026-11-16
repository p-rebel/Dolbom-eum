import { createWorker, OEM, PSM } from 'tesseract.js';
import workerUrl from 'tesseract.js/dist/worker.min.js?url';
import coreUrl from 'tesseract.js-core/tesseract-core-lstm.wasm.js?url';
import type { Observations } from '../../api/registration';

type Reading = Observations['name'];

function merge(parts: Reading[], separator = ' '): Reading {
  return {
    value: parts.every((part) => part.value) ? parts.map((part) => part.value).join(separator).slice(0, 100) : null,
    confidence: Math.min(...parts.map((part) => part.confidence)),
  };
}

export async function readEvidence(imageUrl: string): Promise<Observations> {
  const response = await fetch(imageUrl, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok || response.headers.get('content-type') !== 'image/png') {
    throw new Error('가상 증빙 이미지를 불러오지 못했습니다.');
  }
  const image = await response.blob();
  let reportWorkerFailure = (_error: Error) => {};
  const failure = new Promise<never>((_, reject) => { reportWorkerFailure = reject; });
  const starting = createWorker('kor+eng', OEM.LSTM_ONLY, {
    workerPath: new URL(workerUrl, window.location.href).href,
    corePath: new URL(coreUrl, window.location.href).href,
    langPath: new URL(import.meta.env.BASE_URL + 'ocr/tessdata-v4', window.location.href).href,
    workerBlobURL: false,
    cacheMethod: 'none',
    errorHandler: () => reportWorkerFailure(new Error('OCR 엔진에서 오류가 발생했습니다.')),
  });
  const timeout = window.setTimeout(() => reportWorkerFailure(new Error('OCR 실행 시간이 초과되었습니다.')), 30_000);

  async function recognize() {
    const worker = await starting;
    // The supplied evidence samples share one layout. Only the value area in each row is read.
    async function readPart(row: number, left = 399, width = 655): Promise<Reading> {
      const rectangle = { left, top: 168 + row * 92, width, height: 73 };
      const { data } = await worker.recognize(image, { rectangle });
      return { value: data.text.trim().slice(0, 100) || null, confidence: data.confidence };
    }
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE });
    const namePrefix = await readPart(0, 399, 240);
    const birthDate = await readPart(1);
    const demoId = await readPart(2);
    const addressPrefix = await readPart(3, 399, 107);
    const addressSuffix = await readPart(3, 545, 509);

    // In this template the isolated Latin initials sit beside Hangul. Read them
    // separately so the Korean model cannot merge them into neighboring glyphs.
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_CHAR, tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' });
    const nameInitial = await readPart(0, 638, 47);
    const cityInitial = await readPart(3, 506, 39);
    return {
      name: merge([namePrefix, nameInitial]),
      birthDate,
      demoId,
      address: merge([addressPrefix, merge([cityInitial, addressSuffix], '')]),
    };
  }
  try {
    return await Promise.race([recognize(), failure]);
  } finally {
    window.clearTimeout(timeout);
    // Also release a worker that finishes initializing after the deadline.
    void starting.then((worker) => worker.terminate()).catch(() => {});
  }
}
