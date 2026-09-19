import type { Ctx2D, Size } from '@/core/types';

/**
 * Frame post-effects: grain and vignette (§8.4).
 *
 * Applied after the layers, in design units, so they sit over everything
 * including the logo.
 */

/** One tile, generated once and repeated. */
const NOISE_TILE = 128;

let noisePattern: { canvas: OffscreenCanvas } | null = null;

/**
 * Builds the grain tile.
 *
 * Generating noise per frame would mean writing a megapixel of random bytes
 * sixty times a second, which costs more than everything else in the renderer
 * put together. One tile is generated and repeated, and the *offset* changes
 * per frame — which is what makes it read as moving grain rather than as a
 * static texture stuck to the screen.
 */
function noiseTile(): OffscreenCanvas {
  if (noisePattern) return noisePattern.canvas;

  const canvas = new OffscreenCanvas(NOISE_TILE, NOISE_TILE);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('postFx: could not acquire a 2D context for the grain tile.');

  const image = ctx.createImageData(NOISE_TILE, NOISE_TILE);
  const data = image.data;

  // Deterministic, so preview and export produce identical grain.
  let state = 0x9e3779b9;
  for (let i = 0; i < data.length; i += 4) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const value = state >>> 24;
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
    data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);

  noisePattern = { canvas };
  return canvas;
}

export function releasePostFx(): void {
  noisePattern = null;
}

export function drawGrain(ctx: Ctx2D, design: Size, amount: number, timeMs: number): void {
  if (amount <= 0.001) return;

  const tile = noiseTile();
  const pattern = ctx.createPattern(tile, 'repeat');
  if (!pattern) return;

  // Step the offset in whole pixels on a coarse interval. Sub-pixel drift
  // would resample the tile and turn crisp grain into mush.
  const step = Math.floor(timeMs / 50);
  const offsetX = (step * 37) % NOISE_TILE;
  const offsetY = (step * 61) % NOISE_TILE;

  ctx.save();
  // Overlay keeps mid-tones and lets the grain read in both shadows and
  // highlights; a plain alpha blend just greys the whole frame out.
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = amount * 0.5;
  ctx.translate(-offsetX, -offsetY);
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, design.w + NOISE_TILE, design.h + NOISE_TILE);
  ctx.restore();
}

export function drawVignette(ctx: Ctx2D, design: Size, amount: number): void {
  if (amount <= 0.001) return;

  const cx = design.w / 2;
  const cy = design.h / 2;
  const inner = Math.min(design.w, design.h) * 0.3;
  const outer = Math.hypot(cx, cy);

  const gradient = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
  gradient.addColorStop(0, 'rgba(0,0,0,0)');
  gradient.addColorStop(1, `rgba(0,0,0,${(amount * 0.85).toFixed(3)})`);

  ctx.save();
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, design.w, design.h);
  ctx.restore();
}
