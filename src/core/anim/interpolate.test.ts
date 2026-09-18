import { describe, expect, it } from 'vitest';
import type { Keyframe } from '@/core/types';
import { SPRINGS } from './spring';
import { createProps, DEFAULT_PROPS, resolveProps, sampleTrack } from './interpolate';

const kf = (t: number, v: number, ease: Keyframe['ease'] = 'linear'): Keyframe => ({ t, v, ease });

describe('sampleTrack — exactness', () => {
  const track = [kf(0, 0), kf(500, 100), kf(1000, 50)];

  it('returns the exact keyframe value at every keyframe time', () => {
    // Strict equality. This is the property M1 is judged on: a layer must land
    // precisely where its keyframe says, not within a rounding error of it.
    expect(sampleTrack(track, 0)).toBe(0);
    expect(sampleTrack(track, 500)).toBe(100);
    expect(sampleTrack(track, 1000)).toBe(50);
  });

  it('is exact at keyframe times under every easing, including springs', () => {
    const eases: Keyframe['ease'][] = [
      'linear', 'inQuad', 'outQuad', 'inOutQuad', 'inCubic', 'outCubic',
      'inOutCubic', 'outExpo', 'outBack', 'inOutSine', SPRINGS.bouncy,
    ];
    for (const ease of eases) {
      const t = [kf(100, 7), kf(900, 23, ease)];
      const label = typeof ease === 'string' ? ease : 'spring';
      expect(sampleTrack(t, 100), label).toBe(7);
      expect(sampleTrack(t, 900), label).toBe(23);
    }
  });

  it('holds before the first keyframe and after the last', () => {
    expect(sampleTrack(track, -9999)).toBe(0);
    expect(sampleTrack(track, 9999)).toBe(50);
  });

  it('interpolates linearly at the midpoint', () => {
    expect(sampleTrack([kf(0, 0), kf(1000, 100)], 500)).toBeCloseTo(50, 12);
  });

  it('interpolates downwards as exactly as upwards', () => {
    expect(sampleTrack([kf(0, 100), kf(1000, 0)], 250)).toBeCloseTo(75, 12);
  });
});

describe('sampleTrack — the ease belongs to the later keyframe', () => {
  it('uses the incoming keyframe easing, not the outgoing one', () => {
    // Segment 0→1000 eased by B's inQuad: at the midpoint, 0.5² = 0.25.
    const withEaseOnB = [kf(0, 0, 'linear'), kf(1000, 100, 'inQuad')];
    expect(sampleTrack(withEaseOnB, 500)).toBeCloseTo(25, 10);

    // The same easing placed on A must have no effect on this segment.
    const withEaseOnA = [kf(0, 0, 'inQuad'), kf(1000, 100, 'linear')];
    expect(sampleTrack(withEaseOnA, 500)).toBeCloseTo(50, 10);
  });

  it('applies a different ease to each segment independently', () => {
    const track = [kf(0, 0, 'linear'), kf(1000, 100, 'inQuad'), kf(2000, 200, 'outQuad')];
    expect(sampleTrack(track, 500)).toBeCloseTo(25, 10);
    // Second segment: 100 + 100 · outQuad(0.5) = 100 + 100 · 0.75
    expect(sampleTrack(track, 1500)).toBeCloseTo(175, 10);
  });
});

describe('sampleTrack — edge cases', () => {
  it('returns undefined for an empty track so the caller can use the identity value', () => {
    expect(sampleTrack([], 100)).toBeUndefined();
  });

  it('holds a single keyframe at every time', () => {
    const one = [kf(500, 42)];
    expect(sampleTrack(one, 0)).toBe(42);
    expect(sampleTrack(one, 500)).toBe(42);
    expect(sampleTrack(one, 100_000)).toBe(42);
  });

  it('treats coincident keyframes as a hard cut, later value winning', () => {
    const cut = [kf(0, 0), kf(500, 10), kf(500, 90), kf(1000, 100)];
    expect(sampleTrack(cut, 500)).toBe(90);
  });

  it('agrees with a linear scan across a long track', () => {
    // Guards the binary search: 64 keyframes, checked against the obvious
    // implementation at every millisecond.
    const long = Array.from({ length: 64 }, (_, i) => kf(i * 100, Math.sin(i) * 50));
    const first = long[0];
    const lastFrame = long[long.length - 1];
    if (!first || !lastFrame) throw new Error('fixture is empty');

    const scan = (t: number): number => {
      if (t <= 0) return first.v;
      if (t >= lastFrame.t) return lastFrame.v;
      for (let i = 0; i < long.length - 1; i++) {
        const a = long[i];
        const b = long[i + 1];
        if (!a || !b) continue;
        if (t >= a.t && t < b.t) return a.v + (b.v - a.v) * ((t - a.t) / (b.t - a.t));
      }
      return lastFrame.v;
    };
    for (let t = -50; t <= 6400; t += 7) {
      expect(sampleTrack(long, t), `t=${t}`).toBeCloseTo(scan(t), 10);
    }
  });

  it('sustains a spring overshoot past the target value', () => {
    const track = [kf(0, 0), kf(600, 100, SPRINGS.bouncy)];
    const peak = Math.max(...Array.from({ length: 121 }, (_, i) => sampleTrack(track, i * 5) ?? 0));
    expect(peak).toBeGreaterThan(100);
    expect(sampleTrack(track, 600)).toBe(100);
  });
});

describe('resolveProps', () => {
  it('falls back to identity values for untracked properties', () => {
    const props = resolveProps({}, 0);
    expect(props).toEqual(DEFAULT_PROPS);
    expect(props.opacity).toBe(1);
    expect(props.scaleX).toBe(1);
    expect(props.x).toBe(0);
  });

  it('resolves only the tracked properties and leaves the rest at identity', () => {
    const props = resolveProps({ opacity: [kf(0, 0), kf(1000, 1)] }, 500);
    expect(props.opacity).toBeCloseTo(0.5, 12);
    expect(props.scaleX).toBe(1);
    expect(props.rotation).toBe(0);
  });

  it('writes into a supplied scratch object instead of allocating', () => {
    const scratch = createProps();
    const result = resolveProps({ x: [kf(0, 10), kf(100, 20)] }, 100, scratch);
    expect(result).toBe(scratch);
    expect(scratch.x).toBe(20);
  });

  it('resets stale values in a reused scratch object', () => {
    // A scratch object reused across layers must not leak the previous layer's
    // values into a layer that does not track that property.
    const scratch = createProps();
    resolveProps({ x: [kf(0, 999)] }, 0, scratch);
    resolveProps({ opacity: [kf(0, 0.5)] }, 0, scratch);
    expect(scratch.x).toBe(0);
    expect(scratch.opacity).toBe(0.5);
  });
});
