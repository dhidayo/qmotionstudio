import type { CounterFormat } from '@/core/types';

/**
 * Writing a number element's figure (D-158).
 *
 * Pure and dependency-free, so the renderer, the selection box and the
 * inspector all agree on what "1.3K" is. Only ASCII and Latin-1 characters
 * come out of here — a hyphen-minus rather than U+2212 for negatives, plain
 * spaces between thousands — because the app loads only the Latin subsets of
 * its fonts, and anything else would draw in a fallback face.
 */

const SEPARATOR: Record<CounterFormat['grouping'], string> = {
  none: '',
  comma: ',',
  space: ' ',
  dot: '.',
  // The typewriter apostrophe: the curly one is outside Latin-1.
  apostrophe: "'",
};

const COMPACT: readonly (readonly [number, string])[] = [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']];

export function formatCounter(value: number, format: CounterFormat): string {
  let v = Number.isFinite(value) ? value : 0;
  let mark = '';
  if (format.compact) {
    // 999,600 rounds to "1M", not "1000K": the step is taken where the
    // rounded figure would reach the next unit.
    const abs = Math.abs(v);
    const half = 0.5 / 10 ** format.decimals;
    for (const [size, letter] of COMPACT) {
      if (abs >= size - half * (size / 1000)) {
        v /= size;
        mark = letter;
        break;
      }
    }
  }
  const scale = 10 ** format.decimals;
  let rounded = Math.round(v * scale) / scale;
  if (Object.is(rounded, -0)) rounded = 0;
  const negative = rounded < 0;
  const [whole = '0', fraction] = Math.abs(rounded).toFixed(format.decimals).split('.');
  const separator = SEPARATOR[format.grouping];
  const grouped = separator === '' ? whole : whole.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
  const decimalMark = format.grouping === 'dot' ? ',' : '.';
  // A short form drops trailing zeros: "1K", not "1.0K".
  const shown = fraction === undefined ? '' : format.compact ? fraction.replace(/0+$/, '') : fraction;
  const body = shown.length > 0 ? `${grouped}${decimalMark}${shown}` : grouped;
  return `${negative ? '-' : ''}${format.prefix}${body}${mark}${format.suffix}`;
}

/**
 * The figure the element is measured on: the longest it writes on its way
 * from `from` to `to`. Its selection box is sized by this, so it stays put
 * for the whole count.
 *
 * Usually one of the two ends; but a short form passes figures longer than
 * either on the way — counting to "10K" goes through "999" and "9.9K" — so
 * the longest figure under each letter is tried too, where the count passes it.
 */
export function widestCounterText(from: number, to: number, format: CounterFormat): string {
  const low = Math.min(from, to);
  const high = Math.max(from, to);
  const values = [from, to];
  if (format.compact) {
    const step = 10 ** -format.decimals;
    for (const size of [1, 1e3, 1e6, 1e9]) {
      const top = (1000 - step) * size;
      for (const v of [top, -top]) if (v > low && v < high) values.push(v);
    }
  }
  let widest = formatCounter(from, format);
  for (const value of values) {
    const text = formatCounter(value, format);
    if (longer(text, widest)) widest = text;
  }
  return widest;
}

/** More characters; at equal length, more digits, which are drawn widest. */
function longer(a: string, b: string): boolean {
  const la = Array.from(a).length;
  const lb = Array.from(b).length;
  if (la !== lb) return la > lb;
  return digitsIn(a) > digitsIn(b);
}

function digitsIn(text: string): number {
  let n = 0;
  for (const char of text) if (isDigit(char)) n++;
  return n;
}

/** Is this character a digit, drawn in a fixed-width cell? */
export function isDigit(char: string): boolean {
  return char >= '0' && char <= '9' && char.length === 1;
}

export type CounterGlyph = {
  readonly char: string;
  /** Where the character is drawn from, left of the figure. */
  readonly x: number;
};

export type CounterLayout = {
  readonly glyphs: readonly CounterGlyph[];
  readonly width: number;
};

/**
 * A figure laid out in cells: every digit centred in a cell as wide as the
 * widest digit, every other character at its own width. A proportional "1"
 * is narrower than a "0", so without the cells "1,000" would shuffle sideways
 * as it counted past "1,111".
 *
 * `widthOf` measures one character in the figure's font. The renderer and the
 * selection box both lay a figure out through here, with their own measures,
 * so they agree on how wide it is.
 */
export function layoutCounter(text: string, widthOf: (char: string) => number): CounterLayout {
  let cell = 0;
  for (let d = 0; d <= 9; d++) cell = Math.max(cell, widthOf(String(d)));
  const glyphs: CounterGlyph[] = [];
  let x = 0;
  for (const char of Array.from(text)) {
    const own = widthOf(char);
    const width = isDigit(char) ? cell : own;
    glyphs.push({ char, x: x + (width - own) / 2 });
    x += width;
  }
  return { glyphs, width: x };
}

/**
 * The pill behind a number: never narrower than it is tall, so a single
 * digit — a step, a rank — sits in a circle rather than a lozenge.
 */
export function counterPillWidth(
  figureWidth: number,
  lineHeightPx: number,
  pill: { readonly paddingX: number; readonly paddingY: number },
): number {
  return Math.max(figureWidth + pill.paddingX * 2, lineHeightPx + pill.paddingY * 2);
}
