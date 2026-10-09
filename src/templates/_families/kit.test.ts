import { describe, expect, it } from 'vitest';
import { sampleTrack } from '@/core/anim/interpolate';
import { sampled } from './kit';

describe('sampled motion (D-119)', () => {
  it('turns a wrap into a cut instead of a streak across the frame', () => {
    // A card moving right that wraps from 1000 back to 0 at 500ms.
    const tracks = sampled(0, 1000, 100, (ms) => ({ x: (ms * 2) % 1000, y: 0 }), 300);
    const x = tracks.x ?? [];
    // Just before the wrap it is still at the right; just after, at the left.
    expect(sampleTrack(x, 499)).toBeGreaterThanOrEqual(800);
    expect(sampleTrack(x, 501)).toBeLessThan(100);
    // Never in the middle of the frame around the wrap.
    for (let t = 450; t <= 550; t += 5) {
      const v = sampleTrack(x, t) ?? 0;
      expect(v < 200 || v > 750, `x at ${t}ms is ${v}`).toBe(true);
    }
  });

  it('leaves out properties that never move', () => {
    const tracks = sampled(0, 1000, 100, (ms) => ({ x: ms, y: 0 }));
    expect(Object.keys(tracks).sort()).toEqual(['x', 'y']);
  });
});
