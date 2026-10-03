/**
 * Deterministic randomness for effects (D-100).
 *
 * The renderer is a pure function of time (§3A): the same frame must come out
 * the same in the preview and in the export, and the same on the hundredth
 * play as on the first. So nothing here keeps state. A snowflake's position is
 * not *updated* each frame — it is *computed* from its index, the effect's
 * seed and the time, which is also what lets the playhead jump anywhere and
 * land on exactly the frame the export will contain.
 */

/** A 32-bit hash of a string, for turning an effect's id into its seed. */
export function hashString(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A value in [0, 1), fixed for each (seed, index, salt). */
export function rand(seed: number, index: number, salt = 0): number {
  let h = (seed ^ Math.imul(index + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(salt + 0x632be5ab, 0xc2b2ae35)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** As `rand`, in [low, high). */
export function between(seed: number, index: number, salt: number, low: number, high: number): number {
  return low + (high - low) * rand(seed, index, salt);
}

/**
 * Smooth value noise in [-1, 1]: the same input always gives the same output,
 * and nearby inputs give nearby outputs — which is what makes a shake feel
 * like a hand and not like static.
 */
export function noise(seed: number, x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const a = rand(seed, i) * 2 - 1;
  const b = rand(seed, i + 1) * 2 - 1;
  const u = f * f * (3 - 2 * f);
  return a + (b - a) * u;
}

/** Layered noise: a slow swell with a little finer movement on top. */
export function fbm(seed: number, x: number): number {
  return noise(seed, x) * 0.65 + noise(seed + 101, x * 2.1) * 0.25 + noise(seed + 202, x * 4.3) * 0.1;
}

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0 || 1));
  return t * t * (3 - 2 * t);
}

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** The positive remainder, so things that wrap round the frame never go negative. */
export function wrap(value: number, size: number): number {
  if (size <= 0) return 0;
  const r = value % size;
  return r < 0 ? r + size : r;
}

/**
 * How present an effect is at time `t` of a `dur`-long window: rises over the
 * first `fadeMs`, holds, falls over the last. An effect that snaps on and off
 * at its ends looks like an edit mistake, not like weather.
 */
export function envelope(t: number, dur: number, fadeMs: number): number {
  if (t < 0 || t > dur) return 0;
  const fade = Math.min(fadeMs, dur / 3);
  if (fade <= 0) return 1;
  return Math.min(smoothstep(0, fade, t), 1 - smoothstep(dur - fade, dur, t));
}
