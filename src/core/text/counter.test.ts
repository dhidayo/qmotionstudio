import { describe, expect, it } from 'vitest';
import type { CounterFormat } from '@/core/types';
import { counterPillWidth, formatCounter, layoutCounter, widestCounterText } from './counter';

/**
 * Number elements' figures (D-158). What matters is that the same value
 * always writes the same way, in characters every loaded font has.
 */

const PLAIN: CounterFormat = { decimals: 0, grouping: 'comma', compact: false, prefix: '', suffix: '' };
const f = (patch: Partial<CounterFormat>): CounterFormat => ({ ...PLAIN, ...patch });

describe('formatCounter', () => {
  it('groups thousands', () => {
    expect(formatCounter(1_234_567, PLAIN)).toBe('1,234,567');
    expect(formatCounter(999, PLAIN)).toBe('999');
    expect(formatCounter(1_234_567, f({ grouping: 'space' }))).toBe('1 234 567');
    expect(formatCounter(1_234_567, f({ grouping: 'none' }))).toBe('1234567');
  });

  it('writes decimals after a comma when thousands are dotted', () => {
    expect(formatCounter(1234.5, f({ grouping: 'dot', decimals: 1 }))).toBe('1.234,5');
    expect(formatCounter(1234.5, f({ decimals: 2 }))).toBe('1,234.50');
  });

  it('rounds to the decimals asked for', () => {
    expect(formatCounter(4.86, f({ decimals: 1 }))).toBe('4.9');
    expect(formatCounter(12.5, PLAIN)).toBe('13');
  });

  it('shortens to K, M and B at the boundaries', () => {
    const short = f({ compact: true });
    expect(formatCounter(999, short)).toBe('999');
    expect(formatCounter(1000, short)).toBe('1K');
    expect(formatCounter(1250, f({ compact: true, decimals: 1 }))).toBe('1.3K');
    // Rounds up into the next letter rather than writing "1000K".
    expect(formatCounter(999_600, short)).toBe('1M');
    expect(formatCounter(2.5e6, f({ compact: true, decimals: 1, prefix: '$', suffix: '+' }))).toBe('$2.5M+');
    expect(formatCounter(3e9, short)).toBe('3B');
    // A short form drops trailing zeros.
    expect(formatCounter(2e6, f({ compact: true, decimals: 2 }))).toBe('2M');
  });

  it('puts the sign before a prefix, and never writes "-0"', () => {
    expect(formatCounter(-5, f({ prefix: '$' }))).toBe('-$5');
    expect(formatCounter(-0.2, PLAIN)).toBe('0');
    expect(formatCounter(-0, PLAIN)).toBe('0');
  });

  it('uses only ASCII and Latin-1 for what it adds', () => {
    for (const v of [-1234.56, 0, 5e9]) {
      for (const grouping of ['comma', 'space', 'dot', 'none', 'apostrophe'] as const) {
        const text = formatCounter(v, f({ grouping, decimals: 2 }));
        expect(Array.from(text).every((c) => (c.codePointAt(0) ?? 0) <= 0xff)).toBe(true);
      }
    }
  });

  it('treats a value that is not a number as nought', () => {
    expect(formatCounter(Number.NaN, PLAIN)).toBe('0');
  });
});

describe('widestCounterText', () => {
  it('picks the longer end', () => {
    expect(widestCounterText(0, 1000, PLAIN)).toBe('1,000');
    expect(widestCounterText(1000, 0, PLAIN)).toBe('1,000');
    expect(widestCounterText(-50, 5, PLAIN)).toBe('-50');
  });

  it('allows for a short form passing longer figures on the way', () => {
    // Counting to "10K" goes through "999" and "9.9K".
    expect(widestCounterText(0, 10_000, f({ compact: true }))).toBe('999');
    expect(widestCounterText(0, 10_000, f({ compact: true, decimals: 1 }))).toBe('999.9');
    expect(widestCounterText(0, 2e6, f({ compact: true, decimals: 1, suffix: '+' }))).toBe('999.9K+');
  });

  it('is the figure itself for a number that does not count', () => {
    expect(widestCounterText(7, 7, f({ prefix: '#' }))).toBe('#7');
  });
});

describe('layoutCounter', () => {
  // A proportional face: "1" is narrow, everything else 10.
  const width = (c: string): number => (c === '1' ? 4 : c === ',' ? 3 : 10);

  it('puts every digit in a cell as wide as the widest', () => {
    const one = layoutCounter('1,111', width);
    const nine = layoutCounter('9,999', width);
    expect(one.width).toBe(nine.width);
    expect(one.width).toBe(4 * 10 + 3);
  });

  it('centres a narrow digit in its cell', () => {
    const { glyphs } = layoutCounter('1', width);
    expect(glyphs[0]?.x).toBe(3);
  });

  it('keeps other characters at their own width', () => {
    const { glyphs, width: total } = layoutCounter('$5', (c) => (c === '$' ? 7 : 10));
    expect(glyphs.map((g) => g.x)).toEqual([0, 7]);
    expect(total).toBe(17);
  });
});

describe('counterPillWidth', () => {
  it('is never narrower than it is tall, so one digit sits in a circle', () => {
    expect(counterPillWidth(20, 60, { paddingX: 10, paddingY: 10 })).toBe(80);
    expect(counterPillWidth(200, 60, { paddingX: 10, paddingY: 10 })).toBe(220);
  });
});
