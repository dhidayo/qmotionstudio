import { describe, expect, it } from 'vitest';
import type { GlyphRun } from '@/core/text/layout';
import type { KineticReveal } from '@/core/types';
import { countedText, hash, unitsOf } from './kinetic';

const run: GlyphRun = {
  width: 100,
  height: 20,
  lineHeightPx: 20,
  charCount: 7,
  wordCount: 2,
  lines: [{
    text: 'Hi you',
    width: 60,
    y: 0,
    chars: Array.from({ length: 6 }, (_, index) => ({ char: 'Hi you'.charAt(index), x: index * 10, width: 10, index })),
    words: [{ text: 'Hi', x: 0, width: 20, index: 0 }, { text: 'you', x: 30, width: 30, index: 1 }],
  }],
};

const reveal = (unit: KineticReveal['unit']): KineticReveal => ({ kind: 'kinetic', unit, motion: 'rise', startMs: 0, durationMs: 100, staggerMs: 10 });

describe('kinetic type (D-118)', () => {
  it('splits into letters (skipping spaces), words or lines, where the static text would sit', () => {
    expect(unitsOf(reveal('char'), run, 0, 0, 100, 20, 'left').map((u) => u.text).join('')).toBe('Hiyou');
    const words = unitsOf(reveal('word'), run, 0, 0, 100, 20, 'center');
    expect(words.map((u) => u.text)).toEqual(['Hi', 'you']);
    // Centred in a 100-wide block, a 60-wide line starts 20 in.
    expect(words[0]?.x).toBe(20);
    expect(unitsOf(reveal('line'), run, 0, 0, 100, 20, 'right')[0]?.x).toBe(40);
  });

  it('counts numbers up from zero, keeping their format', () => {
    expect(countedText('2,500+ customers', 0)).toBe('0+ customers');
    expect(countedText('2,500+ customers', 1)).toBe('2,500+ customers');
    expect(countedText('98.5% uptime', 1)).toBe('98.5% uptime');
    expect(countedText('12,000', 0.5)).toMatch(/^\d{1,2},\d{3}$/);
    expect(countedText('No numbers here', 0.5)).toBe('No numbers here');
  });

  it('leaves a figure made of several numbers as written, rather than counting each from nothing', () => {
    expect(countedText('24/7', 0)).toBe('24/7');
    expect(countedText('4.9/5 stars', 0.3)).toBe('4.9/5 stars');
  });
});

describe('hash', () => {
  it('is a stable number in [0, 1) for every input', () => {
    for (let i = 0; i < 2_000; i++) {
      for (const salt of [0, 1, 7, 22, 99]) {
        const h = hash(i, salt);
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThan(1);
        expect(hash(i, salt)).toBe(h);
      }
    }
  });
});
