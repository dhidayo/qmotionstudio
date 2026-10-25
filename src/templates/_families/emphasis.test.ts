import { describe, expect, it } from 'vitest';
import { FOCUS, kf, linger } from './kit';
import { emphasisedAfter, focusIn, frac, heldTurns, lingerAt, loopTurns, mixPose, poseOf, roomyPoint, scaled, settleInto, turned, turnsAlong, walkTurns } from './emphasis';

const stage = { cx: 500, cy: 500, w: 800, h: 600 };
const box = { w: 200, h: 260 };

describe('heldTurns (D-157)', () => {
  it('holds the first card from the start and the last to the end, with no gap between', () => {
    expect(heldTurns(0, 0, 4, 1000, 9000)).toBe(1);
    expect(heldTurns(500, 0, 4, 1000, 9000)).toBe(1);
    expect(heldTurns(12_000, 3, 4, 1000, 9000)).toBe(1);
    for (let ms = 0; ms <= 12_000; ms += 50) {
      const top = Math.max(...[0, 1, 2, 3].map((i) => heldTurns(ms, i, 4, 1000, 9000)));
      expect(top).toBeGreaterThanOrEqual(0.5 - 1e-9);
    }
  });

  it('eases the first card in over its ramp and the last out', () => {
    expect(heldTurns(0, 0, 4, 1000, 9000, { rampInMs: 400 })).toBe(0);
    expect(heldTurns(800, 0, 4, 1000, 9000, { rampInMs: 400 })).toBeCloseTo(0.5, 5);
    expect(heldTurns(9500, 3, 4, 1000, 9000, { rampOutMs: 400 })).toBe(0);
  });
});

describe('loopTurns', () => {
  it('starts and ends on the first card, so a loop has no seam', () => {
    expect(loopTurns(0, 0, 5, 10_000)).toBe(1);
    expect(loopTurns(10_000, 0, 5, 10_000)).toBe(1);
    expect(loopTurns(2_000, 1, 5, 10_000)).toBe(1);
    expect(loopTurns(1_000, 0, 5, 10_000)).toBeCloseTo(0.5, 5);
    expect(loopTurns(1_000, 1, 5, 10_000)).toBeCloseTo(0.5, 5);
  });
});

describe('lingerAt', () => {
  it('lingers where position + offset is whole, keeping those points', () => {
    expect(lingerAt(2.5, 0.5)).toBeCloseTo(2.5, 10);
    expect(lingerAt(3.5, -0.5)).toBeCloseTo(3.5, 10);
    // Slow there: a small step moves less than it would without lingering.
    expect(lingerAt(2.501, 0.5) - lingerAt(2.5, 0.5)).toBeCloseTo(0.001 * (1 - FOCUS.hold), 6);
    expect(lingerAt(1.2, 0)).toBeCloseTo(linger(1.2), 10);
  });

  it('never runs backwards', () => {
    for (let x = -3; x < 3; x += 0.01) expect(lingerAt(x + 0.01, 0.37)).toBeGreaterThanOrEqual(lingerAt(x, 0.37));
  });
});

describe('roomyPoint and focusIn', () => {
  it('leaves a card that fits where it is and moves one at the edge just inside', () => {
    expect(roomyPoint(stage, { x: 500, y: 500 }, box, 1.45)).toEqual({ x: 500, y: 500 });
    const moved = roomyPoint(stage, { x: 880, y: 780 }, box, 1.45);
    expect(moved.x).toBeCloseTo(900 - (200 * 1.45) / 2, 6);
    expect(moved.y).toBeCloseTo(800 - (260 * 1.45) / 2, 6);
  });

  it('keeps a growing card inside the stage once it is well into focus, though it started outside', () => {
    for (let f = 0.4; f <= 1; f += 0.05) {
      const p = focusIn({ x: 880, y: 760, rotation: 0 }, f, stage, box);
      const s = Math.max(p.scaleX ?? 1, p.scaleY ?? 1);
      expect(p.x + (box.w * s) / 2).toBeLessThanOrEqual(900 + 0.5);
      expect(p.y + (box.h * s) / 2).toBeLessThanOrEqual(800 + 0.5);
    }
  });

  it('grows to the peak where there is room, less where there is not', () => {
    expect(focusIn({ x: 500, y: 500 }, 1, stage, box).scaleY).toBeCloseTo(FOCUS.peak, 6);
    const tight = { cx: 500, cy: 500, w: 800, h: 300 };
    expect(focusIn({ x: 500, y: 500 }, 1, tight, box).scaleY).toBeCloseTo(300 / 260, 6);
  });

  it('out of focus, rests smaller and darker where it is', () => {
    const p = focusIn({ x: 880, y: 760, scale: 1 }, 0, stage, box);
    expect(p).toMatchObject({ x: 880, y: 760, shade: FOCUS.dim });
    expect(p.scaleX).toBeCloseTo(FOCUS.rest, 6);
  });

  it('keeps a flip turning when asked to', () => {
    expect(focusIn({ x: 500, y: 500, turnY: 120 }, 1, stage, box, 1.2, { keepTurn: true }).turnY).toBe(120);
    expect(focusIn({ x: 500, y: 500, turnY: 120 }, 1, stage, box, 1.2).turnY).toBe(0);
  });
});

