import type { Ctx2D } from '@/core/types';
import { makeCanvas, context2d, type AnyCanvas } from './surface';
import { withBlur } from './blur';

/**
 * Drawing one element on its own, so an effect can be confined to its shape
 * (D-100).
 *
 * A shine across a logo has to stop at the logo's edges — a band of light
 * crossing the transparent corners of a PNG reads as a smear on the picture,
 * not as gloss on the mark. So the element is drawn alone onto a scratch
 * surface, the effect is painted `source-atop` (only where the element has
 * pixels), and the result is laid onto the frame. A glow works the same way:
 * the element's silhouette, tinted and blurred, drawn behind it.
 *
 * Same mapping as the blur pass: the scratch is axis-aligned in the layer's
 * own space at the resolution it will be shown at, and drawn back through
 * whatever rotation and scale the layer is under.
 */

type Surface = { canvas: AnyCanvas; ctx: Ctx2D };

const pool: Surface[] = [];

/** Guards against a pathological layer allocating gigabytes. */
const MAX_PIXELS = 24_000_000;

function surfaceAt(slot: number, w: number, h: number): Surface {
  let entry = pool[slot];
  if (!entry) {
    const canvas = makeCanvas(Math.max(1, Math.ceil(w)), Math.max(1, Math.ceil(h)));
    const ctx = context2d(canvas);
    if (!ctx) throw new Error('isolate: could not acquire a 2D context for a scratch surface.');
    entry = { canvas, ctx };
    pool[slot] = entry;
  }
  if (entry.canvas.width < w || entry.canvas.height < h) {
    entry.canvas.width = Math.max(entry.canvas.width, Math.ceil(w));
    entry.canvas.height = Math.max(entry.canvas.height, Math.ceil(h));
  }
  entry.ctx.setTransform(1, 0, 0, 1, 0, 0);
  entry.ctx.globalAlpha = 1;
  entry.ctx.globalCompositeOperation = 'source-over';
  entry.ctx.clearRect(0, 0, w, h);
  return entry;
}

export function releaseIsolationScratch(): void {
  pool.length = 0;
}

export type Glow = { readonly color: string; readonly radius: number; readonly alpha: number };

/**
 * Draws `paint` isolated, then `onto` clipped to what it drew, with any glows
 * behind it. Falls back to drawing straight through when the box is unusable.
 */
export function withIsolation(
  ctx: Ctx2D,
  bounds: { x: number; y: number; w: number; h: number },
  depth: number,
  paint: (target: Ctx2D) => void,
  options: { onto?: (target: Ctx2D) => void; glows?: readonly Glow[] },
): void {
  const glows = options.glows ?? [];
  const reachOut = glows.reduce((max, g) => Math.max(max, g.radius), 0);
  const pad = Math.ceil(Math.max(bounds.w, bounds.h) * 0.12 + reachOut * 2 + 4);
  const transform = ctx.getTransform();
  const scale = Math.max(0.05, Math.hypot(transform.a, transform.b));
  const boxX = bounds.x - pad;
  const boxY = bounds.y - pad;
  const boxW = bounds.w + pad * 2;
  const boxH = bounds.h + pad * 2;
  const pixelW = Math.ceil(boxW * scale);
  const pixelH = Math.ceil(boxH * scale);

  if (bounds.w <= 0 || bounds.h <= 0 || pixelW < 2 || pixelH < 2 || pixelW * pixelH > MAX_PIXELS) {
    paint(ctx);
    return;
  }

  const base = depth * 2;
  const content = surfaceAt(base, pixelW, pixelH);
  content.ctx.setTransform(scale, 0, 0, scale, -boxX * scale, -boxY * scale);
  paint(content.ctx);

  if (options.onto) {
    content.ctx.save();
    content.ctx.globalCompositeOperation = 'source-atop';
    options.onto(content.ctx);
    content.ctx.restore();
  }

  for (const glow of glows) {
    if (glow.alpha <= 0.002 || glow.radius <= 0) continue;
    const silhouette = surfaceAt(base + 1, pixelW, pixelH);
    silhouette.ctx.drawImage(content.canvas, 0, 0, pixelW, pixelH, 0, 0, pixelW, pixelH);
    silhouette.ctx.globalCompositeOperation = 'source-in';
    silhouette.ctx.fillStyle = glow.color;
    silhouette.ctx.fillRect(0, 0, pixelW, pixelH);
    ctx.save();
    ctx.globalAlpha *= Math.min(1, glow.alpha);
    withBlur(ctx, glow.radius, { x: boxX, y: boxY, w: boxW, h: boxH }, depth, (target) => {
      target.drawImage(silhouette.canvas, 0, 0, pixelW, pixelH, boxX, boxY, boxW, boxH);
      target.drawImage(silhouette.canvas, 0, 0, pixelW, pixelH, boxX, boxY, boxW, boxH);
    });
    ctx.restore();
  }

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(content.canvas, 0, 0, pixelW, pixelH, boxX, boxY, boxW, boxH);
  ctx.restore();
}
