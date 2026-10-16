import { describe, expect, it } from 'vitest';
import { sampleTrack } from '@/core/anim/interpolate';
import { appendAfter, emphasise, focusCurve, FOCUS, kf, linger, roomFor, sampled, serpentine, turnFocus, wrapSteps } from './kit';

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

describe('emphasis (D-157)', () => {
  it('focusCurve is 1 at the focus point, 0 at reach, and symmetric', () => {
    expect(focusCurve(0)).toBe(1);
    expect(focusCurve(FOCUS.reach)).toBe(0);
    expect(focusCurve(5)).toBe(0);
    for (const d of [0.1, 0.3, 0.5]) expect(focusCurve(-d)).toBeCloseTo(focusCurve(d), 12);
    expect(focusCurve(0.2)).toBeGreaterThan(focusCurve(0.4));
  });

  it('linger keeps whole steps, repeats every step and never runs backwards', () => {
    for (const k of [0, 1, 2, 7]) expect(linger(k)).toBeCloseTo(k, 12);
    for (const p of [0.13, 0.5, 0.91]) expect(linger(p + 1)).toBeCloseTo(linger(p) + 1, 12);
    let previous = linger(0);
    for (let p = 0.01; p <= 3; p += 0.01) {
      const next = linger(p, 1);
      expect(next).toBeGreaterThanOrEqual(previous - 1e-12);
      previous = next;
    }
  });

  it('wrapSteps puts an offset on the near side of a loop', () => {
    expect(wrapSteps(5, 6)).toBe(-1);
    expect(wrapSteps(-4, 6)).toBe(2);
    expect(wrapSteps(2.5, 6)).toBe(2.5);
    expect(wrapSteps(-3, 6)).toBe(-3);
  });

  it('turnFocus hands over at 0.5 and always has one card in focus inside the window', () => {
    const count = 4;
    const from = 1000;
    const to = 5000;
    // At a boundary between turns both cards are half in focus.
    expect(turnFocus(2000, 0, count, from, to)).toBeCloseTo(0.5, 6);
    expect(turnFocus(2000, 1, count, from, to)).toBeCloseTo(0.5, 6);
    for (let ms = from; ms <= to; ms += 37) {
      const best = Math.max(...Array.from({ length: count }, (_, i) => turnFocus(ms, i, count, from, to)));
      expect(best, `at ${ms}ms`).toBeGreaterThanOrEqual(0.5 - 1e-9);
    }
    // Outside the window nobody is in focus unless it wraps.
    expect(turnFocus(500, 0, count, from, to)).toBe(0);
    expect(turnFocus(500, 0, count, 0, 4000, 0.22, true)).toBe(1);
    expect(turnFocus(3500, 3, count, 0, 4000, 0.22, true)).toBe(1);
    // A loop: the last turn hands back to the first.
    expect(turnFocus(4000, 0, count, 0, 4000, 0.22, true)).toBeCloseTo(0.5, 6);
    expect(turnFocus(4000, 3, count, 0, 4000, 0.22, true)).toBeCloseTo(0.5, 6);
  });

  it('emphasise grows, faces and lifts the focused card and darkens the rest', () => {
    const pose = { x: 10, y: 20, scale: 0.9, rotation: 12, turnY: 30, z: 1, opacity: 0.7, blur: 4 };
    const focused = emphasise(pose, 1, 1.4, { straighten: 1 });
    expect(focused.scaleX).toBeCloseTo(1.4);
    expect(focused.scaleY).toBeCloseTo(1.4);
    expect(focused.turnY).toBe(0);
    expect(focused.rotation).toBe(0);
    expect(focused.opacity).toBe(1);
    expect(focused.blur).toBe(0);
    expect(focused.shade).toBe(0);
    expect(focused.z).toBe(1 + FOCUS.lift);
    const away = emphasise(pose, 0, 1.4);
    expect(away.scaleX).toBeCloseTo(0.9 * FOCUS.rest);
    expect(away.shade).toBeCloseTo(FOCUS.dim);
    expect(away.rotation).toBe(12);
    expect(away.x).toBe(10);
  });

  it('roomFor keeps the focused card inside the stage', () => {
    const stage = { cx: 500, cy: 500, w: 1000, h: 600 };
    // Centred, a 400×400 card can grow until it touches the top and bottom: 600 / 400.
    expect(roomFor(stage, { x: 500, y: 500 }, { w: 400, h: 400 }, 2)).toBeCloseTo(1.5);
    // Never asks for more than wanted, never less than 1.
    expect(roomFor(stage, { x: 500, y: 500 }, { w: 100, h: 100 })).toBe(FOCUS.peak);
    expect(roomFor(stage, { x: 990, y: 500 }, { w: 400, h: 400 })).toBe(1);
  });

  it('serpentine snakes across a grid', () => {
    const order = [0, 1, 2].flatMap((row) => [0, 1, 2].map((col) => serpentine(col, row, 3)));
    expect(order).toEqual([0, 1, 2, 5, 4, 3, 6, 7, 8]);
  });

  it('appendAfter keeps the entrance, holds, then continues', () => {
    const track = [kf(0, 0), kf(400, 100), kf(900, 120)];
    const out = appendAfter(track, 600, [kf(300, 5), kf(1000, 140), kf(1400, 100)]);
    expect(out.map((k) => k.t)).toEqual([0, 400, 600, 1000, 1400]);
    expect(out[2]?.v).toBe(100);
  });

  it('sampled emits a shade track only when something is darkened', () => {
    expect(sampled(0, 1000, 100, (ms) => ({ x: ms, y: 0 })).shade).toBeUndefined();
    const tracks = sampled(0, 1000, 100, (ms) => ({ x: ms, y: 0, shade: ms / 2000 }));
    expect(sampleTrack(tracks.shade ?? [], 1000)).toBeCloseTo(0.5);
  });
});
