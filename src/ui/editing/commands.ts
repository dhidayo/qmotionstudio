import * as actions from '@/document/actions';
import { effectName } from '@/core/effects/catalog';
import type { EffectClip, Overlay, Project } from '@/document/types';
import { sceneLengthMs, sceneSpans, totalDurationMs } from '@/document/select/timeline';
import { summaryFor } from '@/templates/manifest';
import { useEditor } from '@/state/store';
import { useOverlays, type MenuItem } from '@/ui/shell/overlays';
import type { Layout } from '@/ui/shell/useLayout';

/**
 * What can be done to a thing on the timeline or the canvas (D-104), in one
 * place — so the right-click menu, the long-press menu, the "⋯" button and the
 * Delete key all mean exactly the same thing.
 *
 * Everything here goes through the undoable pipeline, and every deletion says
 * how to get it back.
 */

export function undoHint(): string {
  const mac = typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.userAgent);
  return mac ? 'Press ⌘Z to undo.' : 'Press Ctrl+Z to undo.';
}

export function overlayLabel(overlay: Overlay): string {
  if (overlay.content.kind === 'text') {
    const text = overlay.content.text.trim();
    return text.length > 0 ? `“${text.length > 24 ? `${text.slice(0, 24)}…` : text}”` : 'the caption';
  }
  return overlay.content.kind === 'photo' ? 'the photo layer' : 'the video layer';
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
    s.dispatch(actions.removeAudio(s.selectedAudio));
    s.selectAudio(null);
    s.showToast(`Deleted the music clip. ${undoHint()}`);
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
  const text = /^text:(.+)$/.exec(key);
  if (text?.[1] !== undefined) {
    s.dispatch(actions.setText(text[1], ''));
    s.endInteraction();
    s.selectSlot(null);
    s.showToast(`Text removed. ${undoHint()} Or type it back in Text.`);
    return true;
  }
  const photo = /^photo:(\d+)$/.exec(key);
  if (photo?.[1] !== undefined) {
    const index = Number(photo[1]);
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
  const name = overlay.kind === 'text' ? 'this caption' : 'this layer';
  const edit: MenuItem[] = overlay.content.kind === 'text'
    ? [{ label: 'Edit text', hint: 'Enter', onSelect: () => { s.selectOverlay(overlay.id); o.openTextEdit(overlay.id); } }]
    : overlay.content.kind === 'photo'
      ? [{ label: 'Replace photo…', hint: 'Double-click', onSelect: () => { s.selectOverlay(overlay.id); o.openPhotoPicker({ kind: 'overlay', id: overlay.id }); } }]
      : [];
  return [
    ...edit,
    { label: 'Effects…', hint: 'Shine, pulse, glow…', onSelect: () => { s.selectOverlay(overlay.id); o.openPicker({ target: { kind: 'element', target, label: name } }); } },
    { label: 'Entrance effect…', onSelect: () => { s.selectOverlay(overlay.id); o.openPicker({ target: { kind: 'element', target, label: name }, category: 'Entrance' }); } },
    { label: 'Exit effect…', onSelect: () => { s.selectOverlay(overlay.id); o.openPicker({ target: { kind: 'element', target, label: name }, category: 'Exit' }); } },
    { kind: 'separator' },
    ...(seek ? [{ label: 'Move playhead here', onSelect: () => { seek(atMs); } }] : []),
    { label: 'Duplicate', hint: '⌘D', onSelect: () => { s.dispatch(actions.duplicateOverlay(overlay.id, totalDurationMs(s.project))); s.showToast(`Duplicated ${label}.`); } },
    { label: 'Bring to front', hint: ']', onSelect: () => { s.dispatch(actions.arrangeOverlay(overlay.id, 'front')); } },
    { label: 'Send to back', hint: '[', onSelect: () => { s.dispatch(actions.arrangeOverlay(overlay.id, 'back')); } },
    { label: 'Up a layer', hint: `now L${overlay.track + 1}`, onSelect: () => { s.dispatch(actions.moveOverlayLayer(overlay.id, 1)); } },
    { label: 'Down a layer', disabled: overlay.track === 0, onSelect: () => { s.dispatch(actions.moveOverlayLayer(overlay.id, -1)); } },
    { kind: 'separator' },
    { label: 'Delete', hint: 'Delete', danger: true, onSelect: () => { s.selectOverlay(overlay.id); deleteSelection(); } },
  ];
}

export function sceneMenu(index: number, seek: Seek, atMs: number, openDesigns: (mode: 'add' | 'replace') => void): readonly MenuItem[] {
  const s = useEditor.getState();
  const o = useOverlays.getState();
  const count = s.project.scenes.length;
  return [
    { label: 'Change design…', onSelect: () => { s.selectSceneClip(index); openDesigns('replace'); } },
    { label: 'Scene effects…', hint: 'Snow, light, shake…', onSelect: () => { s.selectSceneClip(index); o.openPicker({ target: { kind: 'scene' } }); } },
    { label: 'Motion properties', onSelect: () => { s.selectSceneClip(index); s.setInspectorTab('motion'); } },
    { kind: 'separator' },
    { label: 'Move playhead here', onSelect: () => { seek(atMs); } },
    { label: 'Add a scene after…', onSelect: () => { s.selectSceneClip(index); openDesigns('add'); } },
    { label: 'Duplicate scene', onSelect: () => { s.dispatch(actions.duplicateScene(index)); s.selectScene(index + 1); } },
    { label: 'Move earlier', disabled: index === 0, onSelect: () => { s.dispatch(actions.moveScene(index, index - 1)); s.selectSceneClip(index - 1); } },
    { label: 'Move later', disabled: index >= count - 1, onSelect: () => { s.dispatch(actions.moveScene(index, index + 1)); s.selectSceneClip(index + 1); } },
    { kind: 'separator' },
    { label: 'Delete scene', hint: 'Delete', danger: true, disabled: count <= 1, onSelect: () => { s.selectSceneClip(index); deleteSelection(); } },
  ];
}

export function audioMenu(clipId: string, seek: Seek, atMs: number): readonly MenuItem[] {
  const s = useEditor.getState();
  const clip = s.project.audio.find((c) => c.id === clipId);
  const inside = clip !== undefined && s.playheadMs > clip.startMs && s.playheadMs < clip.startMs + (clip.trimEndMs - clip.trimStartMs);
  return [
    { label: 'Move playhead here', onSelect: () => { seek(atMs); } },
    { label: 'Split at playhead', disabled: !inside, onSelect: () => { s.dispatch(actions.splitAudio(clipId, s.playheadMs)); } },
    { kind: 'separator' },
    { label: 'Delete music clip', hint: 'Delete', danger: true, onSelect: () => { s.selectAudio(clipId); deleteSelection(); } },
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
    { label: 'Delete effect', hint: 'Delete', danger: true, onSelect: () => { s.selectEffect(clipId); deleteSelection(); } },
  ];
}

function sceneLengthAt(index: number): number {
  const scene = useEditor.getState().project.scenes[index];
  return scene ? sceneLengthMs(scene) : 0;
}

/** For a template element picked on the canvas. */
export function slotMenu(key: string, label: string): readonly MenuItem[] {
  const s = useEditor.getState();
  const o = useOverlays.getState();
  const target = { kind: 'slot' as const, key };
  const photo = /^photo:(\d+)$/.exec(key);
  const isText = key.startsWith('text:');
  return [
    ...(isText ? [{ label: 'Edit text', hint: 'Enter', onSelect: () => { o.openTextEdit(key); } }] : []),
    ...(photo?.[1] !== undefined
      ? [{ label: 'Replace photo…', hint: 'Double-click', onSelect: () => { o.openPhotoPicker({ kind: 'slot', index: Number(photo[1]) }); } }]
      : []),
    ...(isText ? [{ label: 'Text style…', onSelect: () => { s.selectSlot(key, 'text'); } }] : []),
    ...(photo ? [{ label: 'Frame and crop…', onSelect: () => { s.selectSlot(key, 'photos', Number(photo[1])); } }] : []),
    { kind: 'separator' },
    { label: 'Effects…', onSelect: () => { o.openPicker({ target: { kind: 'element', target, label } }); } },
    { label: 'Entrance effect…', onSelect: () => { o.openPicker({ target: { kind: 'element', target, label }, category: 'Entrance' }); } },
    { label: 'Exit effect…', onSelect: () => { o.openPicker({ target: { kind: 'element', target, label }, category: 'Exit' }); } },
    { label: 'Motion properties', onSelect: () => { s.selectSlot(key, 'motion'); } },
    { kind: 'separator' },
    { label: 'Bring to front', hint: ']', onSelect: () => { s.dispatch(actions.arrangeSlot(key, 'front')); } },
    { label: 'Send to back', hint: '[', onSelect: () => { s.dispatch(actions.arrangeSlot(key, 'back')); } },
    { label: 'Reset to the design', onSelect: () => { s.dispatch(actions.resetSlot(key)); } },
    { kind: 'separator' },
    { label: isText ? 'Remove text' : 'Delete photo', hint: 'Delete', danger: true, onSelect: () => { deleteSlot(key); } },
  ];
}

export function logoMenu(): readonly MenuItem[] {
  const s = useEditor.getState();
  const o = useOverlays.getState();
  const target = { kind: 'logo' as const };
  return [
    { label: 'Replace logo…', hint: 'Double-click', onSelect: () => { o.openPhotoPicker({ kind: 'logo' }); } },
    { label: 'Logo effects…', hint: 'Shine, glow…', onSelect: () => { o.openPicker({ target: { kind: 'element', target, label: 'the logo' } }); } },
    { label: 'Logo settings', onSelect: () => { s.selectLogo(true); } },
    { kind: 'separator' },
    { label: 'Remove logo', hint: 'Delete', danger: true, onSelect: () => { s.selectLogo(true); deleteSelection(); } },
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
    { kind: 'separator' },
    { label: 'Choose a different design…', onSelect: () => { o.openPhonePanel('designs'); } },
  ];
}

/**
 * A longer video from the design on screen (D-129): "add a button somewhere
 * to create multi-scene videos from Showcase … continue with design as scene
 * 1". Corporate Ads keeps the current design as its first scene (setMode
 * always has), then the scene picker opens for the second. One undo goes back.
 */
export function continueAsVideo(): void {
  const s = useEditor.getState();
  if (s.project.mode !== 'motionAd') s.setMode('motionAd');
  useOverlays.getState().openScenePicker('add');
  s.showToast('Your design is scene 1. Pick what comes next.');
}

/** Where a scene sits on the project clock, for "Move playhead here". */
export function sceneStartMs(index: number): number {
  return sceneSpans(useEditor.getState().project.scenes)[index]?.startMs ?? 0;
}
