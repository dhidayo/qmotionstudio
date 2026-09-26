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
    /*
     * Never the exact end.
     *
     * A layer's range is half-open (`timeMs < endMs`), so the instant a motion
     * finishes is the first instant the overlay is *gone* — standing there
     * leaves nothing on screen to drag, which is exactly the moment someone
     * wants to say where it finishes.
     */
    const at = overlay.startMs + Math.min(atMs, spanMs - 1);
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
      explain={
        'Give this overlay a motion and it travels from where it is now to wherever you put '
        + 'it at the end. The motion shows on the timeline as a bar you can move and stretch.'
      }
      easing={{
        value: overlay.easing ?? 'smooth',
        onChange: (easing) => { dispatch(actions.setOverlayEasing(id, easing)); },
      }}
      onToggle={(on) => { dispatch(actions.setOverlayAnimated(id, on, localMs)); }}
      onAdd={(atMs) => { dispatch(actions.addOverlayMotion(id, atMs)); }}
      onGoTo={goTo}
    />
  );
}
