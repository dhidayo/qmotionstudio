import { describe, expect, it } from 'vitest';
import { ADD_ORDER, addItemIds, gridItemIds } from './addItems';

/** One list of things to add, in one order, everywhere (D-153, D-162). */

describe('the add bar’s items', () => {
  it('a video has everything, in the agreed order, photos first', () => {
    expect(addItemIds('motionAd')).toEqual([
      'photos', 'text', 'element', 'motion', 'effect', 'sound', 'scene', 'video',
    ]);
  });

  it('has no + Music, and one + Element for shapes, stickers and numbers (D-163)', () => {
    for (const mode of ['motionAd', 'showcase'] as const) {
      for (const gone of ['music', 'shape', 'sticker', 'number']) {
        expect(addItemIds(mode)).not.toContain(gone);
        expect(gridItemIds(mode)).not.toContain(gone);
      }
      expect(addItemIds(mode).filter((id) => id === 'element')).toHaveLength(1);
    }
  });

  it('a design has no video layer, sound or scene, and keeps the order of the rest', () => {
    const ids = addItemIds('showcase');
    expect(ids).toEqual(['photos', 'text', 'element', 'motion', 'effect']);
    const positions = ids.map((id) => ADD_ORDER.indexOf(id));
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('each item appears once — there is one way to add photos (D-162)', () => {
    for (const mode of ['motionAd', 'showcase'] as const) {
      expect(new Set(addItemIds(mode)).size).toBe(addItemIds(mode).length);
      expect(addItemIds(mode).filter((id) => id === 'photos')).toHaveLength(1);
    }
  });
});

describe('the phone’s Add sheet', () => {
  it('starts with + Scene in a video, and leaves photos to the Photos tool (D-162)', () => {
    expect(gridItemIds('motionAd')[0]).toBe('scene');
    expect(gridItemIds('showcase')[0]).toBe('text');
    for (const mode of ['motionAd', 'showcase'] as const) {
      expect(gridItemIds(mode)).not.toContain('photos');
      expect([...gridItemIds(mode), 'photos'].sort()).toEqual([...addItemIds(mode)].sort());
    }
  });
});
