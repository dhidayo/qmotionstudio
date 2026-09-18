import type { AnimatedProp, Ease, Keyframe, Tracks } from '@/core/types';
import { applyEase } from './easings';
import { bakeSpring, sampleSpring } from './spring';

/**
 * Keyframe sampling (§6.1).
 *
 * Two rules, both load-bearing:
 *   - a value interpolates using the ease on the **later** keyframe;
 *   - values hold before the first keyframe and after the last.
 *
 * Exactness at keyframe times falls out of the easing contract rather than
 * being special-cased: at t === a.t the normalised position is 0, every easing
 * returns exactly 0 there, and `a.v + (b.v - a.v) * 0` is exactly `a.v`. That
 * is why easings.ts is strict about its endpoints.
 */

export type MutableProps = Record<AnimatedProp, number>;

/** Identity values — what a layer looks like with no tracks at all. */
export const DEFAULT_PROPS: Readonly<MutableProps> = Object.freeze({
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  opacity: 1,
  blur: 0,
  letterSpacing: 0,
  clipProgress: 1,
  cornerRadius: 0,
});

export const ANIMATED_PROPS = Object.keys(DEFAULT_PROPS) as readonly AnimatedProp[];

export function createProps(): MutableProps {
  return { ...DEFAULT_PROPS };
}

export function evalEase(ease: Ease, u: number): number {
  return typeof ease === 'string' ? applyEase(ease, u) : sampleSpring(bakeSpring(ease), u);
}

/**
 * Samples one track at a time in milliseconds relative to the layer's start
 * (D-005). Returns undefined for an empty track so the caller can fall back to
 * the property's identity value rather than guessing at 0.
 */
export function sampleTrack(keyframes: readonly Keyframe[], tMs: number): number | undefined {
  const count = keyframes.length;
  if (count === 0) return undefined;

  const first = keyframes[0];
  if (!first) return undefined;
  if (count === 1 || tMs <= first.t) return first.v;

  const last = keyframes[count - 1];
  if (!last) return undefined;
  if (tMs >= last.t) return last.v;

  // Binary search for the bracketing pair. Most tracks are short enough that a
  // linear scan would do, but kinetic text tracks are not, and this is the
  // hottest function in the renderer.
  let low = 0;
  let high = count - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    const midFrame = keyframes[mid];
    if (!midFrame) break;
    if (midFrame.t <= tMs) low = mid;
    else high = mid;
  }

  const a = keyframes[low];
  const b = keyframes[high];
  if (!a || !b) return last.v;

  const span = b.t - a.t;
  // Coincident keyframes are a legitimate way to express a hard cut; the later
  // one wins rather than dividing by zero.
  if (span <= 0) return b.v;

  const eased = evalEase(b.ease, (tMs - a.t) / span);
  return a.v + (b.v - a.v) * eased;
}

/**
 * Resolves every animated property at a point in time.
 *
 * Takes an optional scratch object so the render loop can avoid allocating one
 * per layer per frame — with nested groups that is thousands of short-lived
 * objects a second, all of which the collector then has to walk.
 */
export function resolveProps(tracks: Tracks, tMs: number, out?: MutableProps): MutableProps {
  const target = out ?? createProps();

  for (const prop of ANIMATED_PROPS) {
    const track = tracks[prop];
    const sampled = track === undefined ? undefined : sampleTrack(track, tMs);
    target[prop] = sampled ?? DEFAULT_PROPS[prop];
  }

  return target;
}
