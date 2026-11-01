import { describe, expect, it } from 'vitest';
import { MOUSE_SLOP, TOUCH_SLOP, pressIntent, stepTarget } from './spotDrag';

describe('pressIntent', () => {
  it('lets a mouse drag after a small movement, without holding', () => {
    expect(pressIntent('mouse', MOUSE_SLOP, false)).toBe('wait');
    expect(pressIntent('mouse', MOUSE_SLOP + 1, false)).toBe('drag');
  });

  it('makes a finger hold before it drags, so the panel still scrolls', () => {
    expect(pressIntent('touch', 2, false)).toBe('wait');
    expect(pressIntent('touch', TOUCH_SLOP + 1, false)).toBe('scroll');
    expect(pressIntent('touch', 0, true)).toBe('drag');
    expect(pressIntent('pen', 40, true)).toBe('drag');
  });
});

describe('stepTarget', () => {
  it('moves one spot either way', () => {
    expect(stepTarget(1, -1, 4)).toBe(0);
    expect(stepTarget(1, 1, 4)).toBe(2);
  });

  it('stops at the ends', () => {
    expect(stepTarget(0, -1, 4)).toBeNull();
    expect(stepTarget(3, 1, 4)).toBeNull();
  });
});
