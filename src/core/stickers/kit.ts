import type { Ctx2D } from '@/core/types';
import { roundedRectPath } from '@/core/math/geometry';
import { clamp01 } from '@/core/effects/random';

/**
 * Shared shapes and timing for the sticker art (D-158).
 *
 * The timing helpers all map a loop's progress to a value and are exact at
 * their ends, which is what keeps a loop seamless: anything that starts at
 * rest and ends at rest draws the same frame at `p = 0` and `p = 1`. The path
 * helpers only trace — the caller fills or strokes — and draw around a centre
 * so a sticker can scale and turn them about it.
 */

export { clamp01, lerp, smoothstep, wrap } from '@/core/effects/random';

export const TAU = Math.PI * 2;

/** Degrees to radians, so the art can say "a 20° swing". */
export const deg = (d: number): number => (d * Math.PI) / 180;

/** Where `p` is between `a` and `b`, as 0–1: 0 before, 1 after. */
export function seg(p: number, a: number, b: number): number {
  return clamp01((p - a) / (b - a));
}

export const easeInOutSine = (u: number): number => (1 - Math.cos(Math.PI * clamp01(u))) / 2;
export const easeOutCubic = (u: number): number => 1 - (1 - clamp01(u)) ** 3;
export const easeInCubic = (u: number): number => clamp01(u) ** 3;
export const easeInOutCubic = (u: number): number => {
  const x = clamp01(u);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
};

/** Overshoots past 1 and comes back: the "pop" of something arriving. */
export function easeOutBack(u: number, overshoot = 1.70158): number {
  const x = clamp01(u);
  if (x === 0 || x === 1) return x;
  return 1 + (overshoot + 1) * (x - 1) ** 3 + overshoot * (x - 1) ** 2;
}

/**
 * A spring settling from 0 to 1: one clear overshoot (about 13% with the
 * defaults), a smaller undershoot, then rest. Exact at both ends, so what
 * springs in holds still at 1 with no last-frame jump.
 */
export function springOut(u: number, wobbles = 1.25, decay = 5): number {
  const x = clamp01(u);
  const raw = (v: number): number => 1 - Math.exp(-decay * v) * Math.cos(TAU * wobbles * v);
  return raw(x) + (1 - raw(1)) * x;
}

/**
 * A damped swing that starts and ends at rest — a bell, a wag, a wobble:
 * out to about ±0.8, then smaller each time, 0 at both ends.
 */
export function ring(u: number, swings = 3, decay = 2.5): number {
  const x = clamp01(u);
  return Math.sin(TAU * swings * x) * Math.exp(-decay * x) * (1 - x);
}

/** 0 → 1 → 0 with no jolt at either end: a pulse, a blink, a breath. */
export function bump(u: number): number {
  const s = Math.sin(Math.PI * clamp01(u));
  return s * s;
}

/** A sine that repeats a whole number of times per loop, so it has no seam. */
export function cycle(p: number, times: number, phase = 0): number {
  return Math.sin(TAU * (Math.round(times) * p + phase));
}

/** A soft light across the top of a shape already traced as the current path. */
export function gloss(ctx: Ctx2D, top: number, bottom: number, strength = 0.2): void {
  const g = ctx.createLinearGradient(0, top, 0, bottom);
  g.addColorStop(0, `rgba(255,255,255,${strength})`);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fill();
}

/** Draws at `alpha`, and not at all when it would not show: crossfades skip their hidden side. */
export function faded(ctx: Ctx2D, alpha: number, draw: () => void): void {
  if (alpha <= 0.001) return;
  ctx.save();
  ctx.globalAlpha *= Math.min(1, alpha);
  draw();
  ctx.restore();
}

// ── Paths ───────────────────────────────────────────────────────────────────

export function roundedRect(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number): void {
  roundedRectPath(ctx, x, y, w, h, r);
}

export function circlePath(ctx: Ctx2D, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(0, r), 0, TAU);
}

/**
 * A heart `size` wide centred on (cx, cy): two round lobes and a soft point,
 * about 0.86 of its width tall.
 */
