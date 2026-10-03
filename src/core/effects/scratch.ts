import type { Ctx2D, Size } from '@/core/types';

/**
 * Scratch surfaces for effects that read the picture back (D-100).
 *
 * A glitch, a colour split or a bloom needs a copy of the frame to work from.
 * Allocating one per frame would churn megabytes sixty times a second, so a
 * few are kept and reused, grow-only, exactly as the blur pass does.
 *
 * Module-level, and safe to be for the same reason blur's are: every use is
 * inside one synchronous render call, and preview and export run in separate
 * realms with separate copies of this module.
 */

type Surface = { readonly canvas: OffscreenCanvas; readonly ctx: Ctx2D };

const pool: Surface[] = [];

/** A cleared surface at least `size` big, in pixel space with an identity transform. */
export function scratchSurface(index: number, size: Size): Surface {
  const w = Math.max(1, Math.ceil(size.w));
  const h = Math.max(1, Math.ceil(size.h));
  let entry = pool[index];
  if (!entry) {
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('effects: could not acquire a 2D context for a scratch surface.');
    entry = { canvas, ctx };
    pool[index] = entry;
  }
  if (entry.canvas.width < w || entry.canvas.height < h) {
    entry.canvas.width = Math.max(entry.canvas.width, w);
    entry.canvas.height = Math.max(entry.canvas.height, h);
  }
  const { ctx } = entry;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, w, h);
  return entry;
}

export function releaseEffectScratch(): void {
  pool.length = 0;
}
