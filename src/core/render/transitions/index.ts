import type { Ctx2D, Direction, Size } from '@/core/types';
import { context2d, type AnyCanvas } from '../surface';
import type { TransitionKind } from '@/document/types';
import { applyEase } from '@/core/anim/easings';

/**
 * Scene transitions (§6.4).
 *
 * Each is a pure function over two rendered scene buffers and a progress value.
 * They never read the document, never allocate, and never look at time — the
 * compositor has already resolved `progress` from D-004's overlap window, which
 * is what lets the same function serve the preview and the export unchanged.
 *
 * §6.4 gives the signature as `(ctxOut, bufA, bufB, progress) => void`. Two of
 * the seven need more than that — `push` and `wipe` need a direction, and
 * `zoomBlur` needs a scratch surface because it samples its own output and
 * cannot read and write one canvas at once — so the extras arrive in a fifth
 * options argument rather than being smuggled into module state (D-043).
 *
 * `a` is the outgoing scene, `b` the incoming one. Both buffers are the full
 * frame at device resolution; everything here works in pixels, not design
 * units, because a composite is a pixel operation and scaling it would resample
 * an already-rendered frame for nothing.
 */

export type TransitionOptions = {
  /** Pixel size of both buffers and of the output. */
  readonly size: Size;
  readonly direction: Direction;
  /** A third full-size surface, for transitions that cannot read and write one canvas. */
  readonly scratch: AnyCanvas;
};

export type TransitionFn = (
  out: Ctx2D,
  a: AnyCanvas,
  b: AnyCanvas,
  progress: number,
  options: TransitionOptions,
) => void;

const clamp01 = (p: number): number => (p < 0 ? 0 : p > 1 ? 1 : p);

/** Draws a whole buffer at 1:1 with the identity transform already set by the caller. */
function blit(out: Ctx2D, source: AnyCanvas, size: Size): void {
  out.drawImage(source, 0, 0, size.w, size.h);
}

/**
 * Hard cut.
 *
 * Present for completeness and never actually composited: `clampOverlap` gives
 * a cut a zero-length overlap, so the timeline simply switches scenes. If it
 * does run — a caller forcing a progress value — the incoming scene wins from
 * the midpoint, which is the only reading of "cut" that is not a crossfade.
 */
export const cut: TransitionFn = (out, a, b, progress, { size }) => {
  blit(out, progress < 0.5 ? a : b, size);
};

export const crossFade: TransitionFn = (out, a, b, progress, { size }) => {
  const p = clamp01(progress);
  blit(out, a, size);
  out.save();
  out.globalAlpha = p;
  blit(out, b, size);
  out.restore();
};

/** Unit vector for a direction, in the sense the *incoming* scene travels. */
function axis(direction: Direction): { dx: number; dy: number } {
  switch (direction) {
    case 'left': return { dx: -1, dy: 0 };
    case 'right': return { dx: 1, dy: 0 };
    case 'up': return { dx: 0, dy: -1 };
    case 'down': return { dx: 0, dy: 1 };
  }
}

/**
 * Both scenes slide together, as one strip.
 *
 * `direction` is the direction of travel: `left` pushes the outgoing scene off
 * the left edge and brings the incoming one in from the right.
 */
export const push: TransitionFn = (out, a, b, progress, { size, direction }) => {
  const p = applyEase('inOutCubic', clamp01(progress));
  const { dx, dy } = axis(direction);
  const offsetX = dx * size.w * p;
  const offsetY = dy * size.h * p;

  out.drawImage(a, offsetX, offsetY, size.w, size.h);
  out.drawImage(b, offsetX - dx * size.w, offsetY - dy * size.h, size.w, size.h);
};

/**
 * The incoming scene is revealed under a growing window; neither moves.
 *
 * A short soft edge keeps the boundary from aliasing into a staircase on a
 * diagonal-heavy frame — a hard clip on a 1080p export is visibly jagged.
 */
