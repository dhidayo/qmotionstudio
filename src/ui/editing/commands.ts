import * as actions from '@/document/actions';
import { effectName } from '@/core/effects/catalog';
import { stickerDef } from '@/core/stickers/catalog';
import { formatCounter } from '@/core/text/counter';
import { SHAPE_NAMES } from '@/document/elements';
import type { CounterContent, EffectClip, Overlay, Project, ShapeContent, StickerContent } from '@/document/types';
import { resolvedAudio, sceneLengthMs, sceneSpans, totalDurationMs } from '@/document/select/timeline';
import { clipEndMs } from '@/core/audio/envelope';
import { soundFor } from '@/audio/library';
import { summaryFor } from '@/templates/manifest';
import { useEditor } from '@/state/store';
import { useOverlays, type MenuItem } from '@/ui/shell/overlays';
import { undoSentence } from '@/ui/shell/platform';
import { currentLayout, type Layout } from '@/ui/shell/useLayout';
import { parseSlotKey } from '@/core/render/slots';
import { labelIn } from '@/core/render/parts';
import { editPart, entryEditing, selectedSceneLayers } from './parts';

/**
 * What can be done to a thing on the timeline or the canvas (D-104), in one
 * place — so the right-click menu, the long-press menu, the "⋯" button and the
 * Delete key all mean exactly the same thing.
 *
 * Everything here goes through the undoable pipeline, and every deletion says
 * how to get it back.
 */

/** "Press ⌘Z to undo." on a Mac, Ctrl+Z elsewhere, "Tap ↶" with no keyboard (D-161). */
export function undoHint(): string {
  return undoSentence();
}

export function overlayLabel(overlay: Overlay): string {
  const { content } = overlay;
  switch (content.kind) {
    case 'text': {
      const text = content.text.trim();
      return text.length > 0 ? `“${text.length > 24 ? `${text.slice(0, 24)}…` : text}”` : 'the caption';
    }
    case 'photo': return 'the photo layer';
    case 'customMedia': return 'the video layer';
    // "Deleted the star", "the “Check tick” sticker", "the number 1,000" (D-158).
    case 'shape': return `the ${elementName(content).toLowerCase()}`;
    case 'sticker': return `the “${elementName(content)}” sticker`;
    case 'counter': return `the number ${elementName(content)}`;
  }
}

/** What an element is, in a word or two: "Star", "Check tick", "1,000" (D-158). */
export function elementName(content: ShapeContent | StickerContent | CounterContent): string {
  switch (content.kind) {
    case 'shape': return SHAPE_NAMES[content.shape];
    case 'sticker': return stickerDef(content.sticker)?.name ?? 'Sticker';
    case 'counter': return formatCounter(content.to, content.format);
  }
}

/** What the selection, its menu and its settings call a layer: "Text overlay", "Shape · Star". */
export function overlayName(overlay: Overlay): string {
  const { content } = overlay;
  switch (content.kind) {
    case 'text': return 'Text overlay';
    case 'photo': return 'Photo overlay';
    case 'customMedia': return 'Media overlay';
    case 'shape': return `Shape · ${elementName(content)}`;
    case 'sticker': return `Sticker · ${elementName(content)}`;
    case 'counter': return 'Number';
  }
}

/** How the effects library speaks of a layer: "Effects for this caption". */
export function overlayThis(overlay: Overlay): string {
  switch (overlay.content.kind) {
    case 'text': return 'this caption';
    case 'shape': return 'this shape';
    case 'sticker': return 'this sticker';
    case 'counter': return 'this number';
    default: return 'this layer';
  }
}

/** The section an element's own settings are in (D-158). */
export const ELEMENT_SECTIONS = { shape: 'Shape', sticker: 'Sticker', counter: 'Number' } as const;

/**
 * An element's own settings, wherever settings are on this screen: the phone's
 * sheet open at its section; beside the picture on a computer; the side sheet
 * on a tablet. A sticker's own action is choosing another, so that opens the
 * library in its place.
 */
