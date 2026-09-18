import type { EaseName } from '@/core/types';

/**
 * Easing functions (§6.1).
 *
 * Every one maps [0,1] → [0,1] and is exact at both ends: f(0) === 0 and
 * f(1) === 1, not 1e-16 and 0.9999999. Keyframe interpolation depends on that
 * — a value that misses its own keyframe by a float epsilon shows up as a
 * one-pixel jitter on a slow pan, and it is miserable to track down later.
 *
 * outBack deliberately leaves [0,1] in the middle. That overshoot is the point.
 */

const BACK_C1 = 1.70158;
const BACK_C3 = BACK_C1 + 1;

export const EASINGS: Record<EaseName, (t: number) => number> = {
  linear: (t) => t,

  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) * (-2 * t + 2)) / 2),

  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - (1 - t) ** 3,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),

  // Guarded at both ends: 2**-0 is 1, which would make f(0) = 0 correctly, but
  // the t === 1 case is the one that would otherwise return 0.9990234375.
  outExpo: (t) => (t === 1 ? 1 : t === 0 ? 0 : 1 - 2 ** (-10 * t)),

  // Endpoints pinned: 1 - 2.70158 + 1.70158 does not cancel exactly in binary
  // floating point, and outBack(0) would otherwise be 2.2e-16 rather than 0.
  outBack: (t) =>
    t === 0 ? 0 : t === 1 ? 1 : 1 + BACK_C3 * (t - 1) ** 3 + BACK_C1 * (t - 1) ** 2,

  // Written as (1 - cos)/2 rather than -(cos - 1)/2. Algebraically identical,
  // but the negated form returns -0 at t = 0, which breaks the f(0) === 0
  // contract the interpolator relies on.
  inOutSine: (t) => (1 - Math.cos(Math.PI * t)) / 2,
};

export const EASE_NAMES = Object.keys(EASINGS) as readonly EaseName[];

export function isEaseName(value: string): value is EaseName {
  return value in EASINGS;
}

/** Clamps into [0,1] before easing; keyframe maths should never hand this a value outside. */
export function applyEase(name: EaseName, t: number): number {
  const clamped = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return EASINGS[name](clamped);
}
