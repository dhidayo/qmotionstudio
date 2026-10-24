import { clamp01, emphasise, FOCUS, linger, roomFor, turnFocus, type Pose, type Stage } from './kit';

/**
 * Emphasis helpers for the photo families (D-157), beside the shared ones in
 * `kit.ts`: a focus that takes turns without a snap at the ends of its
 * window, a clock that lingers wherever the focus point is, and a focused
 * card that steps inward as it grows so it never leaves its stage.
 */

/** A card's unscaled size, for working out how large it may grow. */
export type Box = { readonly w: number; readonly h: number };

/** Ken Perlin's smootherstep, as `kit.ts` uses for its focus curves. */
export function smoother(x: number): number {
  const u = clamp01(x);
  return u * u * u * (u * (u * 6 - 15) + 10);
}

/** The fractional part, always in [0, 1). */
export const frac = (v: number): number => ((v % 1) + 1) % 1;

/**
 * Turn focus inside a window whose ends hold. `turnFocus` hands its first
 * and last cards over at 0.5 at the window's edges and drops to nothing
 * outside it — a visible snap. Here the first card is fully in focus from
 * `rampInMs` before the window opens (easing in over that ramp; 0 holds it
 * from the very start) and the last stays in focus for `rampOutMs` after it
 * closes, easing out over the last part of that.
 */
export function heldTurns(
  ms: number,
  index: number,
  count: number,
  fromMs: number,
  toMs: number,
  options: { readonly edge?: number; readonly rampInMs?: number; readonly rampOutMs?: number } = {},
): number {
  const edge = options.edge ?? 0.22;
  const turn = (toMs - fromMs) / Math.max(1, count);
  const rampIn = options.rampInMs ?? 0;
  const rampOut = options.rampOutMs ?? Number.POSITIVE_INFINITY;
  const easeIn = rampIn > 0 ? smoother((ms - fromMs + rampIn) / rampIn) : 1;
  const easeOut = Number.isFinite(rampOut) && rampOut > 0 ? smoother((toMs + rampOut - ms) / Math.min(rampOut, 400)) : 1;
  if (count <= 1) return Math.min(easeIn, easeOut);
  if (index === 0 && ms < fromMs + turn / 2) return easeIn;
  if (index === count - 1 && ms > toMs - turn / 2) return easeOut;
  return turnFocus(ms, index, count, fromMs, toMs, edge);
}

/**
 * Turns round a loop, starting in the middle of the first card's turn, so
 * the first card is fully in focus at the start and again at the end — a
 * loop with no seam in its emphasis.
 */
export function loopTurns(ms: number, index: number, count: number, durationMs: number, edge = 0.22): number {
  const turn = durationMs / Math.max(1, count);
  return turnFocus(ms + turn / 2, index, count, 0, durationMs, edge, true);
}

/**
 * `linger` with its pauses moved: a clock in steps that lingers wherever
 * `position + offset` is a whole number — for a path whose focus point is not
 * where the cards sit at whole steps (an odd number of cards either side of
 * the middle, say).
 */
export function lingerAt(position: number, offset: number, hold?: number): number {
  return linger(position + offset, hold) - offset;
}

/**
 * Where a card of `box` (unscaled) at `at` moves to so that, at `peak` size,
 * it lies inside `stage`: the nearest such point. A card already clear of the
 * edges stays where it is; a card at the edge of a lattice steps inward.
 */
export function roomyPoint(stage: Stage, at: { x: number; y: number }, box: Box, peak: number): { x: number; y: number } {
  const half = { w: (box.w * peak) / 2, h: (box.h * peak) / 2 };
  const fit = (v: number, centre: number, size: number, h: number): number =>
    h * 2 >= size ? centre : Math.min(Math.max(v, centre - size / 2 + h), centre + size / 2 - h);
  return { x: fit(at.x, stage.cx, stage.w, half.w), y: fit(at.y, stage.cy, stage.h, half.h) };
}

/**
 * Emphasis that keeps the card inside `stage` (D-157): as `f` rises the card
 * grows toward `wanted` (less where the stage is too small for it) and steps
 * inward just far enough that, fully in focus, it still lies inside — never
 * over the headline nor past the content floor.
 */
export function focusIn(
  pose: Pose,
  f: number,
  stage: Stage,
  box: Box,
  wanted: number = FOCUS.peak,
  options: { readonly straighten?: number; readonly keepTurn?: boolean } = {},
): Pose {
  const k = clamp01(f);
  const upright = turned(box, (pose.rotation ?? 0) * (1 - (options.straighten ?? 0)));
  const peak = roomFor(stage, roomyPoint(stage, pose, upright, wanted), upright, wanted);
  const grown = emphasise(pose, k, peak, options.straighten === undefined ? {} : { straighten: options.straighten });
  // Kept inside at the size it has now, not only at the peak, so a card on
  // its way in never pokes past the edge; eased in early so the step inward
  // has no kink.
  const size = Math.max(grown.scaleX ?? 1, grown.scaleY ?? 1);
  const at = roomyPoint(stage, pose, turned(box, grown.rotation ?? 0), size);
  const g = smoother(k * 2.5);
  const out = { ...grown, x: pose.x + (at.x - pose.x) * g, y: pose.y + (at.y - pose.y) * g };
  // A card turning over as part of the motion (a flip) keeps turning.
  return options.keepTurn === true ? { ...out, turnY: pose.turnY ?? 0, turnX: pose.turnX ?? 0 } : out;
}

/** The upright box a card of `box` takes when rotated by `degrees`. */
export function turned(box: Box, degrees: number): Box {
  const r = (degrees * Math.PI) / 180;
  const c = Math.abs(Math.cos(r));
  const s = Math.abs(Math.sin(r));
  return { w: box.w * c + box.h * s, h: box.w * s + box.h * c };
}

/** Two poses blended, every property including the emphasis ones. */
export function mixPose(a: Pose, b: Pose, u: number): Pose {
  const l = (x: number, y: number): number => x + (y - x) * u;
  return {
    x: l(a.x, b.x),
    y: l(a.y, b.y),
    scaleX: l(a.scaleX ?? a.scale ?? 1, b.scaleX ?? b.scale ?? 1),
    scaleY: l(a.scaleY ?? a.scale ?? 1, b.scaleY ?? b.scale ?? 1),
    rotation: l(a.rotation ?? 0, b.rotation ?? 0),
    opacity: l(a.opacity ?? 1, b.opacity ?? 1),
    z: l(a.z ?? 0, b.z ?? 0),
    turnY: l(a.turnY ?? 0, b.turnY ?? 0),
    turnX: l(a.turnX ?? 0, b.turnX ?? 0),
    blur: l(a.blur ?? 0, b.blur ?? 0),
    shade: l(a.shade ?? 0, b.shade ?? 0),
  };
}

/** A pose's size multiplied, for presence (an arrival, a departure) applied on top of emphasis. */
export function scaled(pose: Pose, k: number): Pose {
  return { ...pose, scaleX: (pose.scaleX ?? pose.scale ?? 1) * k, scaleY: (pose.scaleY ?? pose.scale ?? 1) * k };
}