export function editElement(overlay: Overlay, layout: Layout = currentLayout()): void {
  const s = useEditor.getState();
  const o = useOverlays.getState();
  const kind = overlay.content.kind;
  if (kind !== 'shape' && kind !== 'sticker' && kind !== 'counter') return;
  s.selectOverlay(overlay.id);
  const section = ELEMENT_SECTIONS[kind];
  if (layout === 'phone') {
    o.openPhonePanel('element', section);
    return;
  }
  if (layout === 'tablet') o.setInspectorSheet(true);
  o.focusInspectorSection(section);
}

/** Choose another sticker in this one's place, keeping where it is and how it moves. */
export function changeSticker(overlay: Overlay): void {
  useEditor.getState().selectOverlay(overlay.id);
  useOverlays.getState().openElementPicker({ category: 'Stickers', replace: overlay.id });
}

const designName = (templateId: string): string => summaryFor(templateId)?.name ?? templateId;

/**
 * Deletes whatever is selected. Returns false when nothing deletable is, so
 * the key can be left to do whatever else it does.
 */
export function deleteSelection(): boolean {
  const s = useEditor.getState();
  const { project } = s;

  if (s.selectedOverlay !== null) {
    const overlay = project.overlays.find((o) => o.id === s.selectedOverlay);
    s.dispatch(actions.removeOverlay(s.selectedOverlay));
    s.selectOverlay(null);
    s.showToast(`Deleted ${overlay ? overlayLabel(overlay) : 'the layer'}. ${undoHint()}`);
    return true;
  }
  if (s.selectedEffect !== null) {
    const found = findEffect(project, s.selectedEffect);
    s.dispatch(found?.sceneIndex === null ? actions.removeTimelineEffect(s.selectedEffect) : actions.removeSceneEffect(s.selectedEffect));
    s.selectEffect(null);
    s.showToast(`Deleted ${found ? `“${effectName(found.clip.effectId)}”` : 'the effect'}. ${undoHint()}`);
    return true;
  }
  if (s.selectedAudio !== null) {
    const sound = soundFor(project.audio.find((c) => c.id === s.selectedAudio)?.mediaId ?? '');
    s.dispatch(actions.removeAudio(s.selectedAudio));
    s.selectAudio(null);
    s.showToast(`Deleted ${sound ? `“${sound.name}”` : 'the music clip'}. ${undoHint()}`);
    return true;
  }
  if (s.selectedLogo) {
    s.dispatch(actions.setLogoMedia(null));
    s.selectLogo(false);
    s.showToast(`Logo removed from this scene. ${undoHint()}`);
    return true;
  }
  if (s.selectedSlot !== null) {
    return deleteSlot(s.selectedSlot);
  }
  if (s.sceneClipSelected) {
    if (project.scenes.length <= 1) {
      s.showToast('An ad needs at least one scene. Change its design instead.');
      return true;
    }
    const index = s.selectedScene;
    const scene = project.scenes[index];
    s.dispatch(actions.removeScene(index));
    s.selectScene(Math.max(0, index - 1));
    s.showToast(`Deleted scene ${index + 1}${scene ? ` (“${designName(scene.templateId)}”)` : ''}. ${undoHint()}`);
    return true;
  }
  return false;
}

/** ⌘D: a copy of whatever is selected, where a copy makes sense (D-107). */
export function duplicateSelection(): boolean {
  const s = useEditor.getState();
  if (s.selectedOverlay !== null) {
    s.dispatch(actions.duplicateOverlay(s.selectedOverlay, totalDurationMs(s.project)));
    s.showToast('Duplicated — the copy is straight after it on the timeline.');
    return true;
  }
  if (s.selectedEffect !== null) {
    const found = findEffect(s.project, s.selectedEffect);
    s.dispatch(found?.sceneIndex === null ? actions.duplicateTimelineEffect(s.selectedEffect) : actions.duplicateSceneEffect(s.selectedEffect));
    return true;
  }
  if (s.sceneClipSelected || s.project.mode === 'motionAd') {
    if (s.selectedSlot !== null || s.selectedLogo) return false;
    s.dispatch(actions.duplicateScene(s.selectedScene));
    s.selectSceneClip(s.selectedScene + 1);
    s.showToast(`Duplicated scene ${s.selectedScene + 1}.`);
    return true;
  }
  return false;
}

