import { describe, expect, it } from 'vitest';
import { wrap } from './clip';

/**
 * The clip's time mapping (D-051).
 *
 * Pure, and worth testing here rather than through a browser: looping is the
 * behaviour that decides what a two-second texture does under a ten-second
 * overlay, and an off-by-one at the wrap point is invisible in a screenshot.
 */
describe('wrap — a clip loops under a longer overlay', () => {
  it('passes time through while inside the clip', () => {
    expect(wrap(0, 4_000)).toBe(0);
    expect(wrap(1_500, 4_000)).toBe(1_500);
  });

  it('wraps at the duration, not one frame after it', () => {
    expect(wrap(4_000, 4_000)).toBe(0);
    expect(wrap(4_001, 4_000)).toBe(1);
  });

  it('keeps wrapping on later passes', () => {
    expect(wrap(9_500, 4_000)).toBe(1_500);
    expect(wrap(400_500, 4_000)).toBe(500);
  });

  it('handles a negative local time rather than returning one', () => {
    // An overlay's layer time can go slightly negative between the clip being
    // placed and the playhead catching up; a negative index into the ring
    // would simply never match.
    expect(wrap(-500, 4_000)).toBe(3_500);
    expect(wrap(-4_500, 4_000)).toBe(3_500);
  });

  it('refuses to divide by a zero-length clip', () => {
    expect(wrap(1_000, 0)).toBe(0);
    expect(wrap(1_000, -5)).toBe(0);
  });

  it('is defined for a non-finite time', () => {
    expect(wrap(Number.NaN, 4_000)).toBe(0);
    expect(wrap(Number.POSITIVE_INFINITY, 4_000)).toBe(0);
  });
});
