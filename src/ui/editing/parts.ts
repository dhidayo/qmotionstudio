import * as actions from '@/document/actions';
import type { SceneInputs } from '@/document/types';
import type { Layer } from '@/core/types';
import { entriesDrawn, partsIn, type PartInfo } from '@/core/render/parts';
import { parseSlotKey } from '@/core/render/slots';
import type { SceneTemplate } from '@/templates/schema';
import { slotWords } from '@/templates/_shared/text';
import { listEntries, numbers } from '@/templates/_shared/numbering';
import { useEditor } from '@/state/store';
import { useOverlays } from '@/ui/shell/overlays';
import { currentLayout, type Layout } from '@/ui/shell/useLayout';
import { useDrawnScene } from '@/ui/artboard/drawnScene';

/**
 * A design's own parts in the editor (D-159): where their settings are, and
 * how typing into a part's letter or number, or one entry of a list, is
 * written back. One place, so the canvas, its menus, the toolbar and the
 * phone all mean the same thing.
 */

/** The Style section that holds the selected part's settings. */
export const PART_SECTION = 'Shape';

/** A part's settings, wherever settings are on this screen — as an added element's are (D-158). */
export function editPart(key: string, layout: Layout = currentLayout()): void {
  const s = useEditor.getState();
  const o = useOverlays.getState();
  s.selectSlot(key, 'look');
  if (layout === 'phone') {
    o.openPhonePanel('style', PART_SECTION);
    return;
  }
  if (layout === 'tablet') o.setInspectorSheet(true);
  o.focusInspectorSection(PART_SECTION);
}

/** The parts the selected scene's design drew, once it has drawn. */
export function sceneParts(layers: readonly Layer[] | null): readonly PartInfo[] {
  return layers === null ? [] : partsIn(layers);
}

/** The drawn layers of the selected scene, or null while another scene is on the canvas. */
export function selectedSceneLayers(): readonly Layer[] | null {
  const { drawn } = useDrawnScene.getState();
  const s = useEditor.getState();
  const scene = s.project.scenes[s.selectedScene];
  return drawn && scene && drawn.sceneId === scene.id ? drawn.layers : null;
}

/** A text slot, or one entry of it, as typing sees it. */
export type Entry = { readonly slot: string; readonly item?: number };

/** What typing into an entry starts from, and how a change is written back. */
export function entryEditing(
  entry: Entry,
  inputs: SceneInputs,
  template: SceneTemplate | null,
  layers: readonly Layer[] | null,
): { text: string; maxLength: number | undefined; write: (words: string | null) => actions.Action } | null {
  const def = template?.textSlots.find((slot) => slot.id === entry.slot);
  if (!def) return null;
  const current = slotWords(def, inputs);
  if (entry.item === undefined) {
    return { text: current, maxLength: def.maxChars, write: (words) => actions.setText(def.id, words ?? '') };
  }
  const item = entry.item;
  const numbered = def.list === 'numbers';
  const count = Math.max(item + 1, layers === null ? 0 : entriesDrawn(layers, def.id));
  const text = (numbered ? numbers(current, count) : listEntries(current))[item] ?? '';
  return {
    text,
    maxLength: undefined,
    write: (words) => actions.setListItem(def.id, item, words, { current, count, numbered }),
  };
}

/** The entry a slot key types into: a text's own, or a list entry's. */
export function entryOfKey(key: string): Entry | null {
  const parsed = parseSlotKey(key);
  if (parsed?.kind !== 'text') return null;
  return parsed.item === undefined ? { slot: parsed.id } : { slot: parsed.id, item: parsed.item };
}
