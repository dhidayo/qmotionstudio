import { describe, expect, it } from 'vitest';
import { arcPlacements, createBuildContext, gridCells, staggerDelay } from './buildContext';
import type { TextMeasureContext } from '@/core/text/layout';

const measureContext: TextMeasureContext = {
  font: '',
  letterSpacing: '0px',
  textBaseline: 'alphabetic',
  measureText: (text: string) => ({ width: text.length * 10 }),
};

const ctx = (): ReturnType<typeof createBuildContext> =>
  createBuildContext({
    design: { w: 1080, h: 1920 },
    safe: { x: 60, y: 60, w: 960, h: 1800 },
    palette: { bg: '#000', surface: '#111', ink: '#fff', inkMuted: '#888', accent: '#f0f' },
    durationMs: 10_000,
    measureContext,
  });

describe('repeat', () => {
  it('passes item, index and total count', () => {
    const seen = ctx().repeat(['a', 'b', 'c'], (item, i, n) => `${item}${i}/${n}`);
    expect(seen).toEqual(['a0/3', 'b1/3', 'c2/3']);
  });

  it('handles an empty list without special-casing at the call site', () => {
    expect(ctx().repeat([], () => 1)).toEqual([]);
  });
});

describe('id', () => {
  it('is deterministic across builds — build() is memoised on its inputs', () => {
    const a = ctx();
    const b = ctx();
    expect([a.id('photo'), a.id('photo'), a.id('text')]).toEqual(['photo-0', 'photo-1', 'text-2']);
    expect([b.id('photo'), b.id('photo'), b.id('text')]).toEqual(['photo-0', 'photo-1', 'text-2']);
  });
});

describe('stagger', () => {
  it('ramps from the start', () => {
    expect([0, 1, 2].map((i) => staggerDelay(i, 3, 100, 'start'))).toEqual([0, 100, 200]);
  });

  it('ramps from the end', () => {
    expect([0, 1, 2].map((i) => staggerDelay(i, 3, 100, 'end'))).toEqual([200, 100, 0]);
  });

  it('ramps outward from the centre', () => {
    expect([0, 1, 2].map((i) => staggerDelay(i, 3, 100, 'center'))).toEqual([100, 0, 100]);
  });

  it('gives the two middle items equal delay on an even count', () => {
    const delays = [0, 1, 2, 3].map((i) => staggerDelay(i, 4, 100, 'center'));
    expect(delays[1]).toBe(delays[2]);
  });

  it('ramps inward from the edges', () => {
    expect([0, 1, 2].map((i) => staggerDelay(i, 3, 100, 'edges'))).toEqual([0, 100, 0]);
  });

  it('returns no delay for a single item', () => {
    expect(staggerDelay(0, 1, 100, 'start')).toBe(0);
    expect(staggerDelay(0, 1, 100, 'center')).toBe(0);
  });
});

describe('gridCells', () => {
  it('fills rows left to right', () => {
    const cells = gridCells(4, { cols: 2, cellW: 100, cellH: 100 });
    expect(cells.map((c) => [c.x, c.y])).toEqual([[0, 0], [100, 0], [0, 100], [100, 100]]);
  });

  it('applies gaps between cells but not outside them', () => {
    const cells = gridCells(4, { cols: 2, cellW: 100, cellH: 100, gapX: 10, gapY: 20 });
    expect(cells.map((c) => [c.x, c.y])).toEqual([[0, 0], [110, 0], [0, 120], [110, 120]]);
  });

  it('centres the whole grid on the origin when asked', () => {
    const cells = gridCells(4, { cols: 2, cellW: 100, cellH: 100, center: true });
    expect(cells[0]).toEqual({ x: -100, y: -100, w: 100, h: 100 });
    // The grid is symmetric about the origin.
    const xs = cells.map((c) => c.x + c.w / 2);
    expect(xs.reduce((a, b) => a + b, 0)).toBeCloseTo(0, 10);
  });

  it('leaves a ragged last row rather than padding it', () => {
    const cells = gridCells(5, { cols: 2, cellW: 10, cellH: 10 });
    expect(cells).toHaveLength(5);
    expect(cells[4]).toEqual({ x: 0, y: 20, w: 10, h: 10 });
  });

  it('picks a squarish column count when none is given', () => {
    expect(gridCells(9, { cellW: 10, cellH: 10 }).map((c) => c.y)).toEqual([0, 0, 0, 10, 10, 10, 20, 20, 20]);
  });

  it('returns nothing for a count of zero', () => {
    expect(gridCells(0, { cellW: 10, cellH: 10 })).toEqual([]);
  });
});

describe('arcPlacements', () => {
  it('places the first item at the start angle', () => {
    const [first] = arcPlacements(3, { radius: 100, startAngle: 0, endAngle: 180 });
    expect(first?.x).toBeCloseTo(100, 10);
    expect(first?.y).toBeCloseTo(0, 10);
  });

  it('spans start to end inclusive for a partial arc', () => {
    const points = arcPlacements(3, { radius: 100, startAngle: 0, endAngle: 180 });
    expect(points[2]?.x).toBeCloseTo(-100, 10);
    expect(points[1]?.y).toBeCloseTo(100, 10);
  });

  it('does not double up the first and last item on a full turn', () => {
    const points = arcPlacements(4, { radius: 100, startAngle: 0, endAngle: 360 });
    const first = points[0];
    const last = points[3];
    expect(first && last && Math.hypot(first.x - last.x, first.y - last.y)).toBeGreaterThan(1);
  });

  it('offsets around a centre', () => {
    const [first] = arcPlacements(1, { radius: 50, startAngle: 0, endAngle: 0, cx: 500, cy: 300 });
    expect(first).toEqual({ x: 550, y: 300, rotation: 0 });
  });

  it('rotates items to face along the arc when asked', () => {
    const points = arcPlacements(2, { radius: 100, startAngle: 0, endAngle: 90, faceOutward: true });
    expect(points[0]?.rotation).toBe(90);
    expect(points[1]?.rotation).toBe(180);
  });

  it('leaves rotation alone by default', () => {
    expect(arcPlacements(2, { radius: 100, startAngle: 0, endAngle: 90 }).every((p) => p.rotation === 0)).toBe(true);
  });
});

describe('depthSort', () => {
  it('orders back to front, since the renderer has no z-buffer', () => {
    const items = [{ z: 3 }, { z: 1 }, { z: 2 }];
    expect(ctx().depthSort(items, (i) => i.z).map((i) => i.z)).toEqual([1, 2, 3]);
  });

  it('does not mutate the input', () => {
    const items = [{ z: 3 }, { z: 1 }];
    ctx().depthSort(items, (i) => i.z);
    expect(items.map((i) => i.z)).toEqual([3, 1]);
  });
});

describe('measure', () => {
  it('exposes text measurement to templates sizing a box around a string', () => {
    const run = ctx().measure({
      text: 'hello',
      font: '600 40px sans-serif',
      fontSizePx: 40,
      letterSpacingPx: 0,
      lineHeight: 1.2,
      align: 'left',
      maxWidthPx: null,
    });
    expect(run.width).toBe(50);
  });
});
