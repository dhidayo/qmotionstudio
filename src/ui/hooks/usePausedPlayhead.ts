import { useMemo, useSyncExternalStore } from 'react';
import type { PreviewClock } from '@/core/time/clock';
import { useEditor } from '@/state/store';
import { usePreviewClock } from '@/ui/shell/ClockProvider';

/**
 * The published playhead, held still while the picture plays (D-154).
 *
 * The store is given the playhead every frame during playback, so that the
 * selection box keeps up with a moving element. A panel that read it as well
 * re-rendered sixty times a second beside the playing picture, to keep a
 * button's state current that nobody could press that fast. This hands such a
 * panel the playhead as it was when play began, and the current one again the
 * moment the picture stops: paused by hand, or at the end of a design that
 * plays once — which stops the clock without telling anyone, so the clock is
 * asked again on every published frame rather than trusted to say.
 *
 * A button that acts "at the playhead" reads the store when it is pressed
 * (`useEditor.getState().playheadMs`), so a press during playback lands where
 * the picture is, not where it was when play began.
 */
export function usePausedPlayhead(): number {
  const clock = usePreviewClock();
  const source = useMemo(() => pausedPlayhead(clock), [clock]);
  return useSyncExternalStore(source.subscribe, source.read, source.read);
}

function pausedPlayhead(clock: PreviewClock | null): {
  subscribe: (changed: () => void) => () => void;
  read: () => number;
} {
  let held = useEditor.getState().playheadMs;
  return {
    subscribe: (changed) => {
      const offStore = useEditor.subscribe(changed);
      // Play and pause: the store hears nothing of a pause, since the time stands still.
      const offClock = clock?.subscribe(changed) ?? null;
      return () => {
        offStore();
        offClock?.();
      };
    },
    read: () => {
      if (clock?.playing === true) return held;
      held = useEditor.getState().playheadMs;
      return held;
    },
  };
}
