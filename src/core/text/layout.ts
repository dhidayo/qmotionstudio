/**
 * The only part of a 2D context that layout actually needs.
 *
 * Narrower than Ctx2D on purpose: it keeps the dependency honest, and it means
 * layout can be unit-tested against a stub with known glyph widths rather than
 * needing a real canvas — so the wrapping and indexing logic is verified in
 * Node, and only rasterisation has to be checked in a browser.
 *
 * Both CanvasRenderingContext2D and OffscreenCanvasRenderingContext2D satisfy
 * this structurally.
 */
export interface TextMeasureContext {
  font: string;
  letterSpacing: string;
  textBaseline: CanvasTextBaseline;
  measureText(text: string): { readonly width: number };
}

/**
 * Text layout and measurement (§6.3).
 *
 * Laid out once at build time into a glyph run, then cached. §6.3 warns that
 * `measureText` per character per frame destroys preview performance on kinetic
 * templates — but the deeper reason for laying out ahead of time is that you
 * *cannot* get per-character positions by summing cached glyph widths: kerning
 * and letter spacing mean the sum of the parts is not the width of the whole.
 * So each character's position is measured from a prefix, once, and every
 * subsequent frame just transforms the cached result.
 */

export type TextAlign = 'left' | 'center' | 'right';

export type TextSpec = {
  readonly text: string;
  /** A full CSS font shorthand, from fonts/registry.fontString. */
  readonly font: string;
  readonly fontSizePx: number;
  /** Resolved to px by the caller — §8.2 expresses it as a percent of font size. */
  readonly letterSpacingPx: number;
  /** Multiplier on font size. */
  readonly lineHeight: number;
  readonly align: TextAlign;
  /** null disables wrapping entirely. */
  readonly maxWidthPx: number | null;
};

export type CharBox = {
  readonly char: string;
  /** Offset from the line's left edge. */
  readonly x: number;
  readonly width: number;
  /** Index within the whole string, for stagger ordering across lines. */
  readonly index: number;
};

export type WordBox = {
  readonly text: string;
  readonly x: number;
  readonly width: number;
  readonly index: number;
};

export type TextLine = {
  readonly text: string;
  readonly width: number;
  /** Top of the line box, relative to the block's top. */
  readonly y: number;
  readonly chars: readonly CharBox[];
  readonly words: readonly WordBox[];
};

export type GlyphRun = {
  readonly lines: readonly TextLine[];
  readonly width: number;
  readonly height: number;
  readonly lineHeightPx: number;
  readonly charCount: number;
  readonly wordCount: number;
};

/** Cache key. Every field that can change a measurement has to be in here. */
export function textCacheKey(spec: TextSpec): string {
  return JSON.stringify([
    spec.text,
    spec.font,
    spec.fontSizePx,
    spec.letterSpacingPx,
    spec.lineHeight,
    spec.align,
    spec.maxWidthPx,
  ]);
}

/**
 * letterSpacing is applied through the context rather than by hand, so that
 * measureText accounts for it. It takes a CSS length string, not a number —
 * passing a number is a silent no-op.
 */
function applyFont(ctx: TextMeasureContext, spec: TextSpec): void {
  ctx.font = spec.font;
  ctx.letterSpacing = `${spec.letterSpacingPx}px`;
  ctx.textBaseline = 'alphabetic';
}

function widthOf(ctx: TextMeasureContext, text: string): number {
  return text.length === 0 ? 0 : ctx.measureText(text).width;
}

export function layoutText(ctx: TextMeasureContext, spec: TextSpec): GlyphRun {
  applyFont(ctx, spec);

  const lineHeightPx = spec.fontSizePx * spec.lineHeight;
  const rawLines = spec.text.split('\n');
  const wrapped: string[] = [];

  for (const raw of rawLines) {
    if (spec.maxWidthPx === null || raw.length === 0) {
      wrapped.push(raw);
      continue;
    }
    wrapped.push(...wrapLine(ctx, raw, spec.maxWidthPx));
  }

  const lines: TextLine[] = [];
  let charIndex = 0;
  let wordIndex = 0;
  let widest = 0;

  for (let i = 0; i < wrapped.length; i++) {
    const text = wrapped[i] ?? '';
    const width = widthOf(ctx, text);
    widest = Math.max(widest, width);

    // Character boxes measured from prefixes, so kerning and letter spacing are
    // both accounted for. Array.from rather than split('') so an emoji or a
    // combining accent stays one box instead of becoming two broken halves.
    const chars: CharBox[] = [];
    const graphemes = Array.from(text);
    let cursor = 0;
    let previousWidth = 0;
    for (const char of graphemes) {
      cursor += char.length;
      const advanceTo = widthOf(ctx, text.slice(0, cursor));
      chars.push({ char, x: previousWidth, width: advanceTo - previousWidth, index: charIndex++ });
      previousWidth = advanceTo;
    }

    const words: WordBox[] = [];
    let searchFrom = 0;
    for (const piece of text.split(/(\s+)/)) {
      if (piece.length > 0 && piece.trim().length > 0) {
        const at = text.indexOf(piece, searchFrom);
        words.push({
          text: piece,
          x: widthOf(ctx, text.slice(0, at)),
          width: widthOf(ctx, piece),
          index: wordIndex++,
        });
      }
      searchFrom += piece.length;
    }

    lines.push({ text, width, y: i * lineHeightPx, chars, words });
  }

  return {
    lines,
    width: widest,
    height: lines.length * lineHeightPx,
    lineHeightPx,
    charCount: charIndex,
    wordCount: wordIndex,
  };
}

function wrapLine(ctx: TextMeasureContext, text: string, maxWidthPx: number): string[] {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return [''];

  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current.length === 0 ? word : `${current} ${word}`;
    // A single word wider than the box still gets its own line rather than
    // being dropped or broken mid-glyph.
    if (current.length === 0 || widthOf(ctx, candidate) <= maxWidthPx) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

/** Left edge of a line within the block, for the given alignment. */
export function lineOffsetX(line: TextLine, blockWidth: number, align: TextAlign): number {
  if (align === 'left') return 0;
  if (align === 'right') return blockWidth - line.width;
  return (blockWidth - line.width) / 2;
}
