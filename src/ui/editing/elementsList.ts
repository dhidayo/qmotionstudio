import type { Layer } from '@/core/types';
import { entriesDrawn, partsIn } from '@/core/render/parts';
import { slotKey, slotOf } from '@/core/render/slots';
import { visibleWindow } from '@/core/render/tuning';
import { isSampleSpot } from '@/document/actions';
import { sceneSpans } from '@/document/select/timeline';
import type { Overlay, Project } from '@/document/types';
import type { SceneTemplate } from '@/templates/schema';
import { slotWords } from '@/templates/_shared/text';
import type { IconName } from '@/ui/mobile/Icon';
import { elementName, entryWords, overlayKindName, slotTitle } from './names';

/**
 * Elements (D-167): one list of everything in the design, or in the selected
 * scene of a video, to pick and change.
 *
 * "The most important thing for every scene is to be able to modify the
 * elements of those scenes … I would prefer a way to see all design elements
 * and select them to update as I like." The canvas is still the quickest way
 * to a big headline; this is the way to everything else — the word that only
 * arrives later, the pill too thin to tap, the confetti that is never picked
 * on the picture (D-159), the sticker under a photo — and the way for anyone
 * who works with a keyboard or a screen reader.
 *
 * Worked out from what the preview last drew for the scene (`drawnScene`,
 * D-159) and the project, never by building the design again: the list costs
 * nothing per frame. Pure, so it is tested without a browser.
 *
 * Reading order, in groups: the design's photo spots, its words (each list
 * entry on its own), its parts (scattered ones too — this is how they are
 * reached), the logo, and what was added on top. In a video, layers are on
 * the timeline rather than in a scene, so "Added on top" holds the ones seen
 * during the selected scene, each with its time.
 */

export type ElementTarget =
  | { readonly kind: 'slot'; readonly key: string; readonly tab: 'photos' | 'text' | 'look'; readonly photoIndex?: number }
  | { readonly kind: 'overlay'; readonly id: string }
  | { readonly kind: 'logo' };

export type ElementRow = {
  /** Unique in the list: the selection key, `overlay:<id>` or `logo`. */
  readonly id: string;
  readonly icon: IconName;
  /** "Photo 2", "Headline", "Brand mark", "Sticker". */
  readonly name: string;
  /** What it says or shows: "Show the work", "Subscribe". */
  readonly detail: string | null;
  /** A sample photo, or a part or text that was deleted and can be put back. */
  readonly state: 'sample' | 'deleted' | null;
  /** In a video, when a layer added on top is seen, on the project clock. */
  readonly when: { readonly startMs: number; readonly endMs: number } | null;
  readonly target: ElementTarget;
  /** What choosing a deleted row puts back first. */
  readonly restore: { readonly kind: 'shape'; readonly key: string } | { readonly kind: 'text'; readonly slot: string } | null;
  /** Its accessible name: what it is, what it says, and its state. */
  readonly label: string;
};

export type ElementGroupId = 'photos' | 'words' | 'parts' | 'logo' | 'added';
export type ElementGroup = { readonly id: ElementGroupId; readonly heading: string; readonly rows: readonly ElementRow[] };

export type ElementsInput = {
  readonly project: Project;
  readonly sceneIndex: number;
  /** The selected scene's design, once loaded. */
  readonly template: Pick<SceneTemplate, 'textSlots' | 'photoSlots' | 'supportsLogo'> | null;
  /** What the preview drew for this scene, or null while another scene is on the canvas. */
  readonly layers: readonly Layer[] | null;
};

const HEADINGS: Readonly<Record<ElementGroupId, string>> = {
  photos: 'Photos',
  words: 'Words',
  parts: 'Shapes and parts',
  logo: 'Logo',
  added: 'Added on top',
};

/** A long phrase, kept to a line's worth for names read aloud. */
function clip(words: string, max = 60): string {
  const flat = words.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** "2.0s", as the Text tab times an added text. */
export function secondsLabel(ms: number): string {
  return `${(Math.max(0, ms) / 1000).toFixed(1)}s`;
}

function labelOf(name: string, detail: string | null, kind: string | null, state: ElementRow['state'], when: ElementRow['when']): string {
  return [
    detail !== null && detail.length > 0 ? `${name}: ${detail}` : name,
    kind,
    state === 'sample' ? 'sample' : state === 'deleted' ? 'deleted — put back' : null,
    when ? `${secondsLabel(when.startMs)} to ${secondsLabel(when.endMs)}` : null,
  ].filter((part): part is string => part !== null).join(', ');
}

/** Every slot key the layers draw, once each, in drawing order. */
function keysIn(layers: readonly Layer[]): readonly string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const visit = (list: readonly Layer[]): void => {
    for (const layer of list) {
      const slot = slotOf(layer);
      if (slot) {
        const key = slotKey(slot);
        if (!seen.has(key)) { seen.add(key); out.push(key); }
      }
      if (layer.type === 'group' || layer.type === 'mask') visit(layer.children);
    }
  };
  visit(layers);
  return out;
}