export function heartPath(ctx: Ctx2D, cx: number, cy: number, size: number): void {
  const p = (x: number, y: number): [number, number] => [cx + x * size, cy + y * size];
  ctx.beginPath();
  ctx.moveTo(...p(0, 0.41));
  ctx.bezierCurveTo(...p(-0.1, 0.33), ...p(-0.5, 0.08), ...p(-0.5, -0.17));
  ctx.bezierCurveTo(...p(-0.5, -0.36), ...p(-0.37, -0.46), ...p(-0.25, -0.46));
  ctx.bezierCurveTo(...p(-0.12, -0.46), ...p(-0.03, -0.38), ...p(0, -0.28));
  ctx.bezierCurveTo(...p(0.03, -0.38), ...p(0.12, -0.46), ...p(0.25, -0.46));
  ctx.bezierCurveTo(...p(0.37, -0.46), ...p(0.5, -0.36), ...p(0.5, -0.17));
  ctx.bezierCurveTo(...p(0.5, 0.08), ...p(0.1, 0.33), ...p(0, 0.41));
  ctx.closePath();
}

/**
 * A star with `points` tips between radii `outer` and `inner`, the first tip
 * at `turn` from straight up. Sharp tips; stroke it with a round join in the
 * same colour to soften them.
 */
export function starPath(ctx: Ctx2D, cx: number, cy: number, outer: number, inner: number, points: number, turn = 0): void {
  ctx.beginPath();
  const n = Math.max(2, Math.round(points));
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = turn - Math.PI / 2 + (i * Math.PI) / n;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/**
 * A four-pointed glint — the shape people draw when they draw "sparkle" —
 * with concave sides. `pinch` is how far the sides bow in (0.1 thin, 0.3 plump).
 */
export function sparklePath(ctx: Ctx2D, cx: number, cy: number, r: number, turn = 0, pinch = 0.16): void {
  const c = Math.cos(turn);
  const s = Math.sin(turn);
  const at = (x: number, y: number): [number, number] => [cx + (x * c - y * s) * r, cy + (x * s + y * c) * r];
  ctx.beginPath();
  ctx.moveTo(...at(0, -1));
  ctx.quadraticCurveTo(...at(pinch, -pinch), ...at(1, 0));
  ctx.quadraticCurveTo(...at(pinch, pinch), ...at(0, 1));
  ctx.quadraticCurveTo(...at(-pinch, pinch), ...at(-1, 0));
  ctx.quadraticCurveTo(...at(-pinch, -pinch), ...at(0, -1));
  ctx.closePath();
}

/**
 * A notification bell `size` tall hanging from (0, 0) — its pivot — in the
 * current transform: dome, flared lip and the clapper beneath. Traces the
 * body and lip only; `bellClapper` and `bellKnob` trace the small parts.
 */
export function bellBodyPath(ctx: Ctx2D, size: number): void {
  const p = (x: number, y: number): [number, number] => [x * size, y * size];
  ctx.beginPath();
  ctx.moveTo(...p(-0.45, 0.8));
  ctx.bezierCurveTo(...p(-0.35, 0.72), ...p(-0.31, 0.62), ...p(-0.31, 0.45));
  ctx.bezierCurveTo(...p(-0.31, 0.24), ...p(-0.18, 0.1), ...p(0, 0.1));
  ctx.bezierCurveTo(...p(0.18, 0.1), ...p(0.31, 0.24), ...p(0.31, 0.45));
  ctx.bezierCurveTo(...p(0.31, 0.62), ...p(0.35, 0.72), ...p(0.45, 0.8));
  ctx.closePath();
}

/** The bell's lip: a rounded bar across the bottom of the body. */
export function bellLipPath(ctx: Ctx2D, size: number): void {
  roundedRect(ctx, -0.5 * size, 0.75 * size, size, 0.12 * size, 0.06 * size);
}

/** The clapper, swung by `offset` (in bell sizes) from hanging straight. */
export function bellClapperPath(ctx: Ctx2D, size: number, offset = 0): void {
  circlePath(ctx, offset * size, 0.92 * size, 0.1 * size);
}

export function bellKnobPath(ctx: Ctx2D, size: number): void {
  circlePath(ctx, 0, 0.07 * size, 0.07 * size);
}

/**
 * Traces the first `u` (0–1) of a polyline by length — a tick or a stroke
 * drawing itself on. Traces nothing at 0.
 */
export function strokeOn(ctx: Ctx2D, points: readonly (readonly [number, number])[], u: number): void {
  strokeSpan(ctx, points, 0, u);
}

/**
 * Traces the part of a polyline between `from` and `to` (0–1, by length): a
 * stroke drawing on from its start, or wiping away from it. Traces nothing
 * when the part is too short to see, so a round cap never leaves a dot
 * behind at the end of a loop.
 */
export function strokeSpan(ctx: Ctx2D, points: readonly (readonly [number, number])[], from: number, to: number): void {
  ctx.beginPath();
  const first = points[0];
  const a = clamp01(from);
  const b = clamp01(to);
  if (!first || b - a < 0.002) return;
  const lengths: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const p = points[i - 1] ?? first;
    const q = points[i] ?? first;
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    lengths.push(len);
    total += len;
  }
  const start = a * total;
  const end = b * total;
  let at = 0;
  let started = false;
  for (let i = 1; i < points.length; i++) {
    const p = points[i - 1] ?? first;
    const q = points[i] ?? first;
    const len = lengths[i - 1] ?? 0;
    const next = at + len;
    if (next >= start && at <= end && len > 0) {
      const k0 = Math.max(0, (start - at) / len);
      const k1 = Math.min(1, (end - at) / len);
      if (!started) {
        ctx.moveTo(p[0] + (q[0] - p[0]) * k0, p[1] + (q[1] - p[1]) * k0);
        started = true;
      }
      ctx.lineTo(p[0] + (q[0] - p[0]) * k1, p[1] + (q[1] - p[1]) * k1);
    }
    at = next;
    if (at > end) break;
  }
}

