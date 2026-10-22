import { describe, expect, it } from 'vitest';
import { ADD_ORDER, addItemIds } from './addItems';

/** One list of things to add, in one order, everywhere (D-153). */

describe('the add bar’s items', () => {
  it('a video has everything, in the agreed order', () => {
    expect(addItemIds('motionAd')).toEqual([
      'text', 'photo', 'video', 'shape', 'sticker', 'number', 'motion', 'effect', 'sound', 'music',
    ]);
  });

  it('a design has no video layer, sound or music, and keeps the order of the rest', () => {
    const ids = addItemIds('showcase');
    expect(ids).toEqual(['text', 'photo', 'shape', 'sticker', 'number', 'motion', 'effect']);
    const positions = ids.map((id) => ADD_ORDER.indexOf(id));
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
});
