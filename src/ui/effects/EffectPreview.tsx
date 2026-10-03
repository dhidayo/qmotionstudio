import { useEffect, useRef, useState } from 'react';
import type { FxInstance, Layer, Palette, Size } from '@/core/types';
import type { ElementEffectDef, FrameEffectDef } from '@/core/effects/types';
import { applyCamera, drawFrameEffects, frameCamera } from '@/core/effects/run';
import { hashString } from '@/core/effects/random';
import { drawLayer } from '@/core/render/drawLayer';
import { TextMeasurer } from '@/core/text/measure';
import type { MediaResolver } from '@/core/render/rig';

/**
 * A small live preview of one effect, drawn by the real renderer (D-100).
 *
 * Not a recorded clip: the same functions that draw the export draw this, on
 * a sample photograph, so what the card shows is exactly what the effect does.
 * Still until it is hovered or focused, then it plays — sixty-odd cards all
 * animating at once would be a lot of work for a picture nobody is looking at.
 */

const SIZE: Size = { w: 168, h: 112 };

export type PreviewEffect =
  | { readonly kind: 'frame'; readonly def: FrameEffectDef }
  | { readonly kind: 'element'; readonly def: ElementEffectDef };

/** How long one loop of the preview runs, and the effect's window inside it. */
function timing(effect: PreviewEffect): { loopMs: number; startMs: number; endMs: number; stillMs: number } {
  if (effect.kind === 'frame') {
    const length = effect.def.defaultMs ?? 6_000;
    return { loopMs: length + 500, startMs: 0, endMs: length, stillMs: length * 0.35 };
  }
  const def = effect.def;
  if (def.phase === 'during') {
    const length = Math.max(2_400, def.defaultMs);
    return { loopMs: length, startMs: 0, endMs: length, stillMs: length * 0.3 };
  }
  const start = 300;
  return {
    loopMs: start + def.defaultMs + 900,
    startMs: start,
    endMs: start + def.defaultMs,
    stillMs: start + def.defaultMs * (def.phase === 'enter' ? 0.55 : 0.45),
  };
}

function backdrop(ctx: CanvasRenderingContext2D, photo: ImageBitmap | null, palette: Palette, dim: boolean): void {
  const g = ctx.createLinearGradient(0, 0, SIZE.w, SIZE.h);
  g.addColorStop(0, palette.surface);
  g.addColorStop(1, palette.bg);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SIZE.w, SIZE.h);
  if (!photo || dim) return;
  const scale = Math.max(SIZE.w / photo.width, SIZE.h / photo.height);
  const w = photo.width * scale;
  const h = photo.height * scale;
  ctx.drawImage(photo, (SIZE.w - w) / 2, (SIZE.h - h) / 2, w, h);
}

export function EffectPreview({
  effect,
  active,
  palette,
  media,
  photoId,
  autoplay = false,
}: {
  effect: PreviewEffect;
  active: boolean;
  /**
   * Plays whenever it is on screen (D-109). A phone has no hover, so a card
   * that only moved when pointed at never moved at all.
   */
  autoplay?: boolean;
  palette: Palette;
  media: MediaResolver;
  photoId: string | null;
}): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const canvas = ref.current;
    if (!autoplay || !canvas || typeof IntersectionObserver !== 'function') return;
    const observer = new IntersectionObserver(([entry]) => { setVisible(entry?.isIntersecting === true); }, { threshold: 0.6 });
    observer.observe(canvas);
    return () => { observer.disconnect(); };
  }, [autoplay]);
  const playing = active || (autoplay && visible);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    canvas.width = Math.round(SIZE.w * dpr);
    canvas.height = Math.round(SIZE.h * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const photo = photoId === null ? null : media.getBitmap(photoId);
    const t = timing(effect);
    const fx: FxInstance = {
      effectId: effect.def.id,
      startMs: t.startMs,
      endMs: t.endMs,
      intensity: effect.def.defaultIntensity,
      params: {},
      seed: hashString(effect.def.id),
    };
    const measurer = new TextMeasurer(ctx, new Map());
    const px = { w: canvas.width, h: canvas.height };

    // The element effects play on one framed photograph in the middle.
    const card: Layer | null = effect.kind === 'element'
      ? {
          id: 'preview',
          type: 'image',
          startMs: 0,
          endMs: t.loopMs + 1,
          tracks: { x: [{ t: 0, v: SIZE.w / 2, ease: 'linear' }], y: [{ t: 0, v: SIZE.h / 2, ease: 'linear' }] },
          fx: [fx],
          props: { mediaId: photoId ?? '', w: 64, h: 64, fit: 'cover', cornerRadius: 8 },
        }
      : null;

    const draw = (timeMs: number): void => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, SIZE.w, SIZE.h);
      if (effect.kind === 'frame') {
        const camera = frameCamera([fx], timeMs, SIZE, palette);
        ctx.save();
        if (camera) applyCamera(ctx, camera, SIZE);
        backdrop(ctx, photo, palette, false);
        ctx.restore();
        drawFrameEffects(ctx, [fx], timeMs, SIZE, palette, px, dpr);
      } else if (card) {
        backdrop(ctx, photo, palette, true);
        drawLayer({ ctx, palette, media, measurer, depth: 0 }, card, timeMs);
      }
    };

    if (!playing) {
      draw(t.stillMs);
      return;
    }

    let frame = 0;
    const began = performance.now();
    const tick = (now: number): void => {
      draw((now - began) % t.loopMs);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); };
  }, [effect, playing, palette, media, photoId]);

  return <canvas ref={ref} aria-hidden className="block h-full w-full" style={{ width: '100%', aspectRatio: `${SIZE.w} / ${SIZE.h}` }} />;
}
