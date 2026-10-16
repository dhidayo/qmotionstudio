import type { StickerCategory, StickerDef } from './types';
import { BADGES } from './badges';

/**
 * The sticker library (D-158), in picker order. Each entry's art lives in the
 * file for its category. Ids are permanent — projects store them — so a
 * sticker is never renamed, only added; an id this build does not know draws
 * nothing rather than failing.
 */
export const STICKERS: readonly StickerDef[] = [...BADGES];

export const STICKER_CATEGORIES: readonly StickerCategory[] = ['Social', 'Reactions', 'Badges', 'Pointers'];

const BY_ID = new Map<string, StickerDef>(STICKERS.map((def) => [def.id, def]));

export function stickerDef(id: string): StickerDef | undefined {
  return BY_ID.get(id);
}