export function elementGroups({ project, sceneIndex, template, layers }: ElementsInput): readonly ElementGroup[] {
  const scene = project.scenes[sceneIndex];
  if (!scene) return [];
  const { inputs } = scene;
  const drawnKeys = layers === null ? null : keysIn(layers);
  const parts = layers === null ? [] : partsIn(layers);
  const groups: ElementGroup[] = [];
  const push = (id: ElementGroupId, rows: readonly ElementRow[]): void => {
    if (rows.length > 0) groups.push({ id, heading: HEADINGS[id], rows });
  };

  // Photos: the spots the design drew, or, before it has drawn, the photos it holds.
  const photoIndexes = drawnKeys !== null
    ? drawnKeys.flatMap((key) => { const m = /^photo:(\d+)$/.exec(key); return m?.[1] === undefined ? [] : [Number(m[1])]; }).sort((a, b) => a - b)
    : Array.from({ length: Math.min(inputs.photos.length, template?.photoSlots.max ?? inputs.photos.length) }, (_, i) => i);
  push('photos', photoIndexes.map((index): ElementRow => {
    const key = `photo:${index}`;
    const sample = isSampleSpot(inputs.photos[index]?.mediaId ?? 'sample:');
    const name = `Photo ${index + 1}`;
    const state = sample ? 'sample' : null;
    return {
      id: key, icon: 'photo', name, detail: null, state, when: null,
      target: { kind: 'slot', key, tab: 'photos', photoIndex: index },
      restore: null,
      label: labelOf(name, null, null, state, null),
    };
  }));

  // Words: each text in the design's order, a list's entries each on their own.
  const words: ElementRow[] = [];
  for (const def of template?.textSlots ?? []) {
    const own = `text:${def.id}`;
    const entries = drawnKeys === null ? [] : drawnKeys
      .filter((key) => key.startsWith(`${own}#`))
      .map((key) => Number(key.slice(own.length + 1)))
      .sort((a, b) => a - b);
    const drawnWhole = drawnKeys?.includes(own) === true;
    // Words that are a part's letter or number are reached through the part.
    const onPart = parts.some((p) => p.text?.slot === def.id);
    if (drawnKeys !== null && !drawnWhole && entries.length === 0 && onPart) continue;

    if (drawnWhole || entries.length === 0) {
      const removed = inputs.texts[def.id] === '';
      const name = slotTitle(own, layers, template) ?? def.label;
      const detail = removed ? null : clip(slotWords(def, inputs));
      const state = removed ? 'deleted' : null;
      words.push({
        id: own, icon: 'text', name, detail, state, when: null,
        target: { kind: 'slot', key: own, tab: 'text' },
        restore: removed ? { kind: 'text', slot: def.id } : null,
        label: labelOf(name, detail, 'text', state, null),
      });
    }
    const count = layers === null ? 0 : entriesDrawn(layers, def.id);
    for (const item of entries) {
      const key = `${own}#${item}`;
      const name = slotTitle(key, layers, template) ?? `${def.label} ${item + 1}`;
      const detail = clip(entryWords(def, inputs, item, count));
      words.push({
        id: key, icon: 'text', name, detail: detail.length > 0 ? detail : null, state: null, when: null,
        target: { kind: 'slot', key, tab: 'text' },
        restore: null,
        label: labelOf(name, detail.length > 0 ? detail : null, 'text', null, null),
      });
    }
  }
  push('words', words);

  // The design's own parts (D-159), deleted ones dimmed, with Put back.
  push('parts', parts.map((part): ElementRow => {
    const deleted = inputs.shapeOverrides?.[part.key]?.hidden === true;
    const def = part.text ? template?.textSlots.find((slot) => slot.id === part.text?.slot) : undefined;
    const said = def === undefined || part.text === undefined ? null
      : part.text.item === undefined ? slotWords(def, inputs)
      : entryWords(def, inputs, part.text.item, layers === null ? 0 : entriesDrawn(layers, def.id));
    const detail = said === null || said.trim().length === 0 ? null : clip(said);
    const state = deleted ? 'deleted' : null;
    return {
      id: part.key, icon: 'shape', name: part.label, detail, state, when: null,
      target: { kind: 'slot', key: part.key, tab: 'look' },
      restore: deleted ? { kind: 'shape', key: part.key } : null,
      label: labelOf(part.label, detail, 'shape', state, null),
    };
  }));

  if (inputs.logo.mediaId !== null && template?.supportsLogo !== false) {
    push('logo', [{
      id: 'logo', icon: 'logo', name: 'Logo', detail: null, state: null, when: null,
      target: { kind: 'logo' }, restore: null, label: 'Logo',
    }]);
  }

  push('added', addedRows(project, sceneIndex));
  return groups;
}