describe('small helpers', () => {
  it('turned boxes, fractions, blends and presence', () => {
    expect(turned(box, 90).w).toBeCloseTo(260, 6);
    expect(frac(-0.25)).toBeCloseTo(0.75, 10);
    expect(mixPose({ x: 0, y: 0, shade: 0 }, { x: 10, y: 20, shade: 0.4 }, 0.5)).toMatchObject({ x: 5, y: 10, shade: 0.2 });
    expect(scaled({ x: 0, y: 0, scale: 2 }, 0.5)).toMatchObject({ scaleX: 1, scaleY: 1 });
  });
});

describe('turns for keyframed and short designs (D-157, part 2)', () => {
  const leader = (f: readonly number[]): number => f.indexOf(Math.max(...f));

  it('turnsAlong gives every card a turn when there is time, and spreads fewer turns when not', () => {
    const lit = (ms: number, n: number, to: number): number[] => Array.from({ length: n }, (_, i) => turnsAlong(ms, i, n, 1000, to));
    const leaders = new Set<number>();
    for (let ms = 1000; ms < 9000; ms += 100) leaders.add(leader(lit(ms, 4, 9000)));
    expect([...leaders].sort()).toEqual([0, 1, 2, 3]);
    // Five cards in 1.5s: two turns of at least 700ms, at cards spread along the row.
    const short = new Set<number>();
    for (let ms = 1000; ms < 2500; ms += 50) short.add(leader(lit(ms, 5, 2500)));
    expect([...short].sort()).toEqual([1, 3]);
  });

  it('walkTurns only ever moves the focus to a neighbour, starting where asked', () => {
    let previous = -1;
    for (let ms = 1000; ms < 13_000; ms += 50) {
      const lead = leader([0, 1, 2, 3, 4].map((i) => walkTurns(ms, i, 5, 1000, 13_000)));
      if (previous === -1) expect(lead).toBe(2);
      else expect(Math.abs(lead - previous)).toBeLessThanOrEqual(1);
      previous = lead;
    }
    expect(walkTurns(1000, 3, 4, 1000, 9000, 3)).toBe(1);
  });

  it('settleInto holds a card at rest until the ramp, then eases into its emphasis', () => {
    const shown = { x: 0, y: 0, scaleX: 0.86, scaleY: 0.86, shade: 0.4 };
    expect(settleInto(shown, 0, 2000)).toMatchObject({ scaleX: 1, shade: 0 });
    expect(settleInto(shown, 2000, 2000)).toBe(shown);
  });

  it('emphasisedAfter keeps an entrance as written and continues it without a jump', () => {
    const written = { x: [kf(0, 0), kf(1000, 100, 'linear')], opacity: [kf(0, 0), kf(500, 1, 'linear')] };
    const tracks = emphasisedAfter(written, 1000, 5000, (base) => ({ ...base, x: base.x + 50, shade: 0.4 }));
    expect(tracks.x?.filter((key) => key.t <= 1000)).toEqual(written.x);
    expect(poseOf(tracks, 1000).x).toBeCloseTo(100, 6);
    expect(poseOf(tracks, 1000).shade).toBeCloseTo(0, 6);
    expect(poseOf(tracks, 3000).x).toBeCloseTo(150, 6);
    expect(poseOf(tracks, 3000).shade).toBeCloseTo(0.4, 6);
  });
});
