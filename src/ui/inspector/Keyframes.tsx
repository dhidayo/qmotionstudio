import * as actions from '@/document/actions';
import { isAnimated, posesOf } from '@/document/select/overlay';
import type { Overlay } from '@/document/types';
import { useEditor } from '@/state/store';
import { usePreviewClock } from '@/ui/shell/ClockProvider';
import { KeyframeControls } from './KeyframeControls';

/** An overlay's keyframes: its placement over time (§6.1). */
export function Keyframes({ overlay }: { overlay: Overlay }): React.JSX.Element {
  const dispatch = useEditor((s) => s.dispatch);
  const playheadMs = useEditor((s) => s.playheadMs);
  const setPlayhead = useEditor((s) => s.setPlayhead);
  const clock = usePreviewClock();

  const { id } = overlay;
  const spanMs = Math.max(1, overlay.endMs - overlay.startMs);
  /*
   * Keyframe times are in the overlay's own time, like every other layer time
   * in §6.1 — so a clip dragged along the timeline takes its motion with it
   * rather than having it reinterpreted against the project clock.
   */
  const localMs = Math.round(playheadMs - overlay.startMs);

  /**
   * Publishes the playhead as well as seeking, for the reason D-064 gave:
   * everything that acts on it reads the published value, which the readout
   * only refreshes at 20Hz. Leaving that to catch up meant a drag straight
   * after "Set end" keyed the time the playhead used to be.
   */
  const goTo = (atMs: number): void => {
    const at = overlay.startMs + atMs;
    clock?.pause();
    clock?.seek(at);
    setPlayhead(at);
  };

  return (
    <KeyframeControls
      animated={isAnimated(overlay)}
      times={posesOf(overlay).map((pose) => pose.atMs)}
      spanMs={spanMs}
      localMs={localMs}
      label="Use keyframes"
      explain={
        'A keyframe records where this overlay is at one moment. Give it two and it travels '
        + 'between them. Turn this on, then set a start and an end below.'
      }
      easing={{
        value: overlay.easing ?? 'smooth',
        onChange: (easing) => { dispatch(actions.setOverlayEasing(id, easing)); },
      }}
      onToggle={(on) => { dispatch(actions.setOverlayAnimated(id, on, localMs)); }}
      onAdd={(atMs) => { dispatch(actions.setOverlayPose(id, atMs, {})); }}
      onRemove={(atMs) => { dispatch(actions.removeOverlayPose(id, atMs)); }}
      onGoTo={goTo}
    />
  );
}