/**
 * Layers added on top. An image has one moment to see, so all of them; in a
 * video, those seen at any time during the selected scene, in the order they
 * arrive, each with its time — a layer that runs across three scenes is in
 * all three lists, as it is in all three scenes' pictures.
 */
function addedRows(project: Project, sceneIndex: number): readonly ElementRow[] {
  const video = project.mode === 'motionAd';
  const span = sceneSpans(project.scenes)[sceneIndex];
  const numbered = new Map<string, number>();
  const counts = { photo: 0, customMedia: 0 };
  for (const overlay of project.overlays) {
    const kind = overlay.content.kind;
    if (kind === 'photo' || kind === 'customMedia') numbered.set(overlay.id, (counts[kind] += 1));
  }
  const seen = (overlay: Overlay): boolean => !video || (span !== undefined && overlay.startMs < span.endMs && overlay.endMs > span.startMs);
  return project.overlays
    .filter(seen)
    .map((overlay, order) => ({ overlay, order }))
    .sort((a, b) => (video ? a.overlay.startMs - b.overlay.startMs : 0) || a.order - b.order)
    .map(({ overlay }): ElementRow => {
      const { content } = overlay;
      const kind = overlayKindName(content);
      const number = numbered.get(overlay.id);
      const name = number === undefined ? kind : `${kind} ${number}`;
      const detail = content.kind === 'text' ? (content.text.trim().length > 0 ? clip(content.text) : 'Empty')
        : content.kind === 'shape' || content.kind === 'sticker' || content.kind === 'counter' ? elementName(content)
        : null;
      const when = video ? { startMs: overlay.startMs, endMs: overlay.endMs } : null;
      return {
        id: `overlay:${overlay.id}`, icon: OVERLAY_ICONS[content.kind], name, detail, state: null, when,
        target: { kind: 'overlay', id: overlay.id }, restore: null,
        label: labelOf(name, detail, 'added on top', null, when),
      };
    });
}

const OVERLAY_ICONS: Readonly<Record<Overlay['content']['kind'], IconName>> = {
  text: 'text', photo: 'photo', customMedia: 'video', shape: 'shape', sticker: 'sticker', counter: 'number',
};

/** Whether a row is what is selected now, on the canvas or anywhere else. */
export function isSelectedRow(
  row: ElementRow,
  selection: { readonly slot: string | null; readonly overlay: string | null; readonly logo: boolean },
): boolean {
  switch (row.target.kind) {
    case 'slot': return selection.slot === row.target.key;
    case 'overlay': return selection.overlay === row.target.id;
    case 'logo': return selection.logo;
  }
}

/* ------------------------------------------------------------------------ */

/** A stretch of the project clock, in ms: from `startMs`, up to but not including `endMs`. */
export type Window = { readonly startMs: number; readonly endMs: number };

/**
 * When a design's element is seen, on the project clock: from the first
 * moment it shows (`visibleWindow`, the same reading of its fade and scale
 * that times its effects) to the last, inside its scene. Null when the
 * layers do not draw it.
 */
export function slotWindow(layers: readonly Layer[], key: string, scene: Window, speed: number): Window | null {
  const found = findSlot(layers, key, 0);
  if (!found) return null;
  const own = visibleWindow(found.layer);
  const rate = speed > 0 ? speed : 1;
  const startMs = scene.startMs + (found.offset + own.start) / rate;
  const endMs = scene.startMs + (found.offset + own.end) / rate;
  const clipped = { startMs: Math.max(scene.startMs, startMs), endMs: Math.min(scene.endMs, endMs) };
  return clipped.endMs > clipped.startMs ? clipped : null;
}

/** The first layer drawn for a key, and where its own clock starts in the scene's (a child's starts at its parent's). */
function findSlot(layers: readonly Layer[], key: string, offset: number): { layer: Layer; offset: number } | null {
  for (const layer of layers) {
    const slot = slotOf(layer);
    if (slot && slotKey(slot) === key) return { layer, offset: offset + layer.startMs };
    if (layer.type === 'group' || layer.type === 'mask') {
      const inner = findSlot(layer.children, key, offset + layer.startMs);
      if (inner) return inner;
    }
  }
  return null;
}

/** How far into its time an element is shown, so it has arrived rather than just begun to fade in. */
const SETTLE_MS = 500;

/**
 * Where the playhead goes so a chosen element can be seen (D-167), or null
 * to leave it where it is: it stays when the element is on screen already;
 * otherwise the picture moment when the element is seen then; otherwise a
 * little after the element arrives. "A word that enters later" is shown, not
 * selected out of sight.
 */
export function momentToShow(nowMs: number, seen: Window, pictureMs: number | null): number | null {
  if (nowMs >= seen.startMs && nowMs < seen.endMs) return null;
  if (pictureMs !== null && pictureMs >= seen.startMs && pictureMs < seen.endMs) return pictureMs;
  const length = seen.endMs - seen.startMs;
  return Math.round(Math.min(seen.endMs - 1, seen.startMs + Math.min(SETTLE_MS, length / 3)));
}