/** ] and [: to the front or the back, for a layer or a design's own element. */
export function arrangeSelection(to: 'front' | 'back'): boolean {
  const s = useEditor.getState();
  if (s.selectedOverlay !== null) {
    s.dispatch(actions.arrangeOverlay(s.selectedOverlay, to));
    return true;
  }
  if (s.selectedSlot !== null) {
    s.dispatch(actions.arrangeSlot(s.selectedSlot, to));
    return true;
  }
  return false;
}

/**
 * Deleting one of a design's own elements (D-107).
 *
 * Text is cleared — the design keeps its place, so typing in the Text panel
 * (or ⌘Z) brings it back. A photo is taken out of the scene, the rest moving
 * up, as long as the design still has the photos it needs; at its minimum,
 * deleting would leave a hole, so it says to replace the photo instead.
 */
export function deleteSlot(key: string): boolean {
  const s = useEditor.getState();
  const parsed = parseSlotKey(key);
  // A part of the design (D-159): it goes, and Style lists it to put back.
  if (parsed?.kind === 'shape') {
    s.dispatch(actions.hideShape(key));
    s.endInteraction();
    s.selectSlot(null);
    s.showToast(`Shape deleted. ${undoHint()} Or Style → Shapes in this design → Put back.`);
    return true;
  }
  // One entry of a list: that entry leaves the list (a number leaves its place empty).
  if (parsed?.kind === 'text' && parsed.item !== undefined) {
    const inputs = s.project.scenes[s.selectedScene]?.inputs;
    const editing = inputs ? entryEditing({ slot: parsed.id, item: parsed.item }, inputs, s.template, selectedSceneLayers()) : null;
    if (!editing) return false;
    s.dispatch(editing.write(null));
    s.endInteraction();
    s.selectSlot(null);
    s.showToast(`Removed from the list. ${undoHint()} Or edit the list in Text.`);
    return true;
  }
  if (parsed?.kind === 'text') {
    s.dispatch(actions.setText(parsed.id, ''));
    s.endInteraction();
    s.selectSlot(null);
    s.showToast(`Text removed. ${undoHint()} Or type it back in Text.`);
    return true;
  }
  if (parsed?.kind === 'photo') {
    const index = parsed.index;
    const scene = s.project.scenes[s.selectedScene];
    const min = s.template?.photoSlots.min ?? 1;
    const count = scene?.inputs.photos.length ?? 0;
    if (count <= min || index >= count) {
      s.showToast(`This design needs ${min === 1 ? 'a photo' : `${min} photos`} here. Replace it instead — double-click it, or right-click → Replace photo.`);
      return true;
    }
    s.dispatch(actions.removePhoto(index));
    s.selectSlot(null);
    s.showToast(`Photo removed from this scene. ${undoHint()}`);
    return true;
  }
  return false;
}

/** Moves the playhead without starting playback. */
type Seek = (projectMs: number) => void;

