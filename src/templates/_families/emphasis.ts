import { createProps, resolveProps } from '@/core/anim/interpolate';
import type { Tracks } from '@/core/types';
import { appendAfter, clamp01, emphasise, FOCUS, linger, roomFor, sampled, turnFocus, type Pose, type Stage } from './kit';

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
 * Turns shared out along a row of `count` across `[fromMs, toMs]`, none
 * shorter than `minTurnMs`: when there is not time for every card to have a
 * turn — a short scene in a film — the turns go to cards spread evenly along
 * the row rather than flickering through all of them. The first turn eases in
 * over the 400ms before `fromMs`; the last holds to the end.
 */
export function turnsAlong(ms: number, index: number, count: number, fromMs: number, toMs: number, minTurnMs = 700): number {
  const visits = Math.max(1, Math.min(count, Math.floor((toMs - fromMs) / minTurnMs)));
  let f = 0;
  for (let k = 0; k < visits; k++) {
    if (Math.round(((k + 0.5) * count) / visits - 0.5) === index) f = Math.max(f, heldTurns(ms, k, visits, fromMs, toMs, { rampInMs: 400 }));
  }
  return f;
}

/**
 * A pose at rest — full size, undimmed — until `rampMs` before `settledMs`,
 * easing into `shown` (its emphasised self) by then: for cards that arrive
 * at their own size and only then start taking turns.
 */
export function settleInto(shown: Pose, ms: number, settledMs: number, rampMs = 400): Pose {
  const before = 1 - clamp01((ms - settledMs + rampMs) / rampMs);
  if (before <= 0) return shown;
  const l = (x: number, y: number): number => x + (y - x) * before;
  return { ...shown, scaleX: l(shown.scaleX ?? shown.scale ?? 1, 1), scaleY: l(shown.scaleY ?? shown.scale ?? 1, 1), shade: l(shown.shade ?? 0, 0) };
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

/** Where a layer's own tracks put it at `ms`, as a pose. */
export function poseOf(tracks: Tracks, ms: number): Pose {
  const p = resolveProps(tracks, ms, createProps());
  return { x: p.x, y: p.y, scaleX: p.scaleX, scaleY: p.scaleY, rotation: p.rotation, opacity: p.opacity, z: p.z, turnY: p.turnY, turnX: p.turnX, blur: p.blur, shade: p.shade };
}

/**
 * For hand-keyframed designs (D-157): a layer's tracks kept as written up to
 * `fromMs` — its entrance — then sampled with emphasis on top until `toMs`.
 * `apply` is given where the written tracks would have the layer at each
 * moment and returns it emphasised; the emphasis eases in over `rampMs` from
 * `fromMs`, so nothing jumps where the entrance hands over.
 */
export function emphasisedAfter(tracks: Tracks, fromMs: number, toMs: number, apply: (base: Pose, ms: number) => Pose, rampMs = 400): Tracks {
  if (toMs <= fromMs) return tracks;
  const after = sampled(fromMs, toMs, 70, (ms) => {
    const base = poseOf(tracks, ms);
    return mixPose(base, apply(base, ms), smoother((ms - fromMs) / rampMs));
  });
  const out: Tracks = { ...tracks };
  for (const [prop, keys] of Object.entries(after)) {
    const shifted = keys.map((key) => ({ ...key, t: key.t + fromMs }));
    const written = tracks[prop as keyof Tracks];
    out[prop as keyof Tracks] = written && written.length > 0 ? appendAfter(written, fromMs, shifted) : shifted;
  }
  return out;
}

/**
 * Turns that walk along a row and back — the middle card first, then on to
 * one end, back to the other and home — `minTurnMs` or longer each, so the
 * focus only ever moves to a neighbour. `start` is the card that goes first.
 */
export function walkTurns(ms: number, index: number, count: number, fromMs: number, toMs: number, start = Math.floor(count / 2), minTurnMs = 1_000): number {
  if (count <= 1) return 1;
  const cycle: number[] = [];
  for (let k = start; k < count; k++) cycle.push(k);
  // Starting from an end, the walk comes back only as far as the second card, so the first never has two turns in a row.
  for (let k = count - 2; k >= (start === 0 ? 1 : 0); k--) cycle.push(k);
  for (let k = 1; k < start; k++) cycle.push(k);
  const visits = Math.max(1, Math.floor((toMs - fromMs) / minTurnMs));
  let f = 0;
  for (let v = 0; v < visits; v++) {
    if (cycle[v % cycle.length] === index) f = Math.max(f, heldTurns(ms, v, visits, fromMs, toMs));
  }
  return f;
}
