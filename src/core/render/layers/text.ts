import type { Ctx2D, Reveal, TextProps } from '@/core/types';
import { fontString } from '@/fonts/registry';
import { lineOffsetX, type GlyphRun, type TextAlign, type TextLine, type TextSpec } from '@/core/text/layout';
import { progress, roundedRectPath } from '@/core/math/geometry';
import { resolvePaint } from '../paint';
import type { DrawContext } from '../drawContext';

/**
 * Text layers (§6.3).
 *
 * Layout is looked up from the measurement cache; this function only paints.
 * Nothing here calls measureText — that is the whole point of the cache, and a
 * per-character reveal would otherwise measure the string once per character
 * per frame.
 *
 * Reveals run off the layer's local time (D-005 ordering), not off a normalised
 * progress value, because staggered modes need a genuine per-item time offset.
 */
export function drawText(
  dc: DrawContext,
  props: TextProps,
  x: number,
  y: number,
  localMs: number,
  letterSpacingBoostPx: number,
): void {
  const { ctx, palette } = dc;

  const spec: TextSpec = {
    text: props.text,
    font: fontString(props.fontId, props.fontSizePx, props.weight),
    fontSizePx: props.fontSizePx,
    letterSpacingPx: (props.letterSpacingPct / 100) * props.fontSizePx + letterSpacingBoostPx,
    lineHeight: props.lineHeight,
    align: props.align,
    maxWidthPx: props.maxWidthPx,
  };

  // `swap` crossfades between the primary text and the alt phrase, which means
  // the two have different measurements — so the display text is resolved
  // before the run is looked up, not after.
  let displayText = props.text;
  let swapAlpha = 1;
  if (props.reveal.kind === 'swap') {
    const state = swapState(props.reveal, localMs);
    displayText = state.showAlt ? props.reveal.altText : props.text;
    swapAlpha = state.alpha;
  }

  const run = dc.measurer.measure({ ...spec, text: displayText });
  const blockWidth = run.width;

  if (props.pill) {
    const { paddingX, paddingY, radius } = props.pill;
    ctx.save();
    ctx.fillStyle = resolvePaint(props.pill.paint, palette);
    roundedRectPath(
      ctx,
      x - paddingX,
      y - paddingY,
      blockWidth + paddingX * 2,
      run.height + paddingY * 2,
      radius,
    );
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.font = spec.font;
  ctx.letterSpacing = `${spec.letterSpacingPx}px`;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = resolvePaint(props.fill, palette);

  if (props.shadow) {
    ctx.shadowBlur = props.shadow.blur;
    ctx.shadowOffsetX = props.shadow.offsetX;
    ctx.shadowOffsetY = props.shadow.offsetY;
    ctx.shadowColor = resolvePaint(props.shadow.paint, palette);
  }

  if (swapAlpha < 1) ctx.globalAlpha *= swapAlpha;

  applyReveal(dc, props.reveal, run, x, y, blockWidth, localMs, props, spec.align);

  ctx.restore();
}

/**
 * The alphabetic baseline sits one ascent below the line box top. Using the
 * font size as a stand-in for the ascent is close enough for layout and avoids
 * a per-frame TextMetrics read; templates position against the block box.
 */
function baselineOf(line: TextLine, fontSizePx: number): number {
  return line.y + fontSizePx * 0.8;
}

function paintLine(
  ctx: Ctx2D,
  line: TextLine,
  x: number,
  y: number,
  blockWidth: number,
  props: TextProps,
  align: TextAlign,
  outlineStyle: string | null,
): void {
  const offsetX = x + lineOffsetX(line, blockWidth, align);
  const baseline = y + baselineOf(line, props.fontSizePx);
  if (outlineStyle !== null && props.outline) {
    ctx.lineWidth = props.outline.width;
    ctx.strokeStyle = outlineStyle;
    ctx.lineJoin = 'round';
    ctx.strokeText(line.text, offsetX, baseline);
  }
  ctx.fillText(line.text, offsetX, baseline);
}

function applyReveal(
  dc: DrawContext,
  reveal: Reveal,
  run: GlyphRun,
  x: number,
  y: number,
  blockWidth: number,
  localMs: number,
  props: TextProps,
  align: TextAlign,
): void {
  const { ctx } = dc;
  const outlineStyle =
    props.outline && props.outline.width > 0 ? resolvePaint(props.outline.paint, dc.palette) : null;

  switch (reveal.kind) {
    case 'none':
    case 'swap': {
      for (const line of run.lines) paintLine(ctx, line, x, y, blockWidth, props, align, outlineStyle);
      return;
    }

    case 'fade': {
      ctx.globalAlpha *= progress(localMs, reveal.startMs, reveal.startMs + reveal.durationMs);
      for (const line of run.lines) paintLine(ctx, line, x, y, blockWidth, props, align, outlineStyle);
      return;
    }

    case 'maskWipe': {
      const p = progress(localMs, reveal.startMs, reveal.startMs + reveal.durationMs);
      if (p <= 0) return;
      ctx.save();
      ctx.beginPath();
      // Clip to the swept portion of the block, growing from the named edge.
      const horizontal = reveal.dir === 'left' || reveal.dir === 'right';
      const w = horizontal ? blockWidth * p : blockWidth;
      const h = horizontal ? run.height : run.height * p;
      const cx = reveal.dir === 'left' ? x + blockWidth - w : x;
      const cy = reveal.dir === 'up' ? y + run.height - h : y;
      ctx.rect(cx, cy, w, h);
      ctx.clip();
      for (const line of run.lines) paintLine(ctx, line, x, y, blockWidth, props, align, outlineStyle);
      ctx.restore();
      return;
    }

    case 'perWord': {
      for (const line of run.lines) {
        const offsetX = x + lineOffsetX(line, blockWidth, align);
        const baseline = y + baselineOf(line, props.fontSizePx);
        for (const word of line.words) {
          const from = reveal.startMs + word.index * reveal.staggerMs;
          const alpha = progress(localMs, from, from + reveal.durationMs);
          if (alpha <= 0) continue;
          ctx.save();
          ctx.globalAlpha *= alpha;
          // A short rise as each word lands, so the stagger reads as motion
          // rather than as a row of independently blinking words.
          ctx.fillText(word.text, offsetX + word.x, baseline + (1 - alpha) * props.fontSizePx * 0.25);
          ctx.restore();
        }
      }
      return;
    }

    case 'perChar': {
      for (const line of run.lines) {
        const offsetX = x + lineOffsetX(line, blockWidth, align);
        const baseline = y + baselineOf(line, props.fontSizePx);
        for (const box of line.chars) {
          if (box.char.trim().length === 0) continue;
          const from = reveal.startMs + box.index * reveal.staggerMs;
          const alpha = progress(localMs, from, from + reveal.durationMs);
          if (alpha <= 0) continue;
          ctx.save();
          ctx.globalAlpha *= alpha;
          ctx.fillText(box.char, offsetX + box.x, baseline + (1 - alpha) * props.fontSizePx * 0.3);
          ctx.restore();
        }
      }
      return;
    }
  }
}

/** Crossfade between the primary text and the alt phrase (§6.3's `swap`). */
function swapState(
  reveal: Extract<Reveal, { kind: 'swap' }>,
  localMs: number,
): { showAlt: boolean; alpha: number } {
  const half = reveal.durationMs / 2;
  if (localMs < reveal.atMs) return { showAlt: false, alpha: 1 };
  if (localMs < reveal.atMs + half) {
    return { showAlt: false, alpha: 1 - progress(localMs, reveal.atMs, reveal.atMs + half) };
  }
  return { showAlt: true, alpha: progress(localMs, reveal.atMs + half, reveal.atMs + reveal.durationMs) };
}
