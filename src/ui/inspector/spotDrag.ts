/**
 * Moving a photo from one spot to another by pressing and dragging (D-165).
 *
 * "The pictures cannot be moved around or rearranged; the order of upload gets
 * automatically placed without flexibility to readjust or move around." The
 * spots used HTML drag and drop, which a touch screen never fires. They now
 * follow the pointer — finger, pen or mouse alike — and these are the rules
 * that tell a drag from a tap or a scroll:
 *
 * - A finger must rest on a photo for `HOLD_MS` first. Moving sooner than
 *   that, by more than `TOUCH_SLOP`, is a scroll of the panel, and the photo
 *   lets it go.
 * - A mouse drags as soon as it has moved `MOUSE_SLOP`: there is no scrolling
 *   to tell it from.
 * - Anything less is a tap, which chooses the spot.
 */

export const HOLD_MS = 350;
export const TOUCH_SLOP = 10;
export const MOUSE_SLOP = 4;

export type PressIntent = 'wait' | 'drag' | 'scroll';

/** What a press has become, from how far it has moved and whether it has been held long enough. */
export function pressIntent(pointerType: string, distance: number, held: boolean): PressIntent {
  if (pointerType === 'mouse') return distance > MOUSE_SLOP ? 'drag' : 'wait';
  if (held) return 'drag';
  return distance > TOUCH_SLOP ? 'scroll' : 'wait';
}

/** The spot one step earlier (-1) or later (+1), or null at either end. */
export function stepTarget(index: number, step: -1 | 1, count: number): number | null {
  const to = index + step;
  return to < 0 || to >= count ? null : to;
}
