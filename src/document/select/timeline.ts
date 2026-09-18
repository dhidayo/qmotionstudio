import type { Project, Scene, Transition } from '@/document/types';

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
    const endMs = startMs + scene.durationMs;

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
  const limit = Math.min(scene.durationMs, previous.durationMs) / 2;
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
