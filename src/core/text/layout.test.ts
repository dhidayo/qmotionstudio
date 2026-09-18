import { describe, expect, it } from 'vitest';
import { layoutText, lineOffsetX, textCacheKey, type TextMeasureContext, type TextSpec } from './layout';

/**
 * A stub with known glyph widths: every character is 10px wide, plus whatever
 * letter spacing is set. Deterministic, so wrapping and indexing can be
 * asserted exactly rather than approximately.
 */
function stubContext(): TextMeasureContext {
  const ctx: TextMeasureContext = {
    font: '',
    letterSpacing: '0px',
    textBaseline: 'alphabetic',
    measureText: (text: string) => {
      const spacing = Number.parseFloat(ctx.letterSpacing) || 0;
      return { width: text.length * (10 + spacing) };
    },
  };
  return ctx;
}

const spec = (over: Partial<TextSpec> = {}): TextSpec => ({
  text: 'hello',
  font: '600 40px sans-serif',
  fontSizePx: 40,
  letterSpacingPx: 0,
  lineHeight: 1.2,
  align: 'left',
  maxWidthPx: null,
  ...over,
});

describe('layoutText — basics', () => {
  it('lays a single line out with the measured width', () => {
    const run = layoutText(stubContext(), spec());
    expect(run.lines).toHaveLength(1);
    expect(run.width).toBe(50);
    expect(run.lineHeightPx).toBe(48);
    expect(run.height).toBe(48);
  });

  it('honours explicit newlines without wrapping', () => {
    const run = layoutText(stubContext(), spec({ text: 'ab\ncde' }));
    expect(run.lines.map((l) => l.text)).toEqual(['ab', 'cde']);
    expect(run.lines[1]?.y).toBe(48);
    expect(run.width).toBe(30);
  });

  it('counts characters and words across every line', () => {
    const run = layoutText(stubContext(), spec({ text: 'one two\nthree' }));
    expect(run.wordCount).toBe(3);
    expect(run.charCount).toBe('one two'.length + 'three'.length);
  });
});

describe('layoutText — character boxes', () => {
  it('places characters end to end with no gaps or overlaps', () => {
    const run = layoutText(stubContext(), spec({ text: 'abcd' }));
    const chars = run.lines[0]?.chars ?? [];
    expect(chars.map((c) => c.x)).toEqual([0, 10, 20, 30]);
    expect(chars.every((c) => c.width === 10)).toBe(true);
  });

  it('accounts for letter spacing in both position and width', () => {
    // This is the reason spacing goes through the context rather than being
    // added by hand: measureText has to see it, or every position is wrong.
    const run = layoutText(stubContext(), spec({ text: 'abcd', letterSpacingPx: 4 }));
    const chars = run.lines[0]?.chars ?? [];
    expect(chars.map((c) => c.x)).toEqual([0, 14, 28, 42]);
    expect(run.width).toBe(56);
  });

  it('numbers characters continuously across lines, for staggered reveals', () => {
    const run = layoutText(stubContext(), spec({ text: 'ab\ncd' }));
    expect(run.lines[0]?.chars.map((c) => c.index)).toEqual([0, 1]);
    expect(run.lines[1]?.chars.map((c) => c.index)).toEqual([2, 3]);
  });

  it('keeps an emoji as one box rather than two broken halves', () => {
    // 'a🙂b' is four UTF-16 units but three glyphs. split('') would produce a
    // pair of lone surrogates that render as tofu.
    const run = layoutText(stubContext(), spec({ text: 'a\u{1F642}b' }));
    const chars = run.lines[0]?.chars ?? [];
    expect(chars).toHaveLength(3);
    expect(chars[1]?.char).toBe('\u{1F642}');
  });
});

describe('layoutText — word boxes', () => {
  it('positions words and skips the whitespace between them', () => {
    const run = layoutText(stubContext(), spec({ text: 'ab cd' }));
    const words = run.lines[0]?.words ?? [];
    expect(words.map((w) => w.text)).toEqual(['ab', 'cd']);
    expect(words.map((w) => w.x)).toEqual([0, 30]);
  });

  it('does not confuse a repeated word with its earlier occurrence', () => {
    // Naive indexOf without a cursor would give both "go"s the same x.
    const run = layoutText(stubContext(), spec({ text: 'go on go' }));
    const words = run.lines[0]?.words ?? [];
    expect(words.map((w) => w.x)).toEqual([0, 30, 60]);
    expect(words.map((w) => w.index)).toEqual([0, 1, 2]);
  });
});

describe('layoutText — wrapping', () => {
  it('breaks at the last word that fits', () => {
    // Each word is 30px; 70px fits two words plus a space (50) but not three.
    const run = layoutText(stubContext(), spec({ text: 'abc abc abc', maxWidthPx: 70 }));
    expect(run.lines.map((l) => l.text)).toEqual(['abc abc', 'abc']);
  });

  it('never wraps when maxWidthPx is null', () => {
    const run = layoutText(stubContext(), spec({ text: 'abc abc abc abc', maxWidthPx: null }));
    expect(run.lines).toHaveLength(1);
  });

  it('gives an over-long single word its own line rather than dropping it', () => {
    const run = layoutText(stubContext(), spec({ text: 'short enormouslylongword', maxWidthPx: 60 }));
    expect(run.lines.map((l) => l.text)).toEqual(['short', 'enormouslylongword']);
  });

  it('wraps each explicit line independently', () => {
    const run = layoutText(stubContext(), spec({ text: 'abc abc\nxyz', maxWidthPx: 40 }));
    expect(run.lines.map((l) => l.text)).toEqual(['abc', 'abc', 'xyz']);
  });

  it('keeps an empty line as an empty line rather than collapsing it', () => {
    const run = layoutText(stubContext(), spec({ text: 'a\n\nb', maxWidthPx: 100 }));
    expect(run.lines.map((l) => l.text)).toEqual(['a', '', 'b']);
    expect(run.height).toBe(144);
  });
});

describe('lineOffsetX', () => {
  const line = { text: 'x', width: 40, y: 0, chars: [], words: [] };

  it('aligns left, centre and right', () => {
    expect(lineOffsetX(line, 100, 'left')).toBe(0);
    expect(lineOffsetX(line, 100, 'center')).toBe(30);
    expect(lineOffsetX(line, 100, 'right')).toBe(60);
  });
});

describe('textCacheKey', () => {
  it('changes when any measurable property changes', () => {
    const base = textCacheKey(spec());
    const variants: Partial<TextSpec>[] = [
      { text: 'hello ' },
      { font: '700 40px sans-serif' },
      { fontSizePx: 41 },
      { letterSpacingPx: 1 },
      { lineHeight: 1.3 },
      { align: 'center' },
      { maxWidthPx: 400 },
    ];
    for (const over of variants) {
      expect(textCacheKey(spec(over)), JSON.stringify(over)).not.toBe(base);
    }
  });

  it('is stable for identical specs', () => {
    expect(textCacheKey(spec())).toBe(textCacheKey(spec()));
  });

  it('does not collide when fields shift across the separator', () => {
    // A naive join would make ('a','b') and ('a|b','') the same key.
    expect(textCacheKey(spec({ text: 'a' }))).not.toBe(textCacheKey(spec({ text: 'a","' })));
  });
});
