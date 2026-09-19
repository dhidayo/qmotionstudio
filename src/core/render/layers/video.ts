import { roleFill, type VideoProps } from '@/core/types';
import { containBox, fitSourceRect, roundedRectPath } from '@/core/math/geometry';
import { resolvePaint } from '../paint';
import type { DrawContext } from '../drawContext';

/**
 * Video layers — custom media, which is Pro (§9, §12).
 *
 * The frame comes from the ring buffer in media/video/clip.ts, already decoded
 * (D-051). A miss draws the same neutral placeholder an undecoded image would,
 * because §3A forbids this path from awaiting anything.
 *
 * The frame must NOT be closed here. It is owned by the ring buffer, and
 * closing a cached frame mid-playback would leave the buffer handing out
 * detached ones — the silent, fatal kind of leak §11.6 is about, in reverse.
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
  if (srcW <= 0 || srcH <= 0) return;

  ctx.save();
  roundedRectPath(ctx, x, y, w, h, radius);
  ctx.clip();

  const source = fitSourceRect(srcW, srcH, w, h, props.fit);
  if (props.fit === 'contain') {
    const box = containBox(source.w, source.h, w, h);
    frame.draw(ctx, source.x, source.y, source.w, source.h, x + box.x, y + box.y, box.w, box.h);
  } else {
    frame.draw(ctx, source.x, source.y, source.w, source.h, x, y, w, h);
  }

  ctx.restore();
}
