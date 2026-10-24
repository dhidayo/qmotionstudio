import type { Overlay, Project } from '@/document/types';
import { packRows } from '@/document/select/audio';
import { rowCount } from './timelineGeometry';

/**
 * Which of the timeline's rows a project uses (D-153, D-162).
 *
 * "Show only used timeline and hide others that are not in use … however, you
 * may always show the scene." The ruler and the scenes are always there; the
 * rest appear once something is on them, and go when the last thing on them
 * does.
 *
 * And no row of its own for anything that can sit somewhere else (D-162): "I
 * would also no specialized rows for items that can stack somewhere else if
 * not major elements." So there are two groups below the scenes, not five
 * kinds of row:
 *
 *   Layers  the overlay layers L1, L2 … with the spare one to drop onto
 *           (D-103), and the effects in the gaps between their clips — more
 *           lanes only when the effects need them;
 *   Audio   music and library sounds together, overlapping clips stacked.
 *
 * Motion has no row at all: a moving layer's motion is drawn on its clip, and
 * a moving template element's on its scene's clip, while it is selected.
 *
 * Pure, so the rule is testable without a page.
 */
export type TimelineRows = {
  /** Overlay layer rows, with the spare one to drop onto (D-103); none without overlays. */
  readonly layerRows: number;
  /** Lanes in the Layers group: the layer rows, and any more the effects need. */
  readonly lanes: number;
  /** Rows in the Audio group: music and sounds, overlapping clips stacked (D-156). */
  readonly audioRows: number;
};

/**
 * Whether anything in the project has a motion — two poses or more, which is
 * what makes a span (`spanOf`). One pose is a resting place, not a motion.
 */
export function anyMotion(project: Project): boolean {
  return project.overlays.some((overlay) => (overlay.poses?.length ?? 0) >= 2)
    || project.scenes.some((scene) => sceneMoves(scene));
}

/** Whether one of a scene's own elements moves — its clip says so (D-162). */
export function sceneMoves(scene: Project['scenes'][number]): boolean {
  return Object.values(scene.inputs.slotTransforms).some((transform) => (transform.poses?.length ?? 0) >= 2);
}

/** An effect as the timeline lays it out: where it runs on the project clock. */
export type EffectSpan = { readonly id: string; readonly startMs: number; readonly endMs: number };

/**
 * Where each effect sits in the Layers group (D-162): on the first lane, from
 * the top, where it overlaps neither a layer's clip nor another effect. A
 * lane past the layers is added only when no gap is long enough.
 *
 * An effect has no layer of its own in the document — it is drawn over the
 * whole frame — so its lane is only where there is room to see and grab it,
 * worked out afresh each time. A layer dragged over one simply moves it to
 * the next gap; nothing about the layer, or the effect, changes.
 */
export function packEffectLanes(
  overlays: readonly Overlay[],
  effects: readonly EffectSpan[],
): { readonly laneOf: ReadonlyMap<string, number>; readonly lanes: number } {
  const overlaps = (a: { startMs: number; endMs: number }, b: { startMs: number; endMs: number }): boolean =>
    a.startMs < b.endMs && b.startMs < a.endMs;
  const placed: EffectSpan[][] = [];
  const laneOf = new Map<string, number>();
  for (const fx of [...effects].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs)) {
    let lane = 0;
    for (;; lane++) {
      const layerBusy = overlays.some((o) => o.track === lane && overlaps(o, fx));
      const fxBusy = (placed[lane] ?? []).some((other) => overlaps(other, fx));
      if (!layerBusy && !fxBusy) break;
    }
    (placed[lane] ??= []).push(fx);
    laneOf.set(fx.id, lane);
  }
  return { laneOf, lanes: placed.length };
}

/** The rows to draw, given how many lanes the effects need (`packEffectLanes`). */
export function timelineRows(project: Project, effectLanes: number): TimelineRows {
  const layerRows = project.overlays.length > 0 ? rowCount(project.overlays) : 0;
  return {
    layerRows,
    lanes: Math.max(layerRows, effectLanes),
    audioRows: packRows(project.audio).rows,
  };
}

/**
 * True when a group that was not there now is — the cue to unfold a folded
 * timeline, because what was just added is now part of the work ("once that
 * is applied, you can show the timeline because it is now relevant"). More
 * of a group already shown is not news.
 */
export function newRowKinds(before: TimelineRows, after: TimelineRows): boolean {
  return (before.lanes === 0 && after.lanes > 0)
    || (before.audioRows === 0 && after.audioRows > 0);
}
