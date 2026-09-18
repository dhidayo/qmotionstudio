import { describe, expect, it } from 'vitest';
import { PreviewClock } from './clock';

describe('PreviewClock', () => {
  it('does not advance while paused', () => {
    const clock = new PreviewClock(1000);
    clock.tick(500);
    expect(clock.timeMs).toBe(0);
  });

  it('advances by the delta while playing', () => {
    const clock = new PreviewClock(1000);
    clock.play();
    clock.tick(16);
    expect(clock.timeMs).toBeCloseTo(16, 6);
  });

  it('wraps at the duration when looping', () => {
    const clock = new PreviewClock(1000);
    clock.play();
    clock.seek(990);
    clock.tick(20);
    expect(clock.timeMs).toBeCloseTo(10, 6);
  });

  it('stops at the duration when not looping', () => {
    const clock = new PreviewClock(1000, { loop: false });
    clock.play();
    clock.seek(990);
    clock.tick(50);
    expect(clock.timeMs).toBe(1000);
    expect(clock.playing).toBe(false);
  });

  it('clamps a huge delta so a backgrounded tab does not leap on refocus', () => {
    const clock = new PreviewClock(10_000);
    clock.play();
    clock.tick(8000);
    expect(clock.timeMs).toBe(100);
  });

  it('clamps seeks to the timeline', () => {
    const clock = new PreviewClock(1000);
    clock.seek(-50);
    expect(clock.timeMs).toBe(0);
    clock.seek(5000);
    expect(clock.timeMs).toBe(1000);
  });

  it('pulls the playhead back in when the duration shrinks beneath it', () => {
    const clock = new PreviewClock(10_000);
    clock.seek(9000);
    clock.setDuration(2000);
    expect(clock.timeMs).toBeLessThanOrEqual(2000);
  });
});
