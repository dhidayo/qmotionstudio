import type { Project } from '@/document/types';
import { rowCount } from './timelineGeometry';

/**
 * Which of the timeline's rows a project uses (D-153).
 *
 * "Show only used timeline and hide others that are not in use … however, you
 * may always show the scene." The ruler and the scenes are always there; the
 * rest appear once something is on them, and go when the last thing on them
 * does. An empty row with a hint in it was a row of height spent telling
 * people about a button — and four of them took the picture's room on every
 * new video.
 *
 * Pure, so the rule is testable without a page.
 */
export type TimelineRows = {
  /** Something in the project moves: an overlay or a template element with a motion. */
  readonly motion: boolean;
  /** Rows of effects, overlapping ones stacked (D-106). */
  readonly effectRows: number;
  /** Layer rows, with the spare one to drop onto (D-103); none without overlays. */
  readonly layerRows: number;
  readonly music: boolean;
};

/**
 * Whether anything in the project has a motion — two poses or more, which is
 * what makes a span (`spanOf`). One pose is a resting place, not a motion.
 *
 * The whole project rather than the selection: a row that came and went with
 * every click would move the picture every time something was picked.
 */
export function anyMotion(project: Project): boolean {
  return project.overlays.some((overlay) => (overlay.poses?.length ?? 0) >= 2)
    || project.scenes.some((scene) =>
      Object.values(scene.inputs.slotTransforms).some((transform) => (transform.poses?.length ?? 0) >= 2));
}

/** The rows to draw, given how many rows the effects pack into. */
export function timelineRows(project: Project, effectRowCount: number): TimelineRows {
  return {
    motion: anyMotion(project),
    effectRows: Math.max(0, effectRowCount),
    layerRows: project.overlays.length > 0 ? rowCount(project.overlays) : 0,
    music: project.audio.length > 0,
  };
}

/**
 * True when a kind of row that was not there now is — the cue to unfold a
 * folded timeline, because what was just added is now part of the work
 * ("once that is applied, you can show the timeline because it is now
 * relevant"). More of a kind already shown is not news.
 */
export function newRowKinds(before: TimelineRows, after: TimelineRows): boolean {
  return (!before.motion && after.motion)
    || (before.effectRows === 0 && after.effectRows > 0)
    || (before.layerRows === 0 && after.layerRows > 0)
    || (!before.music && after.music);
}
