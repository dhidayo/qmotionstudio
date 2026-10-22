import { FIRST_SCENE, setTemplate } from '@/document/actions';
import { createSceneFrom } from '@/document/defaults';
import { userPhotoIds } from '@/document/select/media';
import type { Project } from '@/document/types';
import type { TemplateChange } from '@/state/templateChange';
import type { SceneTemplate } from '@/templates/schema';

/**
 * The project as it would be with a design picked, for the library's live
 * preview to play (D-160) — never stored, never put on the undo history.
 *
 * The change is the very one "Use this design" dispatches, applied to a copy
 * at the scene the person has selected, so the preview is the person's own
 * frame shape, photos, words, look and logo in the new design. Two things are
 * left out, because the preview only has to look right:
 *
 *   music     a preview is silent, and the editor's audio graph stays the
 *             editor's.
 *   videos    a video on top shares one decoder with the editor's canvas, and
 *             two playheads asking it for different moments would make both
 *             stutter.
 */
export function trialProject(project: Project, change: TemplateChange, sceneIndex: number): Project {
  const next = change.action.apply(project, { sceneIndex });
  return {
    ...next,
    audio: [],
    overlays: next.overlays.filter((overlay) => overlay.content.kind !== 'customMedia'),
  };
}

/**
 * One scene in another design, for a hovered card in the scene picker
 * (D-160), made the way the picker makes it:
 *
 *   add      a new scene from the design, carrying the selected scene's logo
 *            and look and the person's photos forward (D-098).
 *   replace  the selected scene switched to the design — its photos, words,
 *            look and logo kept, its length kept where the design allows.
 *
 * Alone, so the preview plays that scene from its start rather than the whole
 * video; the video's own layers are timed to the video, so they stay out too.
 */
export function sceneTrialProject(project: Project, sceneIndex: number, template: SceneTemplate, mode: 'add' | 'replace'): Project {
  const scene = project.scenes[sceneIndex] ?? project.scenes[0];
  if (!scene) return project;
  const bare = { ...project, overlays: [], audio: [] };
  if (mode === 'add') {
    const added = createSceneFrom(template.id, {
      durationMs: template.defaultDurationMs,
      photoCount: template.photoSlots.default,
      from: scene,
      photoIds: userPhotoIds(project),
    });
    return { ...bare, scenes: [added] };
  }
  const durationMs = Math.max(template.minDurationMs, Math.min(scene.durationMs, template.maxDurationMs));
  const alone: Project = { ...bare, scenes: [{ ...scene, transitionIn: null }] };
  return setTemplate(template.id, { durationMs, photoSlots: template.photoSlots }).apply(alone, FIRST_SCENE);
}
