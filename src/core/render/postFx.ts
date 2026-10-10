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

/**
 * §12's free-tier watermark, and §6.4's step 5.
 *
 * Small, in the corner, inside the safe area so it survives a crop, and drawn
 * in the project's own design units so it is the same size relative to the
 * frame at every aspect and every export resolution.
 *
 * Deliberately legible rather than subtle. A watermark that has to be hunted
 * for is not doing its job, and one that ruins the picture makes the free tier
 * feel like a punishment rather than a sample.
 */
/**
 * The mark's ink for a ground (D-121). White with a dark halo was right on
 * the near-black grounds every design used to share; on cream or sunshine it
 * all but vanished. On a light ground it is dark with a light halo instead.
 */
export function watermarkInk(ground: string): { readonly fill: string; readonly halo: string } {
  return isLight(ground)
    ? { fill: 'rgba(20,20,24,0.78)', halo: 'rgba(255,255,255,0.6)' }
    : { fill: 'rgba(255,255,255,0.86)', halo: 'rgba(0,0,0,0.55)' };
}

/** Whether a #rrggbb colour is light enough that dark words read on it. */
function isLight(hex: string): boolean {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match?.[1]) return false;
  const value = Number.parseInt(match[1], 16);
  const channel = (shift: number): number => {
    const c = ((value >> shift) & 0xff) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
  return luminance > 0.4;
}

export function drawWatermark(ctx: Ctx2D, design: Size, ground = '#000000'): void {
  const unit = Math.min(design.w, design.h);
  const size = unit * 0.026;
  const pad = unit * 0.045;

  ctx.save();
  ctx.font = `600 ${size}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';

  const text = 'Made with Q Motion Studio';
  const x = design.w - pad;
  const y = design.h - pad;

  // A soft shadow rather than a plate behind it: the mark has to read on a
  // bright sky and on a black frame, and a box would be the louder of the two.
  const ink = watermarkInk(ground);
  ctx.shadowColor = ink.halo;
  ctx.shadowBlur = size * 0.7;
  ctx.fillStyle = ink.fill;
  ctx.fillText(text, x, y);
  ctx.restore();
}
