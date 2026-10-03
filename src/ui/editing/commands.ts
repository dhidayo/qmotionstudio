import * as actions from '@/document/actions';
import { effectName } from '@/core/effects/catalog';
import type { Overlay } from '@/document/types';
import { sceneSpans, totalDurationMs } from '@/document/select/timeline';
import { summaryFor } from '@/templates/manifest';
import { useEditor } from '@/state/store';
import { useOverlays, type MenuItem } from '@/ui/shell/overlays';

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
    const clip = project.effects?.find((c) => c.id === s.selectedEffect);
    s.dispatch(actions.removeTimelineEffect(s.selectedEffect));
    s.selectEffect(null);
    s.showToast(`Deleted ${clip ? `“${effectName(clip.effectId)}”` : 'the effect'}. ${undoHint()}`);
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
    // A template's own element is part of its design, not a thing on its own.
    s.showToast('Parts of a design can’t be deleted. Clear its words in Text, swap its photo in Photos, or change the scene’s design.');
    return true;
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

/** Moves the playhead without starting playback. */
type Seek = (projectMs: number) => void;

export function overlayMenu(overlay: Overlay, seek: Seek | null, atMs: number): readonly MenuItem[] {
  const s = useEditor.getState();
  const o = useOverlays.getState();
  const label = overlayLabel(overlay);
  const target = { kind: 'overlay' as const, id: overlay.id };
  const name = overlay.kind === 'text' ? 'this caption' : 'this layer';
  return [
    { label: 'Effects…', hint: 'Shine, pulse, glow…', onSelect: () => { s.selectOverlay(overlay.id); o.openPicker({ target: { kind: 'element', target, label: name } }); } },
    { label: 'Entrance effect…', onSelect: () => { s.selectOverlay(overlay.id); o.openPicker({ target: { kind: 'element', target, label: name }, category: 'Entrance' }); } },
    { label: 'Exit effect…', onSelect: () => { s.selectOverlay(overlay.id); o.openPicker({ target: { kind: 'element', target, label: name }, category: 'Exit' }); } },
    { kind: 'separator' },
    ...(seek ? [{ label: 'Move playhead here', onSelect: () => { seek(atMs); } }] : []),
    { label: 'Duplicate', onSelect: () => { s.dispatch(actions.duplicateOverlay(overlay.id, totalDurationMs(s.project))); s.showToast(`Duplicated ${label}.`); } },
    { label: 'Bring to front', onSelect: () => { s.dispatch(actions.arrangeOverlay(overlay.id, 'front')); } },
    { label: 'Send to back', onSelect: () => { s.dispatch(actions.arrangeOverlay(overlay.id, 'back')); } },
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

export function effectMenu(clipId: string, seek: Seek, atMs: number): readonly MenuItem[] {
  const s = useEditor.getState();
  return [
    { label: 'Effect settings', onSelect: () => { s.selectEffect(clipId); } },
    { label: 'Move playhead here', onSelect: () => { seek(atMs); } },
    { label: 'Duplicate', onSelect: () => { s.dispatch(actions.duplicateTimelineEffect(clipId)); } },
    { kind: 'separator' },
    { label: 'Delete effect', hint: 'Delete', danger: true, onSelect: () => { s.selectEffect(clipId); deleteSelection(); } },
  ];
}

/** For a template element picked on the canvas. */
export function slotMenu(key: string, label: string): readonly MenuItem[] {
  const s = useEditor.getState();
  const o = useOverlays.getState();
  const target = { kind: 'slot' as const, key };
  return [
    { label: 'Effects…', onSelect: () => { o.openPicker({ target: { kind: 'element', target, label } }); } },
    { label: 'Entrance effect…', onSelect: () => { o.openPicker({ target: { kind: 'element', target, label }, category: 'Entrance' }); } },
    { label: 'Exit effect…', onSelect: () => { o.openPicker({ target: { kind: 'element', target, label }, category: 'Exit' }); } },
    { label: 'Motion properties', onSelect: () => { s.selectSlot(key, 'motion'); } },
    { kind: 'separator' },
    { label: 'Bring to front', onSelect: () => { s.dispatch(actions.arrangeSlot(key, 'front')); } },
    { label: 'Send to back', onSelect: () => { s.dispatch(actions.arrangeSlot(key, 'back')); } },
    { label: 'Reset to the design', onSelect: () => { s.dispatch(actions.resetSlot(key)); } },
  ];
}

export function logoMenu(): readonly MenuItem[] {
  const s = useEditor.getState();
  const o = useOverlays.getState();
  const target = { kind: 'logo' as const };
  return [
    { label: 'Logo effects…', hint: 'Shine, glow…', onSelect: () => { o.openPicker({ target: { kind: 'element', target, label: 'the logo' } }); } },
    { label: 'Logo settings', onSelect: () => { s.selectLogo(true); } },
    { kind: 'separator' },
    { label: 'Remove logo', hint: 'Delete', danger: true, onSelect: () => { s.selectLogo(true); deleteSelection(); } },
  ];
}

/** Where a scene sits on the project clock, for "Move playhead here". */
export function sceneStartMs(index: number): number {
  return sceneSpans(useEditor.getState().project.scenes)[index]?.startMs ?? 0;
}
