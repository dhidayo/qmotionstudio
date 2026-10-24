import type { StickerProps } from '@/core/types';
import { fontString } from '@/fonts/registry';
import { stickerDef } from '@/core/stickers/catalog';
import type { StickerSample } from '@/core/stickers/types';
import { onAccent, resolvePaint } from '../paint';
import type { DrawContext } from '../drawContext';

/**
 * Animated stickers (D-158): the library's art, drawn at the layer's own time.
 *
 * The sticker draws in its own box from (0, 0), so this only works out the
 * moment of its loop, resolves its colours against the look and moves the
 * origin. A sticker id this build does not know — a project from a newer
 * version — draws nothing rather than failing the frame.
 */
export function drawSticker(dc: DrawContext, props: StickerProps, x: number, y: number, localMs: number): void {
  const def = stickerDef(props.sticker);
  const { w, h } = props;
  if (!def || w <= 0 || h <= 0 || def.loopMs <= 0) return;

  const { ctx, palette } = dc;
  const t = props.play === 'still'
    ? ((def.posterMs % def.loopMs) + def.loopMs) % def.loopMs
    : (Math.max(0, localMs) * props.speed) % def.loopMs;
  const primary = resolvePaint(props.primary, palette);
  const flip = props.flip;

  /*
   * Words are set in the app's headline face at weight 800, shrunk to fit.
   * Measured once at a reference size and scaled, so a sticker whose label
   * pulses does not put a new measurement in the cache every frame.
   */
  const text: StickerSample['text'] = (label, cx, cy, maxW, sizePx, color) => {
    if (label.length === 0 || sizePx <= 0) return;
    const reference = dc.measurer.measure({
      text: label,
      font: fontString('headline', REFERENCE_PX, 800),
      fontSizePx: REFERENCE_PX,
      letterSpacingPx: 0,
      lineHeight: 1,
      align: 'left',
      maxWidthPx: null,
    }).width;
    const natural = (reference * sizePx) / REFERENCE_PX;
    const size = natural > maxW && natural > 0 ? (sizePx * maxW) / natural : sizePx;
    ctx.save();
    // The words always read the right way round, even on a flipped sticker.
    if (flip) {
      ctx.translate(cx, 0);
      ctx.scale(-1, 1);
      ctx.translate(-cx, 0);
    }
    ctx.font = fontString('headline', size, 800);
    ctx.letterSpacing = '0px';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(label, cx, cy);
    ctx.restore();
  };

  const sample: StickerSample = {
    t,
    p: t / def.loopMs,
    w,
    h,
    primary,
    secondary: resolvePaint(props.secondary, palette),
    onPrimary: onAccent(primary),
    ink: palette.ink,
    labels: props.labels,
    seed: props.seed,
    text,
  };

  ctx.save();
  ctx.translate(x, y);
  if (flip) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  def.draw(ctx, sample);
  ctx.restore();
}

/** The size labels are measured at before scaling to the size asked for. */
const REFERENCE_PX = 100;
