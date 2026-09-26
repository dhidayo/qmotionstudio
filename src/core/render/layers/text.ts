import type { Ctx2D, Reveal, TextProps } from '@/core/types';
import { fontString } from '@/fonts/registry';
import type { GlyphRun, TextAlign, TextLine, TextSpec } from '@/core/text/layout';
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

  const baseSpacingPx = (props.letterSpacingPct / 100) * props.fontSizePx;

  /**
   * The animated letterSpacing boost is deliberately NOT part of the measured
   * spec, for two reasons:
   *
   *   - it is in the cache key, so animating it would miss the cache on every
   *     frame and re-lay out the whole string — defeating §6.3's cache at
   *     exactly the point it exists for;
   *   - measuring per frame re-wraps the text as the spacing grows, so lines
   *     reflow mid-animation, which is never what anyone wants.
   *
   * Instead the run is measured once at the static spacing and the boost is
   * applied as a per-character offset at paint time, from the cached boxes.
   */
  const spec: TextSpec = {
    text: props.text,
    font: fontString(props.fontId, props.fontSizePx, props.weight),
    fontSizePx: props.fontSizePx,
    letterSpacingPx: baseSpacingPx,
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
  const tracked = Math.abs(letterSpacingBoostPx) > 0.01;
  // Extra tracking widens every line by one gap per character after the first.
  const measuredWidth = tracked
    ? run.lines.reduce((widest, line) => Math.max(widest, lineWidthWithBoost(line, letterSpacingBoostPx)), 0)
    : run.width;

  /*
   * Lines are aligned within the *declared* wrap width where there is one.
   *
   * `drawLayer` anchors a text layer on `maxWidthPx` precisely so a centred
   * heading does not shift about as its content changes length. Aligning
   * within the measured width instead made the two disagree: a centred caption
   * with wrapping on was drawn half the slack left of where its anchor said it
   * was, so "Across 50%" did not put it in the middle of the frame. The block
   * has to be the same width in both places or centring cannot mean anything.
   */
  const blockWidth = props.maxWidthPx ?? measuredWidth;

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

  applyReveal(dc, props.reveal, run, x, y, blockWidth, localMs, props, spec.align, letterSpacingBoostPx);

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
  boostPx: number,
): void {
  const baseline = y + baselineOf(line, props.fontSizePx);
  const width = boostPx === 0 ? line.width : lineWidthWithBoost(line, boostPx);
  const offsetX = x + offsetFor(width, blockWidth, align);

  const stroke = (text: string, at: number): void => {
    if (outlineStyle === null || !props.outline) return;
    ctx.lineWidth = props.outline.width;
    ctx.strokeStyle = outlineStyle;
    ctx.lineJoin = 'round';
    ctx.strokeText(text, at, baseline);
  };

  // Fast path: one fillText for the whole line. Only animated tracking forces
  // per-character drawing, and only while it is actually non-zero.
  if (boostPx === 0) {
    stroke(line.text, offsetX);
    ctx.fillText(line.text, offsetX, baseline);
    return;
  }

  for (let i = 0; i < line.chars.length; i++) {
    const box = line.chars[i];
    if (!box) continue;
    const at = offsetX + box.x + i * boostPx;
    stroke(box.char, at);
    ctx.fillText(box.char, at, baseline);
  }
}

/** A line's width once an animated tracking boost is added between its characters. */
function lineWidthWithBoost(line: TextLine, boostPx: number): number {
  return line.width + Math.max(0, line.chars.length - 1) * boostPx;
}

function offsetFor(lineWidth: number, blockWidth: number, align: TextAlign): number {
  if (align === 'left') return 0;
  if (align === 'right') return blockWidth - lineWidth;
  return (blockWidth - lineWidth) / 2;
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
  boostPx: number,
): void {
  const { ctx } = dc;
  const outlineStyle =
    props.outline && props.outline.width > 0 ? resolvePaint(props.outline.paint, dc.palette) : null;

  switch (reveal.kind) {
    case 'none':
    case 'swap': {
      for (const line of run.lines) paintLine(ctx, line, x, y, blockWidth, props, align, outlineStyle, boostPx);
      return;
    }

    case 'fade': {
      ctx.globalAlpha *= progress(localMs, reveal.startMs, reveal.startMs + reveal.durationMs);
      for (const line of run.lines) paintLine(ctx, line, x, y, blockWidth, props, align, outlineStyle, boostPx);
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
      for (const line of run.lines) paintLine(ctx, line, x, y, blockWidth, props, align, outlineStyle, boostPx);
      ctx.restore();
      return;
    }

    case 'perWord': {
      for (const line of run.lines) {
        const offsetX = x + offsetFor(lineWidthWithBoost(line, boostPx), blockWidth, align);
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
        const offsetX = x + offsetFor(lineWidthWithBoost(line, boostPx), blockWidth, align);
        const baseline = y + baselineOf(line, props.fontSizePx);
        for (let ci = 0; ci < line.chars.length; ci++) {
          const box = line.chars[ci];
          if (!box) continue;
          if (box.char.trim().length === 0) continue;
          const from = reveal.startMs + box.index * reveal.staggerMs;
          const alpha = progress(localMs, from, from + reveal.durationMs);
          if (alpha <= 0) continue;
          ctx.save();
          ctx.globalAlpha *= alpha;
          ctx.fillText(box.char, offsetX + box.x + ci * boostPx, baseline + (1 - alpha) * props.fontSizePx * 0.3);
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
