import { useEffect, useRef, useState } from 'react';
import type { Layer, Palette } from '@/core/types';
import type { CounterContent, ShapeContent, StickerContent } from '@/document/types';
import { drawLayer } from '@/core/render/drawLayer';
import { counterTextProps, shapeProps, stickerProps, stickerSize } from '@/core/render/elements';
import { stickerDef } from '@/core/stickers/catalog';
import { counterPillWidth, layoutCounter } from '@/core/text/counter';
import { TextMeasurer } from '@/core/text/measure';
import { fontString } from '@/fonts/registry';
import { hashString } from '@/core/effects/random';
import { EMPTY_MEDIA } from '@/core/render/rig';

/**
 * A live picture of one element (D-158), drawn by the real renderer — the
 * same builders and layers as the export, in the look's colours — so what a
 * tile shows is exactly what lands on the design.
 *
 * Still until it is hovered or focused, then it plays; on a touch screen it
 * plays while it is on screen, as the effects library does (D-109). Nothing
 * moves for someone who has asked for reduced motion.
 */

export type ElementContent = ShapeContent | StickerContent | CounterContent;

/** How much of the tile the element fills. */
const FILL = 0.74;
/** How much of the tile's width a sticker may take, when it is wider than tall. */
const WIDE_FILL = 0.94;

type Built = { readonly layer: Layer; readonly loopMs: number; readonly stillMs: number };

const at = (v: number): readonly [{ t: number; v: number; ease: 'linear' }] => [{ t: 0, v, ease: 'linear' }];

function build(content: ElementContent, size: number, measurer: TextMeasurer, seed: number): Built {
  const base = { id: 'element-preview', startMs: 0, endMs: 1e12 } as const;
  const room = size * FILL;

  switch (content.kind) {
    case 'shape': {
      const unit = room / Math.max(0.01, content.w, content.shape === 'line' ? 0 : content.h);
      return {
        layer: { ...base, type: 'shape', tracks: { x: at(size / 2), y: at(size / 2) }, props: shapeProps(content, unit) },
        loopMs: 1,
        stillMs: 0,
      };
    }

    case 'sticker': {
      const box = stickerSize(content.sticker, 1);
      // A wide sticker (Subscribe, Follow) takes nearly the whole width: at
      // the square margin it was a sliver too small to read (D-158).
      const unit = Math.min((size * WIDE_FILL) / Math.max(0.01, box.w), room / Math.max(0.01, box.h));
      const def = stickerDef(content.sticker);
      const speed = Math.max(0.1, content.speed);
      return {
        layer: { ...base, type: 'sticker', tracks: { x: at(size / 2), y: at(size / 2) }, props: stickerProps(content, unit, seed) },
        loopMs: def ? def.loopMs / speed : 1,
        stillMs: def ? def.posterMs / speed : 0,
      };
    }

    case 'counter': {
      // Measured at one size, then scaled to fit the tile — figures scale with their type.
      const trial = counterTextProps(content, 100);
      const spec = {
        text: trial.text,
        font: fontString(trial.fontId, trial.fontSizePx, trial.weight),
        fontSizePx: trial.fontSizePx,
        letterSpacingPx: (trial.letterSpacingPct / 100) * trial.fontSizePx,
        lineHeight: trial.lineHeight,
        align: trial.align,
        maxWidthPx: null,
      };
      const figure = layoutCounter(trial.text, (char) => measurer.measure({ ...spec, text: char }).width).width;
      const lineHeightPx = trial.fontSizePx * trial.lineHeight;
      const w = trial.pill ? counterPillWidth(figure, lineHeightPx, trial.pill) : figure;
      const h = lineHeightPx + (trial.pill ? trial.pill.paddingY * 2 : 0);
      const unit = 100 * Math.min(room / Math.max(1, w), room / Math.max(1, h));
      const props = counterTextProps(content, unit);
      const end = content.delayMs + content.countMs;
      return {
        // Text runs down from its top, so the line's middle is put in the tile's.
        layer: { ...base, type: 'text', tracks: { x: at(size / 2), y: at(size / 2 - (props.fontSizePx * props.lineHeight) / 2) }, props },
        loopMs: end + 1200,
        stillMs: end,
      };
    }
  }
}

export function ElementPreview({
  content,
  active,
  palette,
  autoplay = false,
  size = 112,
  seed = 'preview',
}: {
  content: ElementContent;
  active: boolean;
  /** Plays whenever it is on screen: a phone has no hover. */
  autoplay?: boolean;
  palette: Palette;
  /** CSS pixels, square. */
  size?: number;
  seed?: string;
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
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const playing = !still && (active || (autoplay && visible)) && content.kind !== 'shape';

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const measurer = new TextMeasurer(ctx, new Map());
    const built = build(content, size, measurer, hashString(seed));
    const dc = { ctx, palette, media: EMPTY_MEDIA, measurer, depth: 0 };

    const draw = (timeMs: number): void => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = palette.bg;
      ctx.fillRect(0, 0, size, size);
      drawLayer(dc, built.layer, timeMs);
    };

    if (!playing) {
      draw(built.stillMs);
      return;
    }

    let frame = 0;
    const began = performance.now();
    const tick = (now: number): void => {
      draw((now - began) % Math.max(1, built.loopMs));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); };
  }, [content, playing, palette, size, seed]);

  return <canvas ref={ref} aria-hidden className="block" style={{ width: size, height: size, maxWidth: '100%' }} />;
}
