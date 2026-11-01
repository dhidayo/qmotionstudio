import { describe, expect, it } from 'vitest';
import { failureMessage, readingLabel } from './uploadMessages';

describe('readingLabel', () => {
  it('says Reading… for one file or none', () => {
    expect(readingLabel(null)).toBe('Reading…');
    expect(readingLabel({ done: 0, total: 1 })).toBe('Reading…');
  });

  it('counts through several files', () => {
    expect(readingLabel({ done: 0, total: 5 })).toBe('Reading 1 of 5…');
    expect(readingLabel({ done: 1, total: 5 })).toBe('Reading 2 of 5…');
    expect(readingLabel({ done: 5, total: 5 })).toBe('Reading 5 of 5…');
  });
});

describe('failureMessage', () => {
  const heic = { name: 'IMG_123.HEIC', reason: 'This HEIC image could not be read.' };
  const named = { name: 'b.png', reason: 'Could not decode "b.png". It may be corrupt or in an unsupported format.' };

  it('is null when nothing failed', () => {
    expect(failureMessage(3, [])).toBeNull();
  });

  it('names the photo when the reason does not', () => {
    expect(failureMessage(0, [heic])).toBe('IMG_123.HEIC: This HEIC image could not be read.');
    expect(failureMessage(0, [named])).toBe(named.reason);
  });

  it('says both what was added and what failed', () => {
    expect(failureMessage(3, [heic])).toBe('3 photos added; 1 could not be read. IMG_123.HEIC: This HEIC image could not be read.');
    expect(failureMessage(1, [heic, named])).toBe('1 photo added; 2 could not be read. IMG_123.HEIC: This HEIC image could not be read.');
  });

  it('counts several failures when none were added', () => {
    expect(failureMessage(0, [heic, named])).toBe('2 photos could not be read. IMG_123.HEIC: This HEIC image could not be read.');
  });

  it('takes another noun', () => {
    expect(failureMessage(2, [heic], { one: 'file', many: 'files' })).toBe('2 files added; 1 could not be read. IMG_123.HEIC: This HEIC image could not be read.');
  });
});
