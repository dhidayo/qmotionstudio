import { stickerDef } from '@/core/stickers/catalog';
import { formatCounter } from '@/core/text/counter';
import { labelIn } from '@/core/render/parts';
import { parseSlotKey } from '@/core/render/slots';
import type { Layer } from '@/core/types';
import { SHAPE_NAMES } from '@/document/elements';
import type { CounterContent, OverlayContent, SceneInputs, ShapeContent, StickerContent } from '@/document/types';
import type { SceneTemplate, TextSlotDef } from '@/templates/schema';
import { slotWords } from '@/templates/_shared/text';
import { listEntries, numbers } from '@/templates/_shared/numbering';

/**
 * What things are called, in one place and without the editor's state, so the
 * canvas's menus, the phone's toolbar, the timeline and the Elements list
 * (D-167) never call the same thing by two names. Pure: the list's tests run
 * it without a browser.
 */

/** What an element is, in a word or two: "Star", "Check tick", "1,000" (D-158). */
export function elementName(content: ShapeContent | StickerContent | CounterContent): string {
  switch (content.kind) {
    case 'shape': return SHAPE_NAMES[content.shape];
    case 'sticker': return stickerDef(content.sticker)?.name ?? 'Sticker';
    case 'counter': return formatCounter(content.to, content.format);
  }
}

/** What kind of layer something added on top is, as a heading word: "Sticker", "Video clip" (D-167). */
export function overlayKindName(content: OverlayContent): string {
  switch (content.kind) {
    case 'text': return 'Text';
    case 'photo': return 'Extra photo';
    case 'customMedia': return 'Video clip';
    case 'shape': return 'Shape';
    case 'sticker': return 'Sticker';
    case 'counter': return 'Number';
  }
}

/**
 * A design's own element by name, capitalised as a title: "Photo 2",
 * "Brand mark", "Pillar 2", "Headline" — the part's or entry's own label when
 * the design gives one, the text slot's otherwise. Null when nothing names it.
 */
export function slotTitle(key: string, layers: readonly Layer[] | null, template: Pick<SceneTemplate, 'textSlots'> | null): string | null {
  const parsed = parseSlotKey(key);
  if (parsed?.kind === 'photo') return `Photo ${parsed.index + 1}`;
  const named = layers === null ? null : labelIn(layers, key);
  if (named !== null) return named;
  if (parsed?.kind === 'text') {
    const def = template?.textSlots.find((slot) => slot.id === parsed.id);
    if (!def) return null;
    return parsed.item === undefined ? def.label : `${def.label} ${parsed.item + 1}`;
  }
  return null;
}

/**
 * The words of one entry of a list text (D-159): `item` of its comma-separated
 * words, or of the numbers its pattern counts to over `count` entries.
 */
export function entryWords(def: TextSlotDef, inputs: Pick<SceneInputs, 'texts'>, item: number, count: number): string {
  const current = slotWords(def, inputs);
  const all = def.list === 'numbers' ? numbers(current, Math.max(item + 1, count)) : listEntries(current, def.listSeparator ?? ',');
  return all[item] ?? '';
}
