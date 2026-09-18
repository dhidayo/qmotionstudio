import type { Ctx2D, ObjectFit, Rect } from '@/core/types';

/**
 * Traces a rounded rectangle. Uses roundRect where available — it is Baseline
 * and considerably faster than four arcs — and falls back to arcs otherwise.
 */
export function roundedRectPath(ctx: Ctx2D, x: number, y: number, w: number, h: number, radius: number): void {
  const r = Math.max(0, Math.min(radius, Math.min(w, h) / 2));
  ctx.beginPath();
  if (r === 0) {
    ctx.rect(x, y, w, h);
    return;
  }
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function ellipsePath(ctx: Ctx2D, x: number, y: number, w: number, h: number): void {
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
}

/**
 * Source rectangle for object-fit, in the source image's own pixels.
 *
 * `cover` crops the source to the destination's aspect; `contain` uses the
 * whole source and lets the caller letterbox. Returning a source rect rather
 * than a destination rect means a single drawImage call does the work, with no
 * clipping pass.
 */
export function fitSourceRect(srcW: number, srcH: number, dstW: number, dstH: number, fit: ObjectFit): Rect {
  if (srcW <= 0 || srcH <= 0 || dstW <= 0 || dstH <= 0) {
    return { x: 0, y: 0, w: Math.max(1, srcW), h: Math.max(1, srcH) };
  }
  if (fit === 'contain') return { x: 0, y: 0, w: srcW, h: srcH };

  const srcRatio = srcW / srcH;
  const dstRatio = dstW / dstH;

  if (srcRatio > dstRatio) {
    // Source is wider: take a full-height slice from the middle.
    const w = srcH * dstRatio;
    return { x: (srcW - w) / 2, y: 0, w, h: srcH };
  }
  const h = srcW / dstRatio;
  return { x: 0, y: (srcH - h) / 2, w: srcW, h };
}

/** Destination box for `contain`, centred inside the given bounds. */
export function containBox(srcW: number, srcH: number, dstW: number, dstH: number): Rect {
  if (srcW <= 0 || srcH <= 0) return { x: 0, y: 0, w: dstW, h: dstH };
  const scale = Math.min(dstW / srcW, dstH / srcH);
  const w = srcW * scale;
  const h = srcH * scale;
  return { x: (dstW - w) / 2, y: (dstH - h) / 2, w, h };
}

/** Intersects a normalised crop rect with a source rect, both in source pixels. */
export function applyCrop(source: Rect, crop: Rect | undefined, srcW: number, srcH: number): Rect {
  if (!crop) return source;
  const cx = crop.x * srcW;
  const cy = crop.y * srcH;
  const cw = crop.w * srcW;
  const ch = crop.h * srcH;
  const x = Math.max(source.x, cx);
  const y = Math.max(source.y, cy);
  const right = Math.min(source.x + source.w, cx + cw);
  const bottom = Math.min(source.y + source.h, cy + ch);
  return { x, y, w: Math.max(1, right - x), h: Math.max(1, bottom - y) };
}

export function clamp(value: number, low: number, high: number): number {
  return value < low ? low : value > high ? high : value;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** 0 before `from`, 1 after `to`, linear between. Safe when from === to. */
export function progress(value: number, from: number, to: number): number {
  if (to <= from) return value >= to ? 1 : 0;
  return clamp((value - from) / (to - from), 0, 1);
}
