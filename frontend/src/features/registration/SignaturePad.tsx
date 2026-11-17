import { useLayoutEffect, useRef, type PointerEvent } from 'react';
import type { Signature } from '../../api/registration';

const WIDTH = 480;
const HEIGHT = 200;
const MAX_POINTS = 1200;
const MAX_STROKES = 64;
type Point = [number, number];

export function hasSignature(value: Signature) {
  return value.some(([start, ...points]) => points.some(([x, y]) => x !== start[0] || y !== start[1]));
}

function draw(ctx: CanvasRenderingContext2D, from: Point, to?: Point) {
  ctx.beginPath();
  if (to) {
    ctx.moveTo(...from);
    ctx.lineTo(...to);
    ctx.stroke();
  } else {
    ctx.arc(...from, ctx.lineWidth / 2, 0, 2 * Math.PI);
    ctx.fill();
  }
}

function pointerPoint({ currentTarget, clientX, clientY }: PointerEvent<HTMLCanvasElement>): Point {
  const bounds = currentTarget.getBoundingClientRect();
  return [
    Math.round(Math.max(0, Math.min(WIDTH, (clientX - bounds.left) * WIDTH / bounds.width))),
    Math.round(Math.max(0, Math.min(HEIGHT, (clientY - bounds.top) * HEIGHT / bounds.height))),
  ];
}

export function SignaturePad({ id, label, value, onChange, disabled, error }: {
  id: string; label: string; value: Signature; onChange: (value: Signature) => void; disabled: boolean; error?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const active = useRef<{ pointerId: number; points: Point[]; limit: number } | null>(null);

  function redraw() {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = ctx.strokeStyle = '#164b88';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    for (const stroke of value) {
      draw(ctx, stroke[0]);
      for (let index = 1; index < stroke.length; index++) draw(ctx, stroke[index - 1], stroke[index]);
    }
  }

  useLayoutEffect(redraw, [value]);

  function start(event: PointerEvent<HTMLCanvasElement>) {
    if (disabled || event.button !== 0 || active.current || value.length >= MAX_STROKES) return;
    const limit = MAX_POINTS - value.reduce((total, stroke) => total + stroke.length, 0);
    if (limit < 2) return;
    const point = pointerPoint(event);
    const ctx = event.currentTarget.getContext('2d');
    if (!ctx) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    active.current = { pointerId: event.pointerId, points: [point], limit };
    draw(ctx, point);
  }

  function move(event: PointerEvent<HTMLCanvasElement>) {
    const stroke = active.current;
    if (!stroke || stroke.pointerId !== event.pointerId || stroke.points.length >= stroke.limit) return;
    const point = pointerPoint(event);
    const previous = stroke.points[stroke.points.length - 1];
    if (Math.hypot(point[0] - previous[0], point[1] - previous[1]) < 2) return;
    const ctx = event.currentTarget.getContext('2d');
    if (!ctx) return;
    draw(ctx, previous, point);
    stroke.points.push(point);
  }

  function finish(event: PointerEvent<HTMLCanvasElement>) {
    const stroke = active.current;
    if (!stroke || stroke.pointerId !== event.pointerId) return;
    move(event);
    active.current = null;
    onChange([...value, stroke.points]);
  }

  function cancel(event: PointerEvent<HTMLCanvasElement>) {
    if (active.current?.pointerId !== event.pointerId) return;
    active.current = null;
    redraw();
  }

  return (
    <div className="registration-signature">
      <h3 id={id + '-label'}>{label}</h3>
      <div className={error ? 'registration-signature-box is-error' : 'registration-signature-box'}>
        <canvas id={id} ref={canvas} width={WIDTH} height={HEIGHT} tabIndex={disabled ? -1 : 0}
          aria-labelledby={id + '-label'} aria-describedby={error ? 'signature-hint ' + id + '-error' : 'signature-hint'}
          aria-invalid={error ? true : undefined} aria-disabled={disabled}
          onPointerDown={start} onPointerMove={move} onPointerUp={finish}
          onPointerCancel={cancel} onLostPointerCapture={cancel} />
      </div>
      {error && <p id={id + '-error'} className="form-hint-invalid">{error}</p>}
      <button type="button" className="krds-btn small secondary" disabled={disabled || !value.length}
        aria-label={label + ' 지우기'} onClick={() => onChange([])}>지우기</button>
    </div>
  );
}