export const wipe: TransitionFn = (out, a, b, progress, { size, direction }) => {
  const p = applyEase('inOutCubic', clamp01(progress));
  blit(out, a, size);

  const feather = Math.max(2, Math.min(size.w, size.h) * 0.02);
  const horizontal = direction === 'left' || direction === 'right';
  const span = horizontal ? size.w : size.h;
  const edge = span * p;

  out.save();
  out.beginPath();
  switch (direction) {
    case 'left':  out.rect(size.w - edge, 0, edge, size.h); break;
    case 'right': out.rect(0, 0, edge, size.h); break;
    case 'up':    out.rect(0, size.h - edge, size.w, edge); break;
    case 'down':  out.rect(0, 0, size.w, edge); break;
  }
  out.clip();
  blit(out, b, size);

  // Feathered lip, drawn just behind the leading edge.
  const gradient = horizontal
    ? out.createLinearGradient(edgeStart(direction, size, edge), 0, edgeEnd(direction, size, edge, feather), 0)
    : out.createLinearGradient(0, edgeStart(direction, size, edge), 0, edgeEnd(direction, size, edge, feather));
  gradient.addColorStop(0, 'rgba(0,0,0,1)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  out.globalCompositeOperation = 'destination-out';
  out.fillStyle = gradient;
  out.fillRect(0, 0, size.w, size.h);
  out.restore();
};

/** Where the feather starts — at the leading edge of the revealed window. */
function edgeStart(direction: Direction, size: Size, edge: number): number {
  switch (direction) {
    case 'left': return size.w - edge;
    case 'right': return edge;
    case 'up': return size.h - edge;
    case 'down': return edge;
  }
}

function edgeEnd(direction: Direction, size: Size, edge: number, feather: number): number {
  switch (direction) {
    case 'left': return size.w - edge + feather;
    case 'right': return edge - feather;
    case 'up': return size.h - edge + feather;
    case 'down': return edge - feather;
  }
}

/**
 * A rushing zoom through the cut.
 *
 * The blur is radial by construction rather than by filter: the frame is drawn
 * several times at increasing scale and decreasing alpha, which smears detail
 * outward from the centre exactly the way a fast dolly does. `ctx.filter` is
 * not Baseline (see blur.ts) and a true radial blur is not one of its options
 * anyway.
 *
 * The accumulation happens on `scratch` because the output may be the canvas
 * being read from in the next step, and a composite that reads its own target
 * mid-pass produces garbage on some drivers.
 */
export const zoomBlur: TransitionFn = (out, a, b, progress, { size, scratch }) => {
  const p = clamp01(progress);
  const ctx = context2d(scratch);
  if (!ctx) throw new Error('zoomBlur: the scratch buffer has no 2D context.');

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, size.w, size.h);

  // Peaks at the midpoint: the smear is strongest exactly where the two scenes
  // are least recognisable, which is what hides the cut.
  const intensity = Math.sin(p * Math.PI);
  const steps = 6;
  const cx = size.w / 2;
  const cy = size.h / 2;

  const smear = (source: AnyCanvas, baseScale: number, alpha: number, spread: number): void => {
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const scale = baseScale * (1 + spread * t);
      const w = size.w * scale;
      const h = size.h * scale;
      ctx.globalAlpha = (alpha / steps) * (1 - t * 0.35);
      ctx.drawImage(source, cx - w / 2, cy - h / 2, w, h);
    }
  };

  // Outgoing pushes past the viewer; incoming arrives from beyond it.
  smear(a, 1 + 0.35 * p, 1 - p, 0.22 * intensity);
  smear(b, 1.35 - 0.35 * p, p, 0.22 * intensity);

  ctx.globalAlpha = 1;
  blit(out, scratch, size);
};

/**
 * Blown out to white at the midpoint.
 *
 * The ramp is squared on the way in and rooted on the way out so the flash
 * itself is brief — a linear ramp spends half the transition washed out, which
 * reads as a fault rather than as a beat.
 */
export const whiteFlash: TransitionFn = (out, a, b, progress, { size }) => {
  const p = clamp01(progress);
  blit(out, p < 0.5 ? a : b, size);

  const flash = p < 0.5 ? (p * 2) ** 2 : Math.sqrt(1 - (p - 0.5) * 2);

  out.save();
  out.globalAlpha = flash;
  out.fillStyle = '#ffffff';
  out.fillRect(0, 0, size.w, size.h);
  out.restore();
};

/**
 * The incoming scene grows into place while the outgoing one recedes.
 *
 * Both moves are small. A scale transition that starts the incoming scene at
 * zero looks like a slide deck; starting it at 0.88 reads as a camera move.
 */
export const scale: TransitionFn = (out, a, b, progress, { size }) => {
  const p = applyEase('outCubic', clamp01(progress));
  const cx = size.w / 2;
  const cy = size.h / 2;

  const draw = (source: AnyCanvas, factor: number, alpha: number): void => {
    const w = size.w * factor;
    const h = size.h * factor;
    out.globalAlpha = alpha;
    out.drawImage(source, cx - w / 2, cy - h / 2, w, h);
  };

  out.save();
  draw(a, 1 - 0.08 * p, 1);
  draw(b, 0.88 + 0.12 * p, p);
  out.restore();
};

export const TRANSITIONS: Record<TransitionKind, TransitionFn> = {
  cut,
  crossFade,
  push,
  wipe,
  zoomBlur,
  whiteFlash,
  scale,
};

export function transitionFn(kind: TransitionKind): TransitionFn {
  return TRANSITIONS[kind];
}

/** The seven of §6.4, in the order the inspector offers them. */
export const TRANSITION_KINDS: readonly TransitionKind[] = [
  'cut', 'crossFade', 'push', 'wipe', 'zoomBlur', 'whiteFlash', 'scale',
];

/** Only these two read `direction`; the picker hides the control for the rest. */
export function usesDirection(kind: TransitionKind): boolean {
  return kind === 'push' || kind === 'wipe';
}
