import { beforeEach, describe, expect, it } from 'vitest';
import type { SpringSpec } from '@/core/types';
import { bakeSpring, clearSpringCache, sampleSpring, SPRING_LUT_SIZE, SPRINGS } from './spring';

const critically: SpringSpec = { kind: 'spring', stiffness: 170, damping: 26, mass: 1 };

beforeEach(() => { clearSpringCache(); });

describe('bakeSpring', () => {
  it('starts at exactly 0 and ends at exactly 1', () => {
    for (const spec of Object.values(SPRINGS)) {
      const baked = bakeSpring(spec);
      expect(sampleSpring(baked, 0)).toBe(0);
      expect(sampleSpring(baked, 1)).toBe(1);
    }
  });

  it('fills the whole lookup table', () => {
    const baked = bakeSpring(critically);
    expect(baked.samples.length).toBe(SPRING_LUT_SIZE);
    expect([...baked.samples].every(Number.isFinite)).toBe(true);
  });

  it('settles in a plausible time rather than running to the cap', () => {
    const baked = bakeSpring(critically);
    expect(baked.durationMs).toBeGreaterThan(100);
    expect(baked.durationMs).toBeLessThan(3000);
  });

  it('overshoots when underdamped and does not when critically damped', () => {
    // Critical damping is c = 2·√(k·m). Below it the spring rings, at or above
    // it the spring arrives without crossing its target.
    expect(bakeSpring(SPRINGS.bouncy).peak).toBeGreaterThan(1.05);
    expect(bakeSpring(SPRINGS.stiff).peak).toBeLessThan(1.001);
  });

  it('caps an undamped spring instead of looping forever', () => {
    const baked = bakeSpring({ kind: 'spring', stiffness: 100, damping: 0, mass: 1 });
    expect(baked.durationMs).toBeLessThanOrEqual(10_000);
    expect(sampleSpring(baked, 1)).toBe(1);
  });

  it('is deterministic — the same spec bakes to identical samples', () => {
    const a = bakeSpring(critically);
    clearSpringCache();
    const b = bakeSpring(critically);
    expect([...a.samples]).toEqual([...b.samples]);
  });

  it('returns the cached bake for a repeated spec', () => {
    expect(bakeSpring(critically)).toBe(bakeSpring(critically));
  });

  it('survives a zero or negative mass rather than dividing by zero', () => {
    const baked = bakeSpring({ kind: 'spring', stiffness: 170, damping: 26, mass: 0 });
    expect([...baked.samples].every(Number.isFinite)).toBe(true);
  });
});

describe('sampleSpring', () => {
  it('clamps outside [0,1]', () => {
    const baked = bakeSpring(critically);
    expect(sampleSpring(baked, -1)).toBe(0);
    expect(sampleSpring(baked, 2)).toBe(1);
  });

  it('rises monotonically for an overdamped spring', () => {
    // Explicitly overdamped (c = 60 > 2·√400 = 40) so this tests the property
    // rather than whatever a preset happens to be tuned to today.
    const baked = bakeSpring({ kind: 'spring', stiffness: 400, damping: 60, mass: 1 });
    let previous = -Infinity;
    for (let i = 0; i <= 100; i++) {
      const v = sampleSpring(baked, i / 100);
      expect(v).toBeGreaterThanOrEqual(previous - 1e-6);
      previous = v;
    }
  });

  it('is smooth — no sample jumps more than a few percent from its neighbour', () => {
    const baked = bakeSpring(SPRINGS.bouncy);
    let previous = sampleSpring(baked, 0);
    for (let i = 1; i <= 200; i++) {
      const v = sampleSpring(baked, i / 200);
      expect(Math.abs(v - previous)).toBeLessThan(0.1);
      previous = v;
    }
  });
});
