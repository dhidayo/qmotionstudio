import * as actions from '@/document/actions';
import { sceneSpans, totalDurationMs } from '@/document/select/timeline';
import type { ElementEffectDef, FrameEffectDef } from '@/core/effects/types';
import { useEditor } from '@/state/store';
import type { PickerTarget } from '@/ui/shell/overlays';

/**
 * Putting a chosen effect where it was asked for (D-100).
 *
 * A mood — snow, a film look — covers the whole scene, or the rest of the ad
 * from the playhead. A moment — a flash, a shake, a burst of confetti — goes
 * at the playhead for its natural length. That is the difference between the
 * two kinds of thing people mean by "add an effect", and guessing it right
 * saves a drag on almost every effect added.
 *
 * Returns the toast to show.
 */
export function addFrameEffect(target: Extract<PickerTarget, { kind: 'scene' | 'timeline' }>, def: FrameEffectDef): string {
  const state = useEditor.getState();
  const { project, playheadMs, selectedScene } = state;

  if (target.kind === 'scene') {
    const span = sceneSpans(project.scenes)[selectedScene];
    if (!span) return 'There is no scene to add it to.';
    // Real time: the scene's length on the timeline, at its speed.
    const sceneMs = span.endMs - span.startMs;
    const local = Math.max(0, Math.min(playheadMs - span.startMs, sceneMs));
    const window = def.defaultMs === null
      ? { startMs: 0, endMs: sceneMs }
      : (() => {
          const length = Math.min(def.defaultMs, sceneMs);
          const startMs = Math.max(0, Math.min(local, sceneMs - length));
          return { startMs, endMs: startMs + length };
        })();
    state.dispatch(actions.addSceneEffect(actions.makeEffectClip(def.id, window, def.defaultIntensity)));
    state.setInspectorTab('motion');
    return def.defaultMs === null
      ? `“${def.name}” added to the whole scene.`
      : `“${def.name}” added at the playhead.`;
  }

  const videoMs = Math.max(1, totalDurationMs(project));
  const at = Math.max(0, Math.min(playheadMs, videoMs));
  const window = def.defaultMs === null
    ? { startMs: videoMs - at < 1_000 ? 0 : at, endMs: videoMs }
    : (() => {
        const length = Math.min(def.defaultMs, videoMs);
        const startMs = Math.max(0, Math.min(at, videoMs - length));
        return { startMs, endMs: startMs + length };
      })();
  const clip = actions.makeEffectClip(def.id, window, def.defaultIntensity);
  state.dispatch(actions.addTimelineEffect(clip));
  state.selectEffect(clip.id);
  return `“${def.name}” added to the timeline. Drag it to move it, or its ends to resize.`;
}

export function addElementEffect(target: Extract<PickerTarget, { kind: 'element' }>, def: ElementEffectDef): string {
  const state = useEditor.getState();
  const effect = actions.makeElementEffect(def.id, def.phase, def.defaultMs, def.defaultIntensity);
  state.dispatch(actions.addElementEffect(target.target, effect));
  if (target.target.kind !== 'overlay') state.setInspectorTab('motion');
  const when = def.phase === 'enter' ? 'as it enters' : def.phase === 'exit' ? 'as it leaves' : 'throughout';
  return `“${def.name}” added to ${target.label}, ${when}.`;
}
