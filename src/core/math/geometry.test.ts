import { describe, expect, it } from 'vitest';
import { applyCrop, containBox, fitSourceRect, progress } from './geometry';

describe('fitSourceRect', () => {
  it('returns the whole source for contain', () => {
    expect(fitSourceRect(400, 300, 100, 100, 'contain')).toEqual({ x: 0, y: 0, w: 400, h: 300 });
  });

  it('crops the sides of a wide source to fill a square', () => {
    expect(fitSourceRect(400, 200, 100, 100, 'cover')).toEqual({ x: 100, y: 0, w: 200, h: 200 });
  });

  it('crops the top and bottom of a tall source to fill a square', () => {
    expect(fitSourceRect(200, 400, 100, 100, 'cover')).toEqual({ x: 0, y: 100, w: 200, h: 200 });
  });

  it('leaves a matching aspect untouched', () => {
    expect(fitSourceRect(400, 200, 200, 100, 'cover')).toEqual({ x: 0, y: 0, w: 400, h: 200 });
  });

  it('survives a zero-sized source instead of returning NaN', () => {
    const r = fitSourceRect(0, 0, 100, 100, 'cover');
    expect(Number.isFinite(r.w) && Number.isFinite(r.h)).toBe(true);
  });
});

describe('containBox', () => {
  it('letterboxes a wide image in a square box', () => {
    expect(containBox(400, 200, 100, 100)).toEqual({ x: 0, y: 25, w: 100, h: 50 });
  });

  it('pillarboxes a tall image in a square box', () => {
    expect(containBox(200, 400, 100, 100)).toEqual({ x: 25, y: 0, w: 50, h: 100 });
  });
});

describe('applyCrop', () => {
  it('passes the source through when there is no crop', () => {
    const src = { x: 0, y: 0, w: 100, h: 100 };
    expect(applyCrop(src, undefined, 100, 100)).toBe(src);
  });

  it('intersects the crop with the fit rect rather than replacing it', () => {
    const src = { x: 0, y: 0, w: 100, h: 100 };
    const crop = { x: 0.25, y: 0.25, w: 0.5, h: 0.5 };
    expect(applyCrop(src, crop, 100, 100)).toEqual({ x: 25, y: 25, w: 50, h: 50 });
  });

  it('never returns a zero or negative extent', () => {
    const src = { x: 80, y: 80, w: 20, h: 20 };
    const crop = { x: 0, y: 0, w: 0.1, h: 0.1 };
    const out = applyCrop(src, crop, 100, 100);
    expect(out.w).toBeGreaterThan(0);
    expect(out.h).toBeGreaterThan(0);
  });
});

describe('progress', () => {
  it('ramps from 0 to 1 across the window', () => {
    expect(progress(0, 0, 100)).toBe(0);
    expect(progress(50, 0, 100)).toBe(0.5);
    expect(progress(100, 0, 100)).toBe(1);
  });

  it('clamps outside the window', () => {
    expect(progress(-10, 0, 100)).toBe(0);
    expect(progress(999, 0, 100)).toBe(1);
  });

  it('behaves as a step when the window has no width', () => {
    expect(progress(99, 100, 100)).toBe(0);
    expect(progress(100, 100, 100)).toBe(1);
  });
});
