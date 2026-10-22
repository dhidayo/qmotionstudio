import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Ctx2D } from '@/core/types';
import { releaseBlurScratch, withBlur } from './blur';

/*
 * The blur's resample chain (D-154), on stand-in surfaces that record what is
 * drawn where. Node has no canvas, and the chain's arithmetic is the part that
 * can go quietly wrong: a step drawn past the edge of a surface smaller than
 * it is clipped without a word, and the blur loses a strip of itself.
 */

type Draw = { readonly into: FakeCanvas | 'screen'; readonly from: FakeCanvas; readonly w: number; readonly h: number; readonly quality: string };

let draws: Draw[] = [];
const canvases: FakeCanvas[] = [];

class FakeContext {
  imageSmoothingEnabled = false;
  imageSmoothingQuality = 'high';
  #transform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  constructor(readonly canvas: FakeCanvas | 'screen') {}
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void { this.#transform = { a, b, c, d, e, f }; }
  getTransform(): { a: number; b: number } { return this.#transform; }
  /** The last area cleared, from the origin. */
  cleared = { w: 0, h: 0 };
  clearRect(_x: number, _y: number, w: number, h: number): void { this.cleared = { w, h }; }
  save(): void {}
  restore(): void {}
  drawImage(from: FakeCanvas, _sx: number, _sy: number, sw: number, sh: number, _dx: number, _dy: number, w: number, h: number): void {
    // Every step reads only what the step before it wrote.
    expect(sw).toBeLessThanOrEqual(from.width);
    expect(sh).toBeLessThanOrEqual(from.height);
    // And a smoothed read just past that part finds nothing a larger blur
    // left behind on the pooled surface.
    expect(from.context.cleared.w).toBeGreaterThan(Math.min(sw, from.width - 1));
    expect(from.context.cleared.h).toBeGreaterThan(Math.min(sh, from.height - 1));
    draws.push({ into: this.canvas, from, w, h, quality: this.imageSmoothingQuality });
  }
}

class FakeCanvas {
  readonly context = new FakeContext(this);
  constructor(public width: number, public height: number) { canvases.push(this); }
  getContext(): FakeContext { return this.context; }
}

const screen = (scale: number): Ctx2D => {
  const ctx = new FakeContext('screen');
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  return ctx as unknown as Ctx2D;
};

beforeEach(() => {
  draws = [];
  canvases.length = 0;
  releaseBlurScratch();
  (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas = FakeCanvas;
});

afterEach(() => {
  releaseBlurScratch();
  delete (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas;
});

describe('the blur chain (D-154)', () => {
  const cases = [
    // A blurred-photo background at 1184×666: 1.2× the frame, a radius of 0.08× the short edge.
    { radius: 86, scale: 666 / 1080, bounds: { x: -192, y: -108, w: 2304, h: 1296 } },
    // A far card in a depth design: a small blur on a small box.
    { radius: 4, scale: 1, bounds: { x: 100, y: 100, w: 300, h: 400 } },
    { radius: 12, scale: 1.5, bounds: { x: 0, y: 0, w: 640, h: 360 } },
    { radius: 40, scale: 0.4, bounds: { x: 0, y: 0, w: 1080, h: 1920 } },
    { radius: 2, scale: 2, bounds: { x: 0, y: 0, w: 33, h: 21 } },
  ];

  it('keeps every step inside the surface it is drawn on', () => {
    for (const { radius, scale, bounds } of cases) {
      draws = [];
      let painted = 0;
      withBlur(screen(scale), radius, bounds, 0, () => { painted += 1; });
      expect(painted).toBe(1);
      for (const draw of draws) {
        if (draw.into === 'screen') continue;
        expect(draw.w, `${radius} at ${scale}`).toBeLessThanOrEqual(draw.into.width);
        expect(draw.h).toBeLessThanOrEqual(draw.into.height);
      }
      // One draw onto the picture at the end, and nothing else onto it.
      expect(draws.filter((d) => d.into === 'screen')).toHaveLength(1);
      expect(draws.at(-1)?.into).toBe('screen');
    }
  });

  it('never makes a full-size step after the first draw', () => {
    for (const { radius, scale, bounds } of cases) {
      draws = [];
      withBlur(screen(scale), radius, bounds, 0, () => {});
      const pad = Math.ceil(radius * 2);
      const pixelW = Math.ceil((bounds.w + pad * 2) * scale);
      const pixelH = Math.ceil((bounds.h + pad * 2) * scale);
      for (const draw of draws.filter((d) => d.into !== 'screen')) {
        expect(draw.w * 2, `${radius} at ${scale}`).toBeLessThanOrEqual(pixelW);
        expect(draw.h * 2).toBeLessThanOrEqual(pixelH);
      }
      // The last step onto the picture is two to four times, never the one big jump.
      const last = draws.at(-1);
      expect(last?.from.width).toBeGreaterThan(0);
      const from = draws.at(-2);
      expect(from).toBeDefined();
      if (from) {
        expect(pixelW / from.w).toBeGreaterThanOrEqual(2);
        expect(pixelW / from.w).toBeLessThan(4);
      }
    }
  });

  it('resamples bilinearly at every step', () => {
    withBlur(screen(1), 30, { x: 0, y: 0, w: 800, h: 600 }, 0, () => {});
    expect(draws.length).toBeGreaterThan(4);
    for (const draw of draws) expect(draw.quality).toBe('low');
  });

  it('allocates the chain at half size beside the full-size scratch', () => {
    withBlur(screen(1), 30, { x: 0, y: 0, w: 800, h: 600 }, 0, () => {});
    const pixel = 800 + 2 * 60;
    expect(canvases.map((c) => c.width)).toEqual([pixel, pixel / 2, pixel / 2]);
  });

  it('draws a blur too small to see without the round trip', () => {
    let painted = 0;
    withBlur(screen(1), 0.5, { x: 0, y: 0, w: 800, h: 600 }, 0, () => { painted += 1; });
    expect(painted).toBe(1);
    expect(canvases).toHaveLength(0);
  });
});
