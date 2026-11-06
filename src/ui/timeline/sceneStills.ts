import type { Project, Scene } from '@/document/types';
import { ASPECT_RATIO, type Size } from '@/core/types';
import { designMomentMs } from '@/templates/restMoment';

/**
 * A small picture of each scene as the person made it (D-166), for the
 * phone's scene strip and the computer's scene clips.
 *
 * "While the pictures of the design changed, the timeline still shows the
 * sample pictures and that is not good too." The strip showed each design's
 * catalogue poster, whatever had been done to it. Now each scene is drawn by
 * the real renderer, small, at its picture moment (D-155) — its photos, words,
 * look, logo and parts — and the poster shows only until that is ready.
 *
 * This file is the pure part, tested in Node: what a scene's still depends on
 * (its key), and the one-scene project it is drawn from. The drawing, the
 * cache and the hook are in useSceneStills.
 */

/** The short edge of a still, in pixels: sharp in a 44px strip on a 3× phone, and cheap. */
export const STILL_SHORT_EDGE = 144;

/** A still's size for the project's shape, `STILL_SHORT_EDGE` on its short side. */
export function stillSize(project: Pick<Project, 'aspect'>): Size {
  const [w, h] = ASPECT_RATIO[project.aspect];
  return w >= h
    ? { w: Math.round((STILL_SHORT_EDGE * w) / h), h: STILL_SHORT_EDGE }
    : { w: STILL_SHORT_EDGE, h: Math.round((STILL_SHORT_EDGE * h) / w) };
}

/** Every media id inside a value: a scene's photos, its logo, a background picture. */
export function mediaIdsIn(value: unknown, into: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) mediaIdsIn(item, into);
  } else if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (key === 'mediaId' && typeof item === 'string') into.add(item);
      else mediaIdsIn(item, into);
    }
  }
  return into;
}

/**
 * Everything that changes how a scene's still looks, as one string: its
 * design, length (which moves its picture moment), inputs (photos, words,
 * look, logo, parts, effects, nudges), the project's shape and brand, and
 * which of its pictures are decoded yet — so a still drawn before a photo
 * arrived is drawn again once it has. The scene's place in the video, its
 * transition and the video's own layers do not change it, so moving a scene
 * or adding a layer redraws nothing.
 */
export function sceneStillKey(project: Project, scene: Scene, decoded: (mediaId: string) => boolean): string {
  const ids = [...mediaIdsIn(scene.inputs, mediaIdsIn(project.brand))].sort();
  return JSON.stringify([
    scene.templateId,
    scene.durationMs,
    project.aspect,
    project.brand,
    scene.inputs,
    ids.map((id) => (decoded(id) ? 1 : 0)).join(''),
  ]);
}

/**
 * The scene alone, as an image: no transition in, none of the video's layers,
 * music or timeline effects — what is in the scene itself.
 */
export function sceneStillProject(project: Project, scene: Scene): Project {
  const { pictureAtMs: _chosen, ...rest } = project;
  return { ...rest, mode: 'showcase', scenes: [{ ...scene, transitionIn: null }], overlays: [], audio: [], effects: [] };
}

/** Where the still is taken: the design's own picture moment (D-155) in that one-scene project. */
export function stillMomentMs(alone: Project): number {
  return designMomentMs(alone) ?? 0;
}
