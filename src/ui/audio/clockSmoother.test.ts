import { describe, expect, it } from 'vitest';
import { ClockSmoother } from './AudioEngine';

/** An iPhone's audio clock: it moves in 1024-sample steps at 48kHz, about every 21.3ms. */
function steppedClock(nowMs: number): number {
  const step = 1024 / 48_000;
  return Math.floor(nowMs / 1000 / step) * step;
}

describe('the audio clock between its steps (D-127)', () => {
  it('moves on every 60Hz frame instead of repeating and jumping', () => {
    const smoother = new ClockSmoother();
    const raw: number[] = [];
    const smooth: number[] = [];
    for (let frame = 0; frame < 120; frame++) {
      const now = 1_000 + frame * (1000 / 60);
      raw.push(steppedClock(now));
      smooth.push(smoother.read(steppedClock(now), now));
    }
    const repeats = (times: number[]): number => times.slice(1).filter((t, i) => t === times[i]).length;
    // The raw clock stands still on about a fifth of frames — the judder.
    expect(repeats(raw)).toBeGreaterThan(10);
    expect(repeats(smooth)).toBe(0);

    // And never strays from the audio by more than one step.
    smooth.forEach((t, i) => { expect(Math.abs(t - (raw[i] ?? 0))).toBeLessThan(0.05); });
    // Nor runs backwards.
    smooth.slice(1).forEach((t, i) => { expect(t).toBeGreaterThanOrEqual(smooth[i] ?? 0); });
  });

  it('starts afresh after a seek', () => {
    const smoother = new ClockSmoother();
    smoother.read(10, 0);
    smoother.reset();
    expect(smoother.read(2, 100)).toBe(2);
  });
});
