import * as actions from '@/document/actions';
import type { Project, SlotKey } from '@/document/types';
import { MIN_MOTION_MS, spanOf } from '@/document/select/motion';
import { sceneSpans } from '@/document/select/timeline';
import { exitMsOf } from '@/core/render/overlays';

/**
 * What "+ Motion" acts on (D-153), and where its motion sits in time.
 *
 * The add bar's "+ Motion" gives the selected thing a motion: an overlay, or a
 * template photograph or block of text. It used to be a button on the motion
 * lane that only appeared once something was selected — the lane itself
 * always on screen to hold it. Pure, so the arithmetic that places a new
 * motion and the moment to show it are testable without a page.
 */
export type MotionTarget =
  | {
      readonly kind: 'overlay';
      readonly id: string;
      /** The playhead in the overlay's own clock, clamped to the overlay. */
      readonly localMs: number;
      /** Where its exit begins, in its own clock: the latest a new motion finishes. */
      readonly finishBy: number;
      /** Whether it already has a motion (two poses or more). */
      readonly has: boolean;
    }
  | {
      readonly kind: 'slot';
      readonly key: SlotKey;
      readonly sceneIndex: number;
      /** The playhead in the scene's own clock, after its speed (§8.4). */
      readonly localMs: number;
      readonly sceneMs: number;
      readonly has: boolean;
    };

export type MotionSelection = {
  readonly selectedOverlay: string | null;
  readonly selectedSlot: SlotKey | null;
  readonly selectedScene: number;
  readonly playheadMs: number;
};

/** The selected thing that can be given a motion, or null when nothing selected can. */
export function motionTargetOf(project: Project, selection: MotionSelection): MotionTarget | null {
  if (selection.selectedOverlay !== null) {
    const overlay = project.overlays.find((o) => o.id === selection.selectedOverlay);
    if (!overlay) return null;
    const spanMs = Math.max(1, overlay.endMs - overlay.startMs);
    return {
      kind: 'overlay',
      id: overlay.id,
      localMs: clamp(Math.round(selection.playheadMs - overlay.startMs), 0, spanMs),
      finishBy: Math.round(spanMs - exitMsOf(spanMs, overlay.exitAnim)),
      has: spanOf((overlay.poses ?? []).map((pose) => pose.atMs)) !== null,
    };
  }
  if (selection.selectedSlot !== null) {
    const span = sceneSpans(project.scenes)[selection.selectedScene];
    if (!span) return null;
    const sceneMs = span.scene.durationMs;
    const transform = span.scene.inputs.slotTransforms[selection.selectedSlot];
    return {
      kind: 'slot',
      key: selection.selectedSlot,
      sceneIndex: span.index,
      localMs: clamp(Math.round((selection.playheadMs - span.startMs) * span.scene.inputs.look.speed), 0, sceneMs),
      sceneMs,
      has: spanOf((transform?.poses ?? []).map((pose) => pose.atMs)) !== null,
    };
  }
  return null;
}

/**
 * The motion, as one undo step.
 *
 * The lane's button used to dispatch "animate" and then "add motion" — two
 * steps, the first of which undid to nothing anyone could see. Adding the
 * motion alone gives the same result: its two poses are both the pose the
 * element already holds.
 *
 * An overlay's motion finishes where its exit begins. Left to run to the
 * overlay's end, it finished as the element faded away, and "+ Motion" —
 * which stops the preview at the motion's end for the drag that says where it
 * goes — stopped on a caption nobody could see.
 */
export function addMotionAction(target: MotionTarget): actions.Action {
  if (target.kind === 'slot') return actions.addSlotMotion(target.key, target.localMs, target.sceneMs);
  const add = actions.addOverlayMotion(target.id, target.localMs);
  return {
    label: add.label,
    apply: (project, scope) => {
      const added = add.apply(project, scope);
      const poses = added.overlays.find((o) => o.id === target.id)?.poses ?? [];
      const span = spanOf(poses.map((pose) => pose.atMs));
      // Unless that would leave too little of it to be a motion at all.
      if (!span || span.endMs <= target.finishBy || target.finishBy - span.startMs < MIN_MOTION_MS) return added;
      return actions.reshapeOverlayMotion(target.id, { edge: 'end', toMs: target.finishBy }).apply(added, scope);
    },
  };
}

/**
 * Where the target's motion starts and finishes, on the project clock — the
 * moments to take the playhead to — or null when it has none.
 *
 * Never the exact end of the element: a layer's range is half-open, so the
 * instant it ends it is gone, and standing there leaves nothing to drag.
 */
export function motionWindow(project: Project, target: MotionTarget): { startMs: number; endMs: number } | null {
  if (target.kind === 'overlay') {
    const overlay = project.overlays.find((o) => o.id === target.id);
    const span = spanOf((overlay?.poses ?? []).map((pose) => pose.atMs));
    if (!overlay || !span) return null;
    const last = Math.max(0, overlay.endMs - overlay.startMs - 1);
    return {
      startMs: overlay.startMs + Math.min(span.startMs, last),
      endMs: overlay.startMs + Math.min(span.endMs, last),
    };
  }
  const sceneSpan = sceneSpans(project.scenes)[target.sceneIndex];
  const span = spanOf((sceneSpan?.scene.inputs.slotTransforms[target.key]?.poses ?? []).map((pose) => pose.atMs));
  if (!sceneSpan || !span) return null;
  const speed = sceneSpan.scene.inputs.look.speed;
  const scale = speed === 0 ? 1 : 1 / speed;
  const last = Math.max(0, sceneSpan.scene.durationMs - 1);
  return {
    startMs: sceneSpan.startMs + Math.min(span.startMs, last) * scale,
    endMs: sceneSpan.startMs + Math.min(span.endMs, last) * scale,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
