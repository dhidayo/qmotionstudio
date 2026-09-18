import type { SpringSpec } from '@/core/types';

/**
 * Sampled spring solver (§6.1).
 *
 * A spring is simulated once, at build time, into a lookup table — never solved
 * per frame. Two reasons: it makes spring evaluation the same cost as any other
 * easing (one array read and a lerp), and it makes the result deterministic,
 * which a per-frame integrator driven by variable frame deltas would not be.
 * Export and preview must agree exactly, and a spring that integrates against
 * wall-clock deltas cannot promise that.
 *
 * The simulation is a damped harmonic oscillator moving from 0 to 1:
 *
 *     a = (-k·(x - 1) - c·v) / m
 *
 * integrated with semi-implicit Euler at a fixed 1ms step, which is stable for
 * the stiffness range any interface animation uses.
 */

export const SPRING_LUT_SIZE = 256;

/** Fixed integration step, in seconds. */
const STEP_S = 0.001;

/** Settled when displacement and velocity are both under this, in units of the 0→1 range. */
const REST_EPSILON = 0.0005;

/** An undamped spring never settles; the simulation is capped rather than looping forever. */
const MAX_DURATION_S = 10;

export type BakedSpring = {
  readonly samples: Float32Array;
  /** How long the spring took to settle, in ms. Templates use it to size a keyframe gap. */
  readonly durationMs: number;
  /** Highest value reached. Above 1 means the spring overshoots. */
  readonly peak: number;
};

const cache = new Map<string, BakedSpring>();

function keyOf(spec: SpringSpec): string {
  return `${spec.stiffness}|${spec.damping}|${spec.mass}`;
}

/** Baked springs are cached across the session — the same preset is reused by many templates. */
export function bakeSpring(spec: SpringSpec): BakedSpring {
  const key = keyOf(spec);
  const hit = cache.get(key);
  if (hit) return hit;

  const baked = simulate(spec);
  cache.set(key, baked);
  return baked;
}

function simulate(spec: SpringSpec): BakedSpring {
  const mass = spec.mass > 0 ? spec.mass : 1;
  const { stiffness, damping } = spec;

  const trace: number[] = [0];
  let x = 0;
  let v = 0;
  let peak = 0;
  let settledFor = 0;
  let steps = 0;
  const maxSteps = Math.round(MAX_DURATION_S / STEP_S);

  // Step count rather than an accumulated float: adding 0.001 ten thousand
  // times lands at 10.000999…, not 10.
  while (steps < maxSteps) {
    const acceleration = (-stiffness * (x - 1) - damping * v) / mass;
    v += acceleration * STEP_S;
    x += v * STEP_S;
    steps++;
    trace.push(x);
    if (x > peak) peak = x;

    if (Math.abs(x - 1) < REST_EPSILON && Math.abs(v) < REST_EPSILON) {
      settledFor += STEP_S;
      // Require a sustained rest, or a spring crossing its target at speed
      // would register as settled the instant it passes through.
      if (settledFor >= 0.02) break;
    } else {
      settledFor = 0;
    }
  }

  const samples = new Float32Array(SPRING_LUT_SIZE);
  const lastIndex = trace.length - 1;
  for (let i = 0; i < SPRING_LUT_SIZE; i++) {
    const position = (i / (SPRING_LUT_SIZE - 1)) * lastIndex;
    const low = Math.floor(position);
    const high = Math.min(low + 1, lastIndex);
    const fraction = position - low;
    samples[i] = (trace[low] ?? 0) * (1 - fraction) + (trace[high] ?? 1) * fraction;
  }

  // Pin the ends. The simulation stops within REST_EPSILON of 1, not exactly
  // at it, and a layer that lands at 0.9996 of its keyframe is a visible bug.
  samples[0] = 0;
  samples[SPRING_LUT_SIZE - 1] = 1;

  return { samples, durationMs: steps * STEP_S * 1000, peak: Math.max(peak, 1) };
}

/** Evaluates a baked spring at normalised time t ∈ [0,1]. */
export function sampleSpring(baked: BakedSpring, t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;

  const position = t * (SPRING_LUT_SIZE - 1);
  const low = Math.floor(position);
  const high = Math.min(low + 1, SPRING_LUT_SIZE - 1);
  const fraction = position - low;

  const a = baked.samples[low] ?? 0;
  const b = baked.samples[high] ?? 1;
  return a + (b - a) * fraction;
}

export function clearSpringCache(): void {
  cache.clear();
}

/** Presets templates can reach for instead of inventing physics per use. */
export const SPRINGS = {
  gentle: { kind: 'spring', stiffness: 120, damping: 20, mass: 1 },
  snappy: { kind: 'spring', stiffness: 260, damping: 24, mass: 1 },
  bouncy: { kind: 'spring', stiffness: 200, damping: 12, mass: 1 },
  // Critically damped: c = 2·√(k·m) = 40. Arrives fast with no overshoot at all.
  stiff: { kind: 'spring', stiffness: 400, damping: 40, mass: 1 },
} as const satisfies Record<string, SpringSpec>;
