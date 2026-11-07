import { useSyncExternalStore } from 'react';
import * as actions from '@/document/actions';
import type { Project, ProjectMode } from '@/document/types';
import { useEditor } from '@/state/store';
import { undoHint } from '@/ui/editing/commands';
import { MODE_LABEL } from './modeLabels';

/**
 * Switches between Image and Video, from the top bar or the phone menu, and
 * says what happened (D-098, D-155, D-168).
 *
 * Into Video nothing is lost: the image becomes scene 1. Back to Image keeps
 * scene 1 and the layers over it; the other scenes, the layers over them and
 * the sound are set aside. "In a video mode of multiple scenes, if a user
 * clicks to go back to Image mode, popup to tell user that their design will
 * be lost and only one scene will be available in the image mode and let
 * them confirm; let the available scene be scene 1." So a video of more than
 * one scene, or with sound, asks first (`ImageModeConfirm`); a single scene
 * with no sound switches at once. Either way it is one undo step, and the
 * toast after it says how to get the video back.
 */

/** What switching this video to Image would set aside, worked out by the action itself. */
export type ImageLoss = {
  readonly scenes: number;
  readonly keptLayers: number;
  /** Layers after scene 1, over the scenes set aside or past its end. */
  readonly layersLeft: number;
  readonly sound: boolean;
};

export function imageLoss(project: Project): ImageLoss {
  const after = actions.setMode('showcase').apply(project, actions.FIRST_SCENE);
  return {
    scenes: project.scenes.length,
    keptLayers: after.overlays.length,
    layersLeft: project.overlays.length - after.overlays.length,
    sound: project.audio.length > 0,
  };
}

/** Whether to ask first: more than one scene, or sound, would be set aside. */
export function asksFirst(project: Project): boolean {
  return project.mode === 'motionAd' && (project.scenes.length > 1 || project.audio.length > 0);
}

/** "scenes 2–5". */
function laterScenes(count: number): string {
  return `scenes 2–${count}`;
}

/** The question's text: exactly what stays and what is set aside. */
export function imageQuestion(loss: ImageLoss): string {
  const scene = loss.scenes > 1 ? 'Scene 1' : 'The scene';
  const kept = loss.keptLayers > 0 ? `${scene} stays, with the layers over it` : `${scene} stays`;
  const layers = loss.layersLeft > 0;
  const aside = [
    ...(loss.scenes === 2 ? [layers ? 'scene 2 and its layers' : 'scene 2'] : []),
    ...(loss.scenes > 2 ? [laterScenes(loss.scenes), ...(layers ? ['the layers over them'] : [])] : []),
    ...(loss.scenes === 1 && layers ? ['the layers after it'] : []),
    ...(loss.sound ? ['the sound'] : []),
  ];
  // "scene 2 is", "the sound is"; anything plural, or more than one thing, "are".
  const single = aside.length === 1 && (aside[0] === 'scene 2' || aside[0] === 'the sound');
  const list = aside.length > 1 ? `${aside.slice(0, -1).join(', ')} and ${aside[aside.length - 1] ?? ''}` : aside[0] ?? '';
  return `An image is one scene. ${kept}${list === '' ? '' : `; ${list} ${single ? 'is' : 'are'} set aside`}. You can undo this.`;
}

// The question waiting for an answer, drawn once by the shell.
let pending: ImageLoss | null = null;
const listeners = new Set<() => void>();
function emit(): void { for (const listener of listeners) listener(); }

export function useImageQuestion(): ImageLoss | null {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    () => pending,
    () => null,
  );
}

export function closeImageQuestion(): void {
  pending = null;
  emit();
}

/** Switches now: one undo step, then the toast with the way back. */
function switchNow(next: ProjectMode): void {
  const s = useEditor.getState();
  const before = s.project;
  if (before.mode === next) return;
  s.setMode(next);
  if (next !== 'showcase') return;

  const after = useEditor.getState().project;
  const changed = before.scenes.length !== after.scenes.length
    || before.overlays.length !== after.overlays.length
    || before.audio.length > 0;
  if (!changed) return;
  s.showToast(`Switched to ${MODE_LABEL.showcase}, keeping ${before.scenes.length > 1 ? 'scene 1' : 'the scene'}. Want the video back? ${undoHint()}`);
}

/** The answer "Switch to Image". */
export function confirmImage(): void {
  closeImageQuestion();
  switchNow('showcase');
}

export function switchMode(next: ProjectMode): void {
  const { project } = useEditor.getState();
  if (project.mode === next) return;
  if (next === 'showcase' && asksFirst(project)) {
    pending = imageLoss(project);
    emit();
    return;
  }
  switchNow(next);
}
