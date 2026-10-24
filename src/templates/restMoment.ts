import type { Project } from '@/document/types';
import { sceneLengthMs } from '@/document/select/timeline';
import { summaryFor } from './manifest';

/**
 * Where an image comes to rest: its picture moment (D-155).
 *
 * "For Design, I do not want the animation to keep playing on repeat. Play
 * once and stop is enough." Image mode plays the design through once and then
 * holds one frame — the one Export → Image saves unless the person has paused
 * on another. That frame is the template's own best still, `posterAtMs`
 * (D-033), when it declares one: the library's card was taken there, so the
 * picture the person rests on is the one they chose. A design that declares
 * none rests on its last frame, which is where playing once ends anyway, so
 * nothing jumps.
 *
 * D-163 lets the person choose it: "let the animation stop on a specific
 * image so that it can be the basis for export to JPG." Paused on a frame,
 * "Use this frame" makes it the picture (`Project.pictureAtMs`) — the design
 * plays once and rests there, and Export → Image saves it — and "Reset"
 * goes back to the design's own.
 *
 * Pure, so it is tested in Node and shared by the preview and the export.
 */

/** The same bounds `sceneLengthMs` puts on a scene's speed. */
const clampSpeed = (speed: number): number => Math.max(0.25, Math.min(3, speed || 1));

/**
 * The picture moment on the project clock, in ms — or null when the project
 * is a video, which loops and has no single picture.
 *
 * `posterAtMs` is in the template's own time at its default length, so it is
 * clamped inside the scene as it is now (shortened below it, the design rests
 * on its end) and divided by the speed (§8.4's speed is a time remap, D-006).
 */
export function restMomentMs(project: Project): number | null {
  const own = designMomentMs(project);
  if (own === null) return null;
  const chosen = chosenMomentMs(project);
  return chosen ?? own;
}

/**
 * The frame the person chose with "Use this frame" (D-163), kept inside the
 * scene as it is now — a design made shorter or faster since rests on its
 * last frame rather than on nothing. Null when none is chosen, or in a video.
 */
export function chosenMomentMs(project: Project): number | null {
  if (project.mode !== 'showcase') return null;
  const chosen = project.pictureAtMs;
  const scene = project.scenes[0];
  if (chosen === undefined || !Number.isFinite(chosen) || !scene) return null;
  return Math.max(0, Math.min(sceneLengthMs(scene) - 1, Math.round(chosen)));
}

/** The design's own picture moment, whatever the person has chosen (D-155) — where "Reset" goes back to. */
export function designMomentMs(project: Project): number | null {
  if (project.mode !== 'showcase') return null;
  const scene = project.scenes[0];
  if (!scene) return null;
  const end = Math.max(0, sceneLengthMs(scene) - 1);
  const poster = summaryFor(scene.templateId)?.posterAtMs;
  if (poster === undefined) return end;
  const atTemplateMs = Math.min(poster, scene.durationMs - 1);
  return Math.max(0, Math.min(end, Math.round(atTemplateMs / clampSpeed(scene.inputs.look.speed))));
}