/**
 * A thumbs-up `size` across, centred on the origin of the current transform:
 * the cuff, and the hand as one silhouette — thumb up, four fingers curled
 * across the palm, each a little shorter than the one above — filled once in
 * `fill`, so it fades as one piece. The creases between the fingers are drawn
 * in `crease`. Leans by `tilt` (radians) about the wrist.
 */
export function drawThumb(ctx: Ctx2D, size: number, fill: string, crease: string, tilt = 0): void {
  ctx.save();
  ctx.scale(size, size);
  ctx.translate(-0.3, 0.4);
  ctx.rotate(tilt);
  ctx.translate(0.3, -0.4);
  const tops = [-0.09, 0.04, 0.17, 0.3];
  const rights = [0.38, 0.36, 0.33, 0.28];
  const bottom = 0.43;
  ctx.beginPath();
  // The cuff.
  ctx.moveTo(-0.46, -0.02);
  ctx.lineTo(-0.3, -0.02);
  ctx.lineTo(-0.3, bottom);
  ctx.lineTo(-0.46, bottom);
  ctx.closePath();
  // The hand, clockwise from the bottom of the palm by the wrist.
  ctx.moveTo(-0.25, bottom - 0.05);
  ctx.lineTo(-0.25, 0.02);
  ctx.bezierCurveTo(-0.25, -0.05, -0.18, -0.1, -0.13, -0.17);
  ctx.lineTo(-0.075, -0.33);
  ctx.bezierCurveTo(-0.05, -0.47, 0.11, -0.47, 0.1, -0.33);
  ctx.lineTo(0.085, -0.15);
  ctx.bezierCurveTo(0.083, -0.11, 0.1, -0.09, 0.14, -0.09);
  for (let i = 0; i < 4; i++) {
    const top = tops[i] ?? 0;
    const right = rights[i] ?? 0;
    const low = i < 3 ? (tops[i + 1] ?? bottom) : bottom;
    const mid = (top + low) / 2;
    const half = (low - top) / 2;
    ctx.lineTo(right - half, top);
    ctx.arc(right - half, mid, half, -Math.PI / 2, Math.PI / 2);
  }
  ctx.lineTo(-0.2, bottom);
  ctx.quadraticCurveTo(-0.25, bottom, -0.25, bottom - 0.05);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  // Creases: where each finger meets the one below, short of the palm.
  ctx.beginPath();
  for (let i = 1; i < 4; i++) {
    const y = tops[i] ?? 0;
    ctx.moveTo(0.15, y);
    ctx.lineTo((rights[i] ?? 0) - 0.02, y);
  }
  ctx.strokeStyle = crease;
  ctx.lineCap = 'round';
  ctx.lineWidth = 0.03;
  ctx.stroke();
  ctx.restore();
}

