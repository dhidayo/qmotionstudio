import { describe, expect, it } from 'vitest';
import { addedPhotosMessage, onTopMessage } from './photoMessages';

/** The words after adding photos (D-150): exactly what happened, one for one. */
describe('what adding photos says', () => {
  it('counts the samples replaced', () => {
    expect(addedPhotosMessage({ replaced: 1, added: 0, waiting: [] }, null)).toBe('Your photo replaced a sample.');
    expect(addedPhotosMessage({ replaced: 3, added: 0, waiting: [] }, null)).toBe('Your 3 photos replaced 3 samples.');
  });

  it('names the scene in a video', () => {
    expect(addedPhotosMessage({ replaced: 2, added: 0, waiting: [] }, 2)).toBe('Scene 2: your 2 photos replaced 2 samples.');
  });

  it('says when new spots were made, and what is left waiting', () => {
    expect(addedPhotosMessage({ replaced: 0, added: 1, waiting: [] }, null)).toBe('Your photo is in a new photo spot.');
    expect(addedPhotosMessage({ replaced: 2, added: 2, waiting: ['e'] }, null))
      .toBe('Your 4 photos replaced 2 samples and filled 2 new photo spots. This design is now full, so 1 more is waiting in Your photos.');
  });

  it('says a full design is full, and how to make room', () => {
    expect(addedPhotosMessage({ replaced: 0, added: 0, waiting: ['a'] }, null))
      .toBe('This design is full — your photo is waiting in Your photos. To use it, take one of yours out with × in Photos.');
  });

  it('puts photos on top of a design with no spots', () => {
    expect(onTopMessage(1, null)).toBe('This design has no photo spots, so your photo is on top of it as an extra photo. Drag it where you want it.');
    expect(onTopMessage(3, 4)).toBe('Scene 4 has no photo spots, so your 3 photos are on top of it as extra photos. Drag them where you want them.');
  });
});