export function overlayMenu(overlay: Overlay, seek: Seek | null, atMs: number): readonly MenuItem[] {
  const s = useEditor.getState();
  const o = useOverlays.getState();
  const label = overlayLabel(overlay);
  const target = { kind: 'overlay' as const, id: overlay.id };
  const name = overlayThis(overlay);
  const edit: MenuItem[] = ((): MenuItem[] => {
    switch (overlay.content.kind) {
      case 'text': return [{ label: 'Edit text', keys: 'Enter', onSelect: () => { s.selectOverlay(overlay.id); o.openTextEdit(overlay.id); } }];
      case 'photo': return [{ label: 'Replace photo…', keys: 'double-click', onSelect: () => { s.selectOverlay(overlay.id); o.openPhotoPicker({ kind: 'overlay', id: overlay.id }); } }];
      case 'shape': return [{ label: 'Shape style…', keys: 'double-click', onSelect: () => { editElement(overlay); } }];
      case 'sticker': return [
        { label: 'Change sticker…', onSelect: () => { changeSticker(overlay); } },
        { label: 'Sticker settings…', keys: 'double-click', onSelect: () => { editElement(overlay); } },
      ];
      case 'counter': return [{ label: 'Number settings…', keys: 'double-click', onSelect: () => { editElement(overlay); } }];
      default: return [];
    }
  })();
  return [
    ...edit,
    { label: 'Effects…', hint: 'Shine, pulse, glow…', onSelect: () => { s.selectOverlay(overlay.id); o.openPicker({ target: { kind: 'element', target, label: name } }); } },
    { label: 'Entrance effect…', onSelect: () => { s.selectOverlay(overlay.id); o.openPicker({ target: { kind: 'element', target, label: name }, category: 'Entrance' }); } },
    { label: 'Exit effect…', onSelect: () => { s.selectOverlay(overlay.id); o.openPicker({ target: { kind: 'element', target, label: name }, category: 'Exit' }); } },
    { kind: 'separator' },
    ...(seek ? [{ label: 'Move playhead here', onSelect: () => { seek(atMs); } }] : []),
    { label: 'Duplicate', keys: 'mod+D', onSelect: () => { s.dispatch(actions.duplicateOverlay(overlay.id, totalDurationMs(s.project))); s.showToast(`Duplicated ${label}.`); } },
    { label: 'Bring to front', keys: ']', onSelect: () => { s.dispatch(actions.arrangeOverlay(overlay.id, 'front')); } },
    { label: 'Send to back', keys: '[', onSelect: () => { s.dispatch(actions.arrangeOverlay(overlay.id, 'back')); } },
    { label: 'Up a layer', hint: `now L${overlay.track + 1}`, onSelect: () => { s.dispatch(actions.moveOverlayLayer(overlay.id, 1)); } },
    { label: 'Down a layer', disabled: overlay.track === 0, onSelect: () => { s.dispatch(actions.moveOverlayLayer(overlay.id, -1)); } },
    { kind: 'separator' },
    { label: 'Delete', keys: 'Delete', danger: true, onSelect: () => { s.selectOverlay(overlay.id); deleteSelection(); } },
  ];
}

/**
 * A scene's menu: right-click or hold its clip, or press the "⋯" on the
 * selected one (D-162). The timeline's scene bar — + Scene, Change design,
 * Duplicate, ←, →, Remove, and the length and transition controls — was a
 * row of its own under the add bar; everything in it is here now, + Scene is
 * in the row of actions, and the length and transition open in a small window
 * of their own (the phone's Timing panel, D-133).
 */
export function sceneMenu(index: number, seek: Seek, atMs: number, openDesigns: (mode: 'add' | 'replace') => void): readonly MenuItem[] {
  const s = useEditor.getState();
  const o = useOverlays.getState();
  const count = s.project.scenes.length;
  return [
    { label: 'Change design…', onSelect: () => { s.selectSceneClip(index); openDesigns('replace'); } },
    { label: 'Length and transition…', onSelect: () => { s.selectSceneClip(index); o.openPhonePanel('scene'); } },
    { label: 'Scene effects…', hint: 'Snow, light, shake…', onSelect: () => { s.selectSceneClip(index); o.openPicker({ target: { kind: 'scene' } }); } },
    { label: 'Motion properties', onSelect: () => { s.selectSceneClip(index); s.setInspectorTab('motion'); } },
    { kind: 'separator' },
    { label: 'Move playhead here', onSelect: () => { seek(atMs); } },
    { label: 'Add a scene after…', onSelect: () => { s.selectSceneClip(index); openDesigns('add'); } },
    { label: 'Duplicate scene', keys: 'mod+D', onSelect: () => { s.dispatch(actions.duplicateScene(index)); s.selectSceneClip(index + 1); } },
    { label: 'Move earlier', keys: 'alt+←', disabled: index === 0, onSelect: () => { s.dispatch(actions.moveScene(index, index - 1)); s.selectSceneClip(index - 1); } },
    { label: 'Move later', keys: 'alt+→', disabled: index >= count - 1, onSelect: () => { s.dispatch(actions.moveScene(index, index + 1)); s.selectSceneClip(index + 1); } },
    { kind: 'separator' },
    { label: 'Delete scene', keys: 'Delete', danger: true, disabled: count <= 1, onSelect: () => { s.selectSceneClip(index); deleteSelection(); } },
  ];
}

