import { describe, expect, it } from 'vitest';
import { FOLD_BELOW_PX, initialFolded, parseFold, readFold, writeFold } from './timelineFold';

/** Whether the timeline starts folded (D-153). */

describe('the remembered fold', () => {
  it('reads only the two values it writes', () => {
    expect(parseFold('open')).toBe('open');
    expect(parseFold('closed')).toBe('closed');
    for (const raw of [null, undefined, '', 'true', 'OPEN', '1', 240, {}]) expect(parseFold(raw)).toBeNull();
  });

  it('with nothing stored, a short window starts folded and a tall one open', () => {
    expect(initialFolded(null, 700)).toBe(true);
    expect(initialFolded(null, FOLD_BELOW_PX - 1)).toBe(true);
    expect(initialFolded(null, FOLD_BELOW_PX)).toBe(false);
    expect(initialFolded(null, 1_000)).toBe(false);
  });

  it('the person’s own choice wins over the window', () => {
    expect(initialFolded('open', 600)).toBe(false);
    expect(initialFolded('closed', 1_200)).toBe(true);
  });

  it('a device without storage folds by the window and never throws', () => {
    // Vitest runs in node, which has no localStorage: the same as a blocked one.
    expect(readFold()).toBeNull();
    expect(() => { writeFold('closed'); }).not.toThrow();
  });
});
