import { describe, expect, it } from 'vitest';
import type { Overlay } from '@/document/types';
import {
  dragResult, msToPct, pxToMs, rowCount, snap, tickIntervalMs, type ClipDrag,
} from './timelineGeometry';

const overlay = (id: string, track: number): Overlay => ({
  id,
  track,
  startMs: 0,
  endMs: 1_000,
  kind: 'text',
  content: { kind: 'text', text: id, style: {
    fontId: 'body', weight: 500, align: 'center', sizePct: 100, color: '',
    wrap: true, shadow: false, outline: false, pill: false, wrapWidthPct: 100, letterSpacingPct: 0,
  } },
  transform: {},
  enterAnim: 'fade',
  exitAnim: 'fade',
});

describe('time ↔ pixels', () => {
  it('maps the ends exactly', () => {
    expect(msToPct(0, 10_000)).toBe(0);
    expect(msToPct(10_000, 10_000)).toBe(100);
  });

  it('clamps outside the timeline rather than overflowing the lane', () => {
    expect(msToPct(-500, 10_000)).toBe(0);
    expect(msToPct(99_000, 10_000)).toBe(100);
  });

  it('survives a zero-length project', () => {
    expect(msToPct(500, 0)).toBe(0);
    expect(pxToMs(100, 0, 10_000)).toBe(0);
  });

  it('round-trips a pixel through a millisecond', () => {
    const ms = pxToMs(300, 600, 20_000);
    expect(ms).toBe(10_000);
    expect(msToPct(ms, 20_000)).toBe(50);
  });
});

describe('snapping', () => {
  it('lands on the grid', () => {
    expect(snap(1_240, 100, false)).toBe(1_200);
    expect(snap(1_260, 100, false)).toBe(1_300);
  });

  it('is suspended when the modifier is held', () => {
    expect(snap(1_243.6, 100, true)).toBe(1_244);
  });
});

describe('dragging a clip', () => {
  const base: ClipDrag = { mode: 'move', id: 'a', startMs: 2_000, endMs: 5_000, pointerMs: 3_000 };
  const options = { durationMs: 20_000, minLengthMs: 300 };

  it('moves without changing length', () => {
    const result = dragResult(base, 4_000, options);
    expect(result).toEqual({ startMs: 3_000, endMs: 6_000 });
  });

  it('stops at the start instead of going negative', () => {
    const result = dragResult(base, 0, options);
    expect(result).toEqual({ startMs: 0, endMs: 3_000 });
  });

  it('stops at the end with its length intact', () => {
    const result = dragResult(base, 100_000, options);
    expect(result).toEqual({ startMs: 17_000, endMs: 20_000 });
    expect(result.endMs - result.startMs).toBe(3_000);
  });

  it('trims the start without passing the end', () => {
    const drag: ClipDrag = { ...base, mode: 'trimStart' };
    expect(dragResult(drag, 100_000, options)).toEqual({ startMs: 4_700, endMs: 5_000 });
  });

  it('trims the end without passing the start', () => {
    const drag: ClipDrag = { ...base, mode: 'trimEnd' };
    expect(dragResult(drag, 0, options)).toEqual({ startMs: 2_000, endMs: 2_300 });
  });
});

describe('ruler ticks', () => {
  it('picks an interval a human would choose', () => {
    expect(tickIntervalMs(30_000, 900)).toBe(2_000);
    expect(tickIntervalMs(10_000, 900)).toBe(1_000);
    expect(tickIntervalMs(300_000, 600)).toBe(30_000);
  });

  it('never returns zero, however narrow the lane', () => {
    expect(tickIntervalMs(15_000, 1)).toBeGreaterThan(0);
  });
});

describe('track rows', () => {
  it('always leaves one empty row to drop into', () => {
    expect(rowCount([])).toBe(1);
    expect(rowCount([overlay('a', 0)])).toBe(2);
  });

  it('counts from the highest track in use, not the number of overlays', () => {
    expect(rowCount([overlay('a', 3), overlay('b', 0)])).toBe(5);
  });

  it('stops growing at eight rows', () => {
    expect(rowCount([overlay('a', 40)])).toBe(8);
  });
});