/**
 * A round face of radius `r` on the origin, in `color`, lit from the top
 * left with a little shade along the bottom — gradients, so it holds at any
 * size and in any colour.
 */
export function drawFace(ctx: Ctx2D, r: number, color: string): void {
  circlePath(ctx, 0, 0, r);
  ctx.fillStyle = color;
  ctx.fill();
  const light = ctx.createRadialGradient(-r * 0.35, -r * 0.45, r * 0.05, -r * 0.2, -r * 0.25, r * 1.1);
  light.addColorStop(0, 'rgba(255,255,255,0.42)');
  light.addColorStop(0.6, 'rgba(255,255,255,0)');
  ctx.fillStyle = light;
  ctx.fill();
  const shade = ctx.createRadialGradient(0, -r * 0.3, r * 0.75, 0, -r * 0.12, r * 1.08);
  shade.addColorStop(0, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(0,0,0,0.2)');
  ctx.fillStyle = shade;
  ctx.fill();
}

/** A teardrop `size` tall with its point up, centred on (cx, cy). */
export function tearPath(ctx: Ctx2D, cx: number, cy: number, size: number): void {
  const p = (x: number, y: number): [number, number] => [cx + x * size, cy + y * size];
  ctx.beginPath();
  ctx.moveTo(...p(0, -0.5));
  ctx.bezierCurveTo(...p(0.12, -0.25), ...p(0.32, -0.05), ...p(0.32, 0.18));
  ctx.bezierCurveTo(...p(0.32, 0.38), ...p(0.17, 0.5), ...p(0, 0.5));
  ctx.bezierCurveTo(...p(-0.17, 0.5), ...p(-0.32, 0.38), ...p(-0.32, 0.18));
  ctx.bezierCurveTo(...p(-0.32, -0.05), ...p(-0.12, -0.25), ...p(0, -0.5));
  ctx.closePath();
}

/**
 * A mouse pointer `size` tall with its tip at the origin, pointing up and to
 * the left: the arrow, its notch and tail.
 */
export function cursorPath(ctx: Ctx2D, size: number): void {
  const pts: readonly (readonly [number, number])[] = [
    [0, 0], [0, 0.78], [0.19, 0.6], [0.32, 0.9], [0.44, 0.85], [0.31, 0.56], [0.56, 0.56],
  ];
  ctx.beginPath();
  pts.forEach(([x, y], i) => {
    if (i === 0) ctx.moveTo(x * size, y * size);
    else ctx.lineTo(x * size, y * size);
  });
  ctx.closePath();
}

/**
 * Short lines bursting out from a centre — the "pop" around a press. `u` is
 * the burst's own progress: the lines travel out and shorten to nothing.
 */
export function burstLines(ctx: Ctx2D, cx: number, cy: number, inner: number, reach: number, count: number, u: number, turn = 0): void {
  if (u <= 0 || u >= 1) return;
  const travel = easeOutCubic(u);
  const from = inner + reach * travel;
  const len = reach * 0.55 * (1 - travel);
  if (len <= 0) return;
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const a = turn + (i / count) * TAU;
    ctx.moveTo(cx + Math.cos(a) * from, cy + Math.sin(a) * from);
    ctx.lineTo(cx + Math.cos(a) * (from + len), cy + Math.sin(a) * (from + len));
  }
  ctx.stroke();
}

/**
 * The stickers' red: a generic button red, deep enough that the words on it
 * come out white (D-126 picks white or near-black by contrast) — not any
 * platform's own red.
 */
export const RED = '#D93025';

/** The warm yellow of faces, bells and stars. */
export const AMBER = '#FFB300';

/** A colour's darker or lighter self, drawn over it: works for any colour the look gives. */
export const SHADE = 'rgba(0,0,0,0.22)';
export const SHINE = 'rgba(255,255,255,0.28)';

/** The ink of a face's features — eyes, brows, mouth — when it is not a sticker's own colour. */
export const FACE_INK = '#4A2F23';

/** The words for a label key, or its default when the sample has none for it. */
export function labelOf(labels: Readonly<Record<string, string>>, key: string, fallback: string): string {
  return labels[key] ?? fallback;
}