/**
 * ⌥← and ⌥→ with a scene's clip selected: the scene one place earlier or
 * later (D-162) — the scene bar's ← and →, from the keyboard. False when no
 * scene clip is selected, or it is already at that end, so the key is left
 * to step the playhead as usual.
 */
export function moveSelectedScene(delta: 1 | -1): boolean {
  const s = useEditor.getState();
  if (!s.sceneClipSelected || s.project.mode !== 'motionAd') return false;
  if (s.selectedOverlay !== null || s.selectedEffect !== null || s.selectedAudio !== null || s.selectedSlot !== null) return false;
  const from = s.selectedScene;
  const to = from + delta;
  if (to < 0 || to >= s.project.scenes.length) return false;
  s.dispatch(actions.moveScene(from, to));
  s.selectSceneClip(to);
  return true;
}

export function audioMenu(clipId: string, seek: Seek, atMs: number): readonly MenuItem[] {
  const s = useEditor.getState();
  // As it plays, so a loop is as long as it is drawn (D-156).
  const clip = resolvedAudio(s.project).find((c) => c.id === clipId);
  const inside = clip !== undefined && s.playheadMs > clip.startMs && s.playheadMs < clipEndMs(clip);
  const sound = soundFor(clip?.mediaId ?? '');
  return [
    { label: 'Move playhead here', onSelect: () => { seek(atMs); } },
    { label: 'Split at playhead', disabled: !inside, onSelect: () => { s.dispatch(actions.splitAudio(clipId, s.playheadMs)); } },
    { kind: 'separator' },
    { label: sound?.kind === 'effect' ? 'Delete sound' : 'Delete music clip', keys: 'Delete', danger: true, onSelect: () => { s.selectAudio(clipId); deleteSelection(); } },
  ];
}

/** An effect on the timeline or in a scene, found by id, with where it lives. */
export function findEffect(project: Project, id: string): { clip: EffectClip; sceneIndex: number | null } | null {
  const onTimeline = project.effects?.find((c) => c.id === id);
  if (onTimeline) return { clip: onTimeline, sceneIndex: null };
  for (let i = 0; i < project.scenes.length; i++) {
    const clip = project.scenes[i]?.inputs.effects?.find((c) => c.id === id);
    if (clip) return { clip, sceneIndex: i };
  }
  return null;
}

export function effectMenu(clipId: string, seek: Seek, atMs: number): readonly MenuItem[] {
  const s = useEditor.getState();
  const found = findEffect(s.project, clipId);
  const inScene = found !== null && found.sceneIndex !== null;
  const corporate = s.project.mode === 'motionAd';
  const sceneLength = inScene ? sceneLengthAt(found.sceneIndex ?? 0) : 0;
  return [
    { label: 'Effect settings', onSelect: () => { s.selectEffect(clipId); } },
    { label: 'Move playhead here', onSelect: () => { seek(atMs); } },
    {
      label: 'Duplicate',
      onSelect: () => { s.dispatch(inScene ? actions.duplicateSceneEffect(clipId) : actions.duplicateTimelineEffect(clipId)); },
    },
    ...(inScene
      ? [{
          label: 'Cover the whole scene',
          onSelect: () => { s.dispatch(actions.updateSceneEffect(clipId, { startMs: 0, endMs: sceneLength })); s.endInteraction(); },
        }]
      : []),
    ...(corporate && inScene
      ? [{ label: 'Move to the timeline', hint: 'across scenes', onSelect: () => { s.dispatch(actions.sceneEffectToTimeline(clipId)); } }]
      : []),
    ...(corporate && !inScene && found !== null
      ? [{ label: 'Attach to its scene', hint: 'moves with it', onSelect: () => { s.dispatch(actions.timelineEffectToScene(clipId)); } }]
      : []),
    { kind: 'separator' },
    { label: 'Delete effect', keys: 'Delete', danger: true, onSelect: () => { s.selectEffect(clipId); deleteSelection(); } },
  ];
}

