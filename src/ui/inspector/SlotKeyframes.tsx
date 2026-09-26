import * as actions from '@/document/actions';
import { hasNudgePoses, nudgePoses } from '@/core/render/slots';
import { sceneSpans } from '@/document/select/timeline';
import { NO_SLOT_TRANSFORM } from '@/document/types';
import { useEditor } from '@/state/store';
import { usePreviewClock } from '@/ui/shell/ClockProvider';
import { KeyframeControls } from './KeyframeControls';

/**
 * Keyframes for one of the template's own photos or text blocks.
 *
 * What is keyframed is the *nudge* — how far the user has pulled the element
 * from where the template put it — not an absolute position. That is the same
 * choice D-061 made for the static case and it holds for the same reasons: the
 * template keeps deciding the layout, so switching aspect still re-lays-out
 * and "Reset to template" still means something.
 *
 * It exists at all because the previous answer — keyframes for overlays only —
 * was invisible and read as a missing feature. Someone selecting a photo saw a
 * Placement section offering nothing but "Reset to template" and concluded,
 * reasonably, that the product had no keyframes in it.
 */
export function SlotKeyframes({ slotKey }: { slotKey: string }): React.JSX.Element | null {
  const dispatch = useEditor((s) => s.dispatch);
  const playheadMs = useEditor((s) => s.playheadMs);
  const setPlayhead = useEditor((s) => s.setPlayhead);
  const selectedScene = useEditor((s) => s.selectedScene);
  const scenes = useEditor((s) => s.project.scenes);
  const transform = useEditor(
    (s) => s.project.scenes[s.selectedScene]?.inputs.slotTransforms[slotKey],
  );
  const clock = usePreviewClock();

  const scene = scenes[selectedScene];
  if (!scene) return null;

  /*
   * Scene time, after §8.4's speed remap.
   *
   * The template's own tracks run 0…durationMs in remapped time, and a nudge
   * has to share that clock or the two would drift apart the moment anyone
   * touched the speed slider.
   */
  const span = sceneSpans(scenes)[selectedScene];
  const sceneStartMs = span?.startMs ?? 0;
  const speed = scene.inputs.look.speed;
  const localMs = Math.round((playheadMs - sceneStartMs) * speed);

  const current = transform ?? NO_SLOT_TRANSFORM;

  const goTo = (atMs: number): void => {
    const at = sceneStartMs + (speed === 0 ? atMs : atMs / speed);
    clock?.pause();
    clock?.seek(at);
    setPlayhead(at);
  };

  return (
    <KeyframeControls
      animated={hasNudgePoses(current)}
      times={hasNudgePoses(current) ? nudgePoses(current).map((pose) => pose.atMs) : []}
      spanMs={scene.durationMs}
      localMs={localMs}
      label="Use keyframes"
      explain={
        'A keyframe records where you have moved this to at one moment. Give it two and it '
        + 'travels between them, on top of whatever the template already does.'
      }
      onToggle={(on) => { dispatch(actions.setSlotAnimated(slotKey, on, localMs)); }}
      onAdd={(atMs) => { dispatch(actions.setSlotPose(slotKey, atMs, {})); }}
      onRemove={(atMs) => { dispatch(actions.removeSlotPose(slotKey, atMs)); }}
      onGoTo={goTo}
    />
  );
}
