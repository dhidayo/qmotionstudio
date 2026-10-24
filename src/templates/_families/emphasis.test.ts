import { describe, expect, it } from 'vitest';
import { FOCUS, linger } from './kit';
import { focusIn, frac, heldTurns, lingerAt, loopTurns, mixPose, roomyPoint, scaled, turned } from './emphasis';

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
