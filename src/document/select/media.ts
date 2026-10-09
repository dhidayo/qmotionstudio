import type { Project } from '@/document/types';
import { activeOverlaysAt } from './timeline';

/**
 * Which video frames a given instant needs (§9, D-051).
 *
 * `renderFrame` is synchronous and decoding is not, so the frame has to be in
 * the ring before the render asks for it. This is the bridge: a pure function
 * from (project, time) to the decode work that instant implies, which both
 * clocks — the preview's requestAnimationFrame loop and the export's fixed
 * timestep — feed to `MediaStore.prefetchVideo` before drawing.
 *
 * Keeping it here rather than inside the renderer is what lets `renderFrame`
 * stay free of side effects (§3A) while still never missing a frame.
 */

export type VideoDemand = {
  readonly mediaId: string;
  /** Time within the clip's own timeline, before looping is applied. */
  readonly timeMs: number;
};

export function videoDemands(project: Project, globalTimeMs: number): readonly VideoDemand[] {
  if (project.overlays.length === 0) return [];

  const demands: VideoDemand[] = [];
  for (const overlay of activeOverlaysAt(project.overlays, globalTimeMs)) {
    if (overlay.content.kind !== 'customMedia') continue;
    // §6.1: an overlay's layer time is relative to its own start.
    demands.push({ mediaId: overlay.content.mediaId, timeMs: globalTimeMs - overlay.startMs });
  }
  return demands;
}

/**
 * The same demands a short way ahead.
 *
 * Preview uses this so a clip that is about to come on screen has already
 * begun decoding. Without it, every overlay entrance shows a placeholder for
 * the first few frames — technically correct, visibly wrong.
 */
export const PREFETCH_LEAD_MS = 250;

export function videoDemandsWithLead(
  project: Project,
  globalTimeMs: number,
): readonly VideoDemand[] {
  const now = videoDemands(project, globalTimeMs);
  const soon = videoDemands(project, globalTimeMs + PREFETCH_LEAD_MS);
  if (soon.length === 0) return now;

  const seen = new Set(now.map((d) => d.mediaId));
  return [...now, ...soon.filter((d) => !seen.has(d.mediaId))];
}

/**
 * Every media id the project refers to (§13).
 *
 * The document holds ids and the store holds blobs (§5), so this is the list
 * that has to be on disk for a project to reopen looking like itself — and the
 * list to read back when it does.
 */
export function referencedMedia(project: Project): ReadonlySet<string> {
  const ids = new Set<string>();

  for (const scene of project.scenes) {
    for (const photo of scene.inputs.photos) ids.add(photo.mediaId);
    if (scene.inputs.logo.mediaId !== null) ids.add(scene.inputs.logo.mediaId);
    const backdrop = scene.inputs.look.backgroundMediaId;
    if (backdrop !== undefined) ids.add(backdrop);
  }
  for (const overlay of project.overlays) {
    if (overlay.content.kind !== 'text') ids.add(overlay.content.mediaId);
  }
  for (const clip of project.audio) ids.add(clip.mediaId);

  if (project.brand.logo) ids.add(project.brand.logo.mediaId);

  return ids;
}

/**
 * The photographs the person has brought to this project, in the order they
 * first appear, without repeats.
 *
 * Sample photos are not theirs and are left out, as are the empty stand-ins a
 * template draws when it has more slots than photos. An empty result means
 * "nothing of their own yet", which callers read as "use the samples".
 *
 * This is what continuity rests on: a new scene, or a whole ad template applied
 * over the top of their work, starts from *their* pictures rather than ours.
 */
export function userPhotoIds(project: Project): readonly string[] {
  const seen = new Set<string>();
  for (const scene of project.scenes) {
    for (const photo of scene.inputs.photos) {
      const id = photo.mediaId;
      if (id.startsWith('sample:') || id.startsWith('__empty_')) continue;
      seen.add(id);
    }
  }
  return [...seen];
}

