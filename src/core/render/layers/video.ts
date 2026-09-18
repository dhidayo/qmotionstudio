import { roleFill, type VideoProps } from '@/core/types';
import { containBox, fitSourceRect, roundedRectPath } from '@/core/math/geometry';
import { resolvePaint } from '../paint';
import type { DrawContext } from '../drawContext';

/**
 * Video layers — custom media, which is Pro (§9, §12).
 *
 * The decoder and its ring buffer arrive with custom media at M5; the media
 * resolver returns null until then, so this draws the same neutral placeholder
 * an undecoded image would. The layer type exists now so templates and the
 * compositor do not need changing later.
 *
 * VideoFrame is drawable directly by drawImage. It must NOT be closed here —
 * the frame is owned by the decoder's ring buffer, and closing a cached frame
 * mid-playback would leave the buffer handing out detached frames.
 */
export function drawVideo(dc: DrawContext, props: VideoProps, x: number, y: number, localMs: number): void {
  const { ctx, palette } = dc;
  const { w, h } = props;
  if (w <= 0 || h <= 0) return;

  const radius = props.cornerRadius ?? 0;
  const frame = dc.media.getVideoFrame(props.mediaId, localMs);

  if (!frame) {
    ctx.save();
    ctx.globalAlpha *= 0.25;
    ctx.fillStyle = resolvePaint(roleFill('surface'), palette);
    roundedRectPath(ctx, x, y, w, h, radius);
    ctx.fill();
    ctx.restore();
    return;
  }

  const srcW = frame.displayWidth;
  const srcH = frame.displayHeight;

  ctx.save();
  roundedRectPath(ctx, x, y, w, h, radius);
  ctx.clip();

  const source = fitSourceRect(srcW, srcH, w, h, props.fit);
  if (props.fit === 'contain') {
    const box = containBox(source.w, source.h, w, h);
    ctx.drawImage(frame, source.x, source.y, source.w, source.h, x + box.x, y + box.y, box.w, box.h);
  } else {
    ctx.drawImage(frame, source.x, source.y, source.w, source.h, x, y, w, h);
  }

  ctx.restore();
}
