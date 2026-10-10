import type { Ctx2D } from '@/core/types';

/**
 * A drawing surface off the screen: a scene buffer, a blur's scratch, an
 * effect's copy of the frame.
 *
 * In the export worker that can only be an `OffscreenCanvas`. On the page it
 * is an ordinary `<canvas>` that is never attached (D-127): Safari keeps those
 * on the GPU with the visible canvas, while copying between the visible canvas
 * and an `OffscreenCanvas` measured three times the cost — paid every frame,
 * for every effect and every transition, and most on an iPhone.
 */
export type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;

export function makeCanvas(w: number, h: number): AnyCanvas {
  const width = Math.max(1, Math.ceil(w));
  const height = Math.max(1, Math.ceil(h));
  // Feature-detected, never assumed: this module also runs in the export
  // worker, which has no document (D-001) and takes the OffscreenCanvas below.
  const page = (globalThis as { document?: Document }).document;
  if (page !== undefined) {
    const canvas = page.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  return new OffscreenCanvas(width, height);
}

/** The 2D context of either kind of surface. */
export function context2d(canvas: AnyCanvas, options?: CanvasRenderingContext2DSettings): Ctx2D | null {
  return canvas instanceof OffscreenCanvas ? canvas.getContext('2d', options) : canvas.getContext('2d', options);
}
