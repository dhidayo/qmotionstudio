import { describe, expect, it } from 'vitest';
import { applyEase, EASE_NAMES, EASINGS } from './easings';

describe('easings', () => {
  it('covers exactly the set the spec names', () => {
    expect([...EASE_NAMES].sort()).toEqual(
      [
        'inCubic', 'inOutCubic', 'inOutQuad', 'inOutSine', 'inQuad',
        'linear', 'outBack', 'outCubic', 'outExpo', 'outQuad',
      ].sort(),
    );
  });

  it('is exact at both ends — not approximately', () => {
    for (const name of EASE_NAMES) {
      // Strict equality on purpose. 0.9999999999 would pass toBeCloseTo and
      // still leave a layer a pixel short of where its keyframe says it is.
      expect(EASINGS[name](0), `${name}(0)`).toBe(0);
      expect(EASINGS[name](1), `${name}(1)`).toBe(1);
    }
  });

  it('is monotonic except for the one ease that is meant to overshoot', () => {
    for (const name of EASE_NAMES) {
      if (name === 'outBack') continue;
      let previous = -Infinity;
      for (let i = 0; i <= 100; i++) {
        const v = EASINGS[name](i / 100);
        expect(v, `${name} at ${i / 100}`).toBeGreaterThanOrEqual(previous - 1e-12);
        previous = v;
      }
    }
  });

  it('stays inside [0,1] except for outBack', () => {
    for (const name of EASE_NAMES) {
      if (name === 'outBack') continue;
      for (let i = 0; i <= 100; i++) {
        const v = EASINGS[name](i / 100);
        expect(v, `${name} at ${i / 100}`).toBeGreaterThanOrEqual(-1e-12);
        expect(v, `${name} at ${i / 100}`).toBeLessThanOrEqual(1 + 1e-12);
      }
    }
  });

  it('overshoots past 1 in outBack, which is the whole point of it', () => {
    const peak = Math.max(...Array.from({ length: 101 }, (_, i) => EASINGS.outBack(i / 100)));
    expect(peak).toBeGreaterThan(1.05);
  });

  it('passes through the midpoint for symmetric easings', () => {
    expect(EASINGS.linear(0.5)).toBe(0.5);
    expect(EASINGS.inOutQuad(0.5)).toBeCloseTo(0.5, 12);
    expect(EASINGS.inOutCubic(0.5)).toBeCloseTo(0.5, 12);
    expect(EASINGS.inOutSine(0.5)).toBeCloseTo(0.5, 12);
  });

  it('clamps out-of-range input rather than extrapolating', () => {
    expect(applyEase('outCubic', -5)).toBe(0);
    expect(applyEase('outCubic', 5)).toBe(1);
  });
});