function sceneLengthAt(index: number): number {
  const scene = useEditor.getState().project.scenes[index];
  return scene ? sceneLengthMs(scene) : 0;
}

/** For a template element picked on the canvas. */
export function slotMenu(key: string, label: string, options: { readonly typed?: boolean } = {}): readonly MenuItem[] {
  const s = useEditor.getState();
  const o = useOverlays.getState();
  const target = { kind: 'slot' as const, key };
  const parsed = parseSlotKey(key);
  const photo = parsed?.kind === 'photo' ? [key, String(parsed.index)] : null;
  const isText = parsed?.kind === 'text';
  // A design's own part (D-159): its colour, its letter or number, where it sits, deleting it.
  if (parsed?.kind === 'shape') {
    return [
      ...(options.typed === true ? [{ label: 'Edit', keys: 'Enter', onSelect: () => { o.openTextEdit(key); } }] : []),
      { label: 'Colour…', onSelect: () => { editPart(key); } },
      { kind: 'separator' },
      { label: 'Effects…', onSelect: () => { o.openPicker({ target: { kind: 'element', target, label } }); } },
      { label: 'Entrance effect…', onSelect: () => { o.openPicker({ target: { kind: 'element', target, label }, category: 'Entrance' }); } },
      { label: 'Exit effect…', onSelect: () => { o.openPicker({ target: { kind: 'element', target, label }, category: 'Exit' }); } },
      { label: 'Motion properties', onSelect: () => { s.selectSlot(key, 'motion'); } },
      { kind: 'separator' },
      { label: 'Bring to front', keys: ']', onSelect: () => { s.dispatch(actions.arrangeSlot(key, 'front')); } },
      { label: 'Send to back', keys: '[', onSelect: () => { s.dispatch(actions.arrangeSlot(key, 'back')); } },
      { label: 'Reset to the design', onSelect: () => { s.dispatch(actions.resetShape(key)); } },
      { kind: 'separator' },
      { label: 'Delete shape', keys: 'Delete', danger: true, onSelect: () => { deleteSlot(key); } },
    ];
  }
  return [
    ...(isText ? [{ label: 'Edit text', keys: 'Enter', onSelect: () => { o.openTextEdit(key); } }] : []),
    ...(photo?.[1] !== undefined
      ? [{ label: 'Replace photo…', keys: 'double-click', onSelect: () => { o.openPhotoPicker({ kind: 'slot', index: Number(photo[1]) }); } }]
      : []),
    ...(isText ? [{ label: 'Text style…', onSelect: () => { s.selectSlot(key, 'text'); } }] : []),
    ...(photo ? [{ label: 'Frame and crop…', onSelect: () => { s.selectSlot(key, 'photos', Number(photo[1])); } }] : []),
    { kind: 'separator' },
    { label: 'Effects…', onSelect: () => { o.openPicker({ target: { kind: 'element', target, label } }); } },
    { label: 'Entrance effect…', onSelect: () => { o.openPicker({ target: { kind: 'element', target, label }, category: 'Entrance' }); } },
    { label: 'Exit effect…', onSelect: () => { o.openPicker({ target: { kind: 'element', target, label }, category: 'Exit' }); } },
    { label: 'Motion properties', onSelect: () => { s.selectSlot(key, 'motion'); } },
    { kind: 'separator' },
    { label: 'Bring to front', keys: ']', onSelect: () => { s.dispatch(actions.arrangeSlot(key, 'front')); } },
    { label: 'Send to back', keys: '[', onSelect: () => { s.dispatch(actions.arrangeSlot(key, 'back')); } },
    { label: 'Reset to the design', onSelect: () => { s.dispatch(actions.resetSlot(key)); } },
    { kind: 'separator' },
    { label: isText ? 'Remove text' : 'Delete photo', keys: 'Delete', danger: true, onSelect: () => { deleteSlot(key); } },
  ];
}

