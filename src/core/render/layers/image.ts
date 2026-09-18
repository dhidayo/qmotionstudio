import { roleFill, type Ctx2D, type ImageProps } from '@/core/types';
import { applyCrop, containBox, fitSourceRect, roundedRectPath } from '@/core/math/geometry';
import { resolvePaint } from '../paint';
import type { DrawContext } from '../drawContext';

/**
 * Image layers (§6.2): object-fit cover/contain, crop rect, corner radius, drop
 * shadow, optional mirrored reflection with a gradient fade, optional border.
 *
 * The bitmap comes from the media store by id; the document itself only ever
 * holds ids (§5). A missing bitmap draws a neutral placeholder rather than
 * throwing — during an aspect change or a fresh load the decode may simply not
 * have landed yet, and a half-populated frame is better than a dead editor.
 */
export function drawImage(dc: DrawContext, props: ImageProps, x: number, y: number): void {
  const { ctx, palette } = dc;
  const { w, h } = props;
  if (w <= 0 || h <= 0) return;

  const bitmap = dc.media.getBitmap(props.mediaId);
  const radius = props.cornerRadius ?? 0;

  if (!bitmap) {
    drawPlaceholder(ctx, x, y, w, h, radius, resolvePaint(roleFill('surface'), palette));
    return;
  }

  if (props.shadow) {
    // Shadow is cast by an opaque rounded rect behind the image, not by the
    // image itself: a shadow on a drawImage call is applied per-pixel including
    // transparent ones, which halos anything with an alpha channel.
    ctx.save();
    ctx.shadowBlur = props.shadow.blur;
    ctx.shadowOffsetX = props.shadow.offsetX;
    ctx.shadowOffsetY = props.shadow.offsetY;
    ctx.shadowColor = resolvePaint(props.shadow.paint, palette);
    ctx.fillStyle = '#000';
    roundedRectPath(ctx, x, y, w, h, radius);
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  roundedRectPath(ctx, x, y, w, h, radius);
  ctx.clip();
  paintBitmap(ctx, bitmap, props, x, y, w, h);
  ctx.restore();

  if (props.border && props.border.width > 0) {
    const inset = props.border.inset;
    ctx.save();
    ctx.lineWidth = props.border.width;
    ctx.strokeStyle = resolvePaint(props.border.paint, palette);
    roundedRectPath(ctx, x + inset, y + inset, w - inset * 2, h - inset * 2, Math.max(0, radius - inset));
    ctx.stroke();
    ctx.restore();
  }

  if (props.reflection) drawReflection(dc, props, x, y, w, h, bitmap, radius);
}

function paintBitmap(
  ctx: Ctx2D,
  bitmap: ImageBitmap,
  props: ImageProps,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const srcW = bitmap.width;
  const srcH = bitmap.height;
  const fitted = fitSourceRect(srcW, srcH, w, h, props.fit);
  const source = applyCrop(fitted, props.crop, srcW, srcH);

  if (props.fit === 'contain') {
    const box = containBox(source.w, source.h, w, h);
    ctx.drawImage(bitmap, source.x, source.y, source.w, source.h, x + box.x, y + box.y, box.w, box.h);
    return;
  }
  ctx.drawImage(bitmap, source.x, source.y, source.w, source.h, x, y, w, h);
}

function drawReflection(
  dc: DrawContext,
  props: ImageProps,
  x: number,
  y: number,
  w: number,
  h: number,
  bitmap: ImageBitmap,
  radius: number,
): void {
  const reflection = props.reflection;
  if (!reflection) return;

  const height = h * reflection.heightPct;
  if (height <= 1) return;

  const top = y + h + reflection.gapPx;
  const { ctx } = dc;

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, top, w, height);
  ctx.clip();

  // Mirror about the reflection's own top edge, then draw the image as if it
  // continued downward.
  ctx.translate(0, top * 2);
  ctx.scale(1, -1);
  ctx.globalAlpha *= reflection.opacity;

  ctx.save();
  roundedRectPath(ctx, x, top - h, w, h, radius);
  ctx.clip();
  paintBitmap(ctx, bitmap, props, x, top - h, w, h);
  ctx.restore();
  ctx.restore();

  // Fade the reflection out downwards. destination-out with a gradient removes
  // alpha rather than painting over, so it works on any background.
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  const fade = ctx.createLinearGradient(0, top, 0, top + height);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.fillStyle = fade;
  ctx.fillRect(x, top, w, height);
  ctx.restore();
}

function drawPlaceholder(
  ctx: Ctx2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  fill: string,
): void {
  ctx.save();
  ctx.globalAlpha *= 0.25;
  ctx.fillStyle = fill;
  roundedRectPath(ctx, x, y, w, h, radius);
  ctx.fill();
  ctx.restore();
}
