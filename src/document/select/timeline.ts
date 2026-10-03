import type { Overlay, Project, Scene, Transition } from '@/document/types';
import { audioEndMs } from '@/core/audio/envelope';

/**
 * Scene placement on the global timeline.
 *
 * D-004: a transition overlaps its neighbours. Scene N starts `transitionIn.
 * durationMs` *before* scene N−1 ends, so during the overlap both scenes are
 * inside their own valid local time range — no frozen last frame, no undefined
 * content past a scene's duration.
 */

export type SceneSpan = {
  readonly scene: Scene;
  readonly index: number;
  readonly startMs: number;
  readonly endMs: number;
  /** Absolute window during which this scene and the previous one both draw. */
  readonly transitionIn: Transition | null;
  readonly transitionStartMs: number;
  readonly transitionEndMs: number;
};

/**
 * How long a scene lasts on the timeline: its length, played at its speed.
 *
 * `durationMs` is the design's own length — what the template is built for —
 * and §8.4's speed plays it faster or slower. The timeline used to give a scene
 * its `durationMs` whatever the speed, so a design at 2× finished half way and
 * left the rest of its scene blank: "the timeline is longer than required".
 * At 0.5× it was cut off half way instead.
 */
export function sceneLengthMs(scene: Scene): number {
  const speed = Math.max(0.25, Math.min(3, scene.inputs.look.speed || 1));
  return Math.max(1, Math.round(scene.durationMs / speed));
}

export function sceneSpans(scenes: readonly Scene[]): readonly SceneSpan[] {
  const spans: SceneSpan[] = [];
  let cursor = 0;

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    if (!scene) continue;

    // The first scene can never have a transition in — there is nothing to
    // transition from. Enforced here as well as in validate.ts.
    const transition = i === 0 ? null : scene.transitionIn;
    const overlap = clampOverlap(transition, scene, scenes[i - 1]);

    const startMs = Math.max(0, cursor - overlap);
    const endMs = startMs + sceneLengthMs(scene);

    spans.push({
      scene,
      index: i,
      startMs,
      endMs,
      transitionIn: transition,
      transitionStartMs: startMs,
      transitionEndMs: startMs + overlap,
    });

    cursor = endMs;
  }

  return spans;
}

/**
 * A transition can never eat more than half of either neighbour, or scenes
 * would start before the one before them and the timeline would fold over.
 */
function clampOverlap(transition: Transition | null, scene: Scene, previous: Scene | undefined): number {
  if (!transition || transition.kind === 'cut' || !previous) return 0;
  const limit = Math.min(sceneLengthMs(scene), sceneLengthMs(previous)) / 2;
  return Math.max(0, Math.min(transition.durationMs, limit));
}

export function totalDurationMs(project: Project): number {
  const spans = sceneSpans(project.scenes);
  const lastScene = spans.at(-1)?.endMs ?? 0;
  // An overlay or an audio clip may legitimately run past the last scene.
  const lastOverlay = project.overlays.reduce((max, o) => Math.max(max, o.endMs), 0);
  return Math.max(lastScene, lastOverlay);
}

export type ActiveScenes = {
  readonly current: SceneSpan;
  /** Present only during a transition overlap. */
  readonly incoming?: SceneSpan;
  /** 0→1 across the overlap. 0 when not transitioning. */
  readonly progress: number;
};

export function activeScenesAt(spans: readonly SceneSpan[], timeMs: number): ActiveScenes | null {
  if (spans.length === 0) return null;

  for (let i = spans.length - 1; i >= 0; i--) {
    const span = spans[i];
    if (!span) continue;
    if (timeMs < span.startMs) continue;

    const overlapMs = span.transitionEndMs - span.transitionStartMs;
    const inOverlap = overlapMs > 0 && timeMs < span.transitionEndMs;

    if (inOverlap) {
      const outgoing = spans[i - 1];
      if (outgoing) {
        return {
          current: outgoing,
          incoming: span,
          progress: (timeMs - span.transitionStartMs) / overlapMs,
        };
      }
    }
    return { current: span, progress: 0 };
  }

  const first = spans[0];
  return first ? { current: first, progress: 0 } : null;
}

/**
 * Overlays live on the *global* timeline (§3C), not inside a scene, so they are
 * resolved against `globalTimeMs` directly and never shifted by a transition
 * overlap.
 *
 * §6.4 step 4 orders them "by track then z". Track index is the outer key —
 * L1 draws first, so a higher track number sits on top, which is the way every
 * layer panel in the world reads. Document order breaks the tie, so two clips
 * sharing a track stack in the order they were added.
 */
export function activeOverlaysAt(
  overlays: readonly Overlay[],
  timeMs: number,
): readonly Overlay[] {
  const active = overlays.filter((o) => timeMs >= o.startMs && timeMs < o.endMs);
  if (active.length < 2) return active;

  return active
    .map((overlay, order) => ({ overlay, order }))
    .sort((a, b) => a.overlay.track - b.overlay.track || a.order - b.order)
    .map((entry) => entry.overlay);
}

/** Highest track index in use, so the timeline knows how many rows to draw. */
export function trackCount(overlays: readonly Overlay[]): number {
  return overlays.reduce((max, o) => Math.max(max, o.track + 1), 0);
}

/**
 * How much time the timeline has to *show*, as opposed to how much it renders.
 *
 * These are not the same thing and conflating them was a real bug. The lane
 * used to span `totalDurationMs` — the video's length — so a three-minute
 * track dropped onto a fifteen-second ad drew as a full-width bar with its
 * right-hand trim handle pinned off the end of the lane. It could not be
 * trimmed, slipped or even seen; the only way to shorten it was to not have
 * imported it.
 *
 * The lane therefore spans whatever the project *contains*. Audio past the end
 * of the video is shown, dimmed, beyond an end-of-video marker — which also
 * makes D-053 visible: the exported mix is cut to the video, and now you can
 * see the part that will be cut.
 */
export function timelineSpanMs(project: Project): number {
  return Math.max(totalDurationMs(project), audioEndMs(project.audio));
}

/** True when there is content past the end of the video. */
export function hasOverhang(project: Project): boolean {
  return timelineSpanMs(project) > totalDurationMs(project) + 1;
}