/** What a design's element is called in a sentence: "the brand mark", "pillar 2", "photo 1", "the headline". */
export function slotName(key: string): string {
  const s = useEditor.getState();
  const layers = selectedSceneLayers();
  const named = layers === null ? null : labelIn(layers, key);
  const parsed = parseSlotKey(key);
  if (parsed?.kind === 'photo') return `photo ${parsed.index + 1}`;
  if (named !== null) return parsed?.kind === 'shape' ? `the ${named.charAt(0).toLowerCase()}${named.slice(1)}` : named.toLowerCase();
  if (parsed?.kind === 'text') {
    const def = s.template?.textSlots.find((slot) => slot.id === parsed.id);
    return def ? `the ${def.label.toLowerCase()}` : 'this text';
  }
  return parsed?.kind === 'shape' ? 'this shape' : 'this element';
}

export function logoMenu(): readonly MenuItem[] {
  const s = useEditor.getState();
  const o = useOverlays.getState();
  const target = { kind: 'logo' as const };
  return [
    { label: 'Replace logo…', keys: 'double-click', onSelect: () => { o.openPhotoPicker({ kind: 'logo' }); } },
    { label: 'Logo effects…', hint: 'Shine, glow…', onSelect: () => { o.openPicker({ target: { kind: 'element', target, label: 'the logo' } }); } },
    { label: 'Logo settings', onSelect: () => { s.selectLogo(true); } },
    { kind: 'separator' },
    { label: 'Remove logo', keys: 'Delete', danger: true, onSelect: () => { s.selectLogo(true); deleteSelection(); } },
  ];
}

/**
 * Style's Background section, wherever Style is on this screen (D-120): a
 * sheet on a phone, beside the picture on a computer, a sheet from the side
 * on a tablet.
 */
export function showBackgroundSettings(layout: Layout): void {
  const s = useEditor.getState();
  const o = useOverlays.getState();
  if (layout === 'phone') {
    o.openPhonePanel('style', 'Background');
    return;
  }
  // Put down a layer, music or effect, so Style is what the inspector shows.
  s.selectOverlay(null);
  s.selectAudio(null);
  s.selectEffect(null);
  s.setInspectorTab('look');
  if (layout === 'tablet') o.setInspectorSheet(true);
  o.focusInspectorSection('Background');
}

/** Right-click, or a long press, on the design where nothing is (D-120). */
export function backgroundMenu(layout: Layout): readonly MenuItem[] {
  const o = useOverlays.getState();
  return [
    { label: 'Change background…', onSelect: () => { showBackgroundSettings(layout); } },
    { label: 'Use a picture as background…', onSelect: () => { o.openPhotoPicker({ kind: 'background' }); } },
    // Shapes, stickers and numbers (D-158), the add bar's three in one.
    { label: 'Add an element…', hint: 'Shapes, stickers, numbers', onSelect: () => { o.openElementPicker({}); } },
    { kind: 'separator' },
    // In a video the library holds whole videos, which replace every scene;
    // this scene's own design is changed in the scene picker (D-155).
    useEditor.getState().project.mode === 'motionAd'
      ? { label: 'Change this scene’s design…', onSelect: () => { o.openScenePicker('replace'); } }
      : { label: 'Choose a different design…', onSelect: () => { o.openPhonePanel('designs'); } },
  ];
}

/**
 * A video from the image on screen (D-129, D-155): "add a button somewhere
 * to create multi-scene videos … continue with design as scene 1". Video
 * keeps the image as its first scene, animated as it plays in Image (setMode
 * always has), then the scene picker opens for the second. One undo goes back.
 */
export function continueAsVideo(): void {
  const s = useEditor.getState();
  if (s.project.mode !== 'motionAd') s.setMode('motionAd');
  useOverlays.getState().openScenePicker('add');
  s.showToast('Your image is scene 1 — it plays animated in the video. Pick what comes next.');
}

/** Where a scene sits on the project clock, for "Move playhead here". */
export function sceneStartMs(index: number): number {
  return sceneSpans(useEditor.getState().project.scenes)[index]?.startMs ?? 0;
}
