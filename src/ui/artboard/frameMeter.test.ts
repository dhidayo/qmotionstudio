import { describe, expect, it } from 'vitest';
import { FrameMeter } from './frameMeter';

const HZ60 = 1000 / 60;
const HZ120 = 1000 / 120;

/** A repeatable pseudo-random sequence, so a "5% of frames" case is the same every run. */
function random(seed = 1): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

/** Feeds `frames` gaps and says at which frame, if any, the meter first called it slow. */
function run(gap: (frame: number) => number, frames = 600): { slowAt: number; late: number; meter: FrameMeter } {
  const meter = new FrameMeter();
  let slowAt = -1;
  let late = 0;
  for (let frame = 0; frame < frames; frame++) {
    if (meter.push(gap(frame)) === 'late') late += 1;
    if (meter.takeSlow() && slowAt < 0) slowAt = frame;
  }
  return { slowAt, late, meter };
}

describe('the frame meter (D-154)', () => {
  it('leaves smooth playback alone at 60Hz and 120Hz', () => {
    const jitter = random();
    expect(run(() => HZ60 + (jitter() - 0.5)).slowAt).toBe(-1);
    expect(run(() => HZ120).slowAt).toBe(-1);
    // A 120Hz screen that sometimes manages only sixty frames a second is
    // still smooth: not worth a softer picture to reach more.
    const half = random(5);
    expect(run(() => (half() < 0.4 ? HZ60 : HZ120)).slowAt).toBe(-1);
    const sometimes = random(2);
    expect(run(() => (sometimes() < 0.05 ? 2 * HZ60 : HZ60)).slowAt).toBe(-1);
  });

  it('finds the stutter an average hides', () => {
    // Every fifth frame held twice: 48fps, an average gap of about 21ms.
    const { slowAt, late } = run((frame) => (frame % 5 === 4 ? 2 * HZ60 : HZ60));
    expect(slowAt).toBeGreaterThan(0);
    expect(late).toBeGreaterThan(50);
    const often = random(3);
    expect(run(() => (often() < 0.2 ? 2 * HZ60 : HZ60)).slowAt).toBeGreaterThan(0);
  });

  it('calls a steady thirty frames a second slow (D-112’s rule)', () => {
    const { slowAt, meter } = run(() => 2 * HZ60);
    expect(slowAt).toBeGreaterThan(0);
    expect(meter.intervalMs).toBeCloseTo(2 * HZ60, 1);
  });

  it('measures the screen, so a slow 120Hz screen is noticed in its own terms', () => {
    const often = random(4);
    // Hitches on a 120Hz screen: gaps of 8ms, and of 33ms on three frames in ten.
    expect(run(() => (often() < 0.3 ? 4 * HZ120 : HZ120)).slowAt).toBeGreaterThan(0);
    expect(run(() => HZ120).meter.intervalMs).toBeCloseTo(HZ120, 1);
  });

  it('waits for two slow windows, so one hitch is not a slow device', () => {
    // A burst of slow frames, then smooth again: one window at most.
    expect(run((frame) => (frame > 20 && frame < 70 ? 2 * HZ60 : HZ60)).slowAt).toBe(-1);
  });

  it('ignores a hidden tab or a breakpoint', () => {
    const { slowAt, meter } = run((frame) => (frame === 300 ? 2_000 : HZ60));
    expect(slowAt).toBe(-1);
    expect(meter.push(5_000)).toBe('ignored');
    expect(meter.push(0)).toBe('ignored');
  });

  it('notices a device drawing a few frames a second within seconds', () => {
    // Five frames a second, some gaps past a quarter of a second: twelve
    // seconds before a window of sixty frames closed, and a gap that long
    // used to count as a hidden tab and start again.
    const gaps = random(6);
    const { slowAt } = run(() => 150 + gaps() * 200, 60);
    expect(slowAt).toBeGreaterThan(0);
    // Two windows of at most two seconds each, after settling.
    expect(slowAt).toBeLessThanOrEqual(25);
  });

  it('settles after a reset before counting again: ten frames or 300ms', () => {
    const meter = new FrameMeter();
    meter.reset();
    const smooth = Array.from({ length: 11 }, () => meter.push(HZ60));
    expect(smooth.slice(0, 10).every((v) => v === 'ignored')).toBe(true);
    expect(smooth[10]).toBe('onTime');

    meter.reset();
    const slow = Array.from({ length: 8 }, () => meter.push(100));
    expect(slow.slice(0, 3).every((v) => v === 'ignored')).toBe(true);
    expect(slow[3]).toBe('late');
  });

  it('says slow once per occasion', () => {
    const meter = new FrameMeter();
    let said = 0;
    for (let frame = 0; frame < 140; frame++) {
      meter.push(2.2 * HZ60);
      if (meter.takeSlow()) said += 1;
    }
    expect(said).toBe(1);
    expect(meter.takeSlow()).toBe(false);
  });
});
