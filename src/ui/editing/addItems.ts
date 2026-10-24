import type { ProjectMode } from '@/document/types';

/**
 * Everything that can be added, in one order, in one place (D-153, D-162).
 *
 * "Can I have the + Motion where you already have the + Photo, + Text?" — and
 * shapes, stickers, numbers and sounds joining them, so the list outgrew a
 * row: "we may be having more elements, which mean that we may be having
 * scroll of applicable elements on smaller screen." One list, drawn as a row
 * that scrolls sideways under the picture on a computer and as a grid in the
 * phone's Add sheet, so the two never disagree about what there is.
 *
 * D-162 made it the only row of actions under the picture: "Please ensure same
 * buttons are not shown or both items are not shown two different times with
 * different representations." So it starts with **+ Photos** — the one way to
 * add photos, which puts them in place of the samples (what the big "Add your
 * photos" button did; the old "+ Photo" layer chip went, and extra photos on
 * top are the Photos panel's) — then the things you put on the picture, then
 * what changes how it moves, then what you hear, then a video's scenes, and
 * last the Pro video layer.
 */
export type AddItemId =
  | 'photos' | 'text' | 'shape' | 'sticker' | 'number'
  | 'motion' | 'effect' | 'sound' | 'music' | 'scene' | 'video';

export const ADD_ORDER: readonly AddItemId[] = [
  'photos', 'text', 'shape', 'sticker', 'number', 'motion', 'effect', 'sound', 'music', 'scene', 'video',
];

/**
 * A design (Image mode) is a picture first — exported as a still as often as
 * a clip — so it takes no video layer, sound or music, and switching to it
 * drops any audio (`setMode`). It is one scene, so it has no + Scene either.
 * A video has everything.
 */
const NOT_IN_IMAGES: ReadonlySet<AddItemId> = new Set<AddItemId>(['video', 'sound', 'music', 'scene']);

export function addItemIds(mode: ProjectMode): readonly AddItemId[] {
  return mode === 'motionAd' ? ADD_ORDER : ADD_ORDER.filter((id) => !NOT_IN_IMAGES.has(id));
}

/**
 * The phone's Add sheet (D-162): the bar's items less + Photos, with a
 * video's + Scene first.
 *
 * A phone adds photos from its Photos tool, whose panel holds everything a
 * phone needs for them in one place — + Add photos, Take photo, the design's
 * photo spots and Your photos — and the toolbar is the only way to that
 * panel there. A + Photos in this sheet as well would be the same action
 * twice, in two places that look different, which is what D-162 removes.
 */
export function gridItemIds(mode: ProjectMode): readonly AddItemId[] {
  const ids = addItemIds(mode).filter((id) => id !== 'photos');
  return ids.includes('scene') ? ['scene', ...ids.filter((id) => id !== 'scene')] : ids;
}
