import type { ProjectMode } from '@/document/types';

/**
 * Everything that can be added, in one order, in one place (D-153).
 *
 * "Can I have the + Motion where you already have the + Photo, + Text?" — and
 * shapes, stickers, numbers and sounds joining them, so the list outgrew a
 * row: "we may be having more elements, which mean that we may be having
 * scroll of applicable elements on smaller screen." One list, drawn as a row
 * that scrolls sideways under the picture on a computer and as a grid in the
 * phone's Add sheet, so the two never disagree about what there is.
 *
 * Things you put on the picture come first, then what changes how it moves,
 * then what you hear.
 */
export type AddItemId =
  | 'text' | 'photo' | 'video' | 'shape' | 'sticker' | 'number'
  | 'motion' | 'effect' | 'sound' | 'music';

export const ADD_ORDER: readonly AddItemId[] = [
  'text', 'photo', 'video', 'shape', 'sticker', 'number', 'motion', 'effect', 'sound', 'music',
];

/**
 * A design (Image mode) is a picture first — exported as a still as often as
 * a clip — so it takes no video layer, sound or music, and switching to it
 * drops any audio (`setMode`). A video has everything.
 */
const NOT_IN_IMAGES: ReadonlySet<AddItemId> = new Set<AddItemId>(['video', 'sound', 'music']);

export function addItemIds(mode: ProjectMode): readonly AddItemId[] {
  return mode === 'motionAd' ? ADD_ORDER : ADD_ORDER.filter((id) => !NOT_IN_IMAGES.has(id));
}
