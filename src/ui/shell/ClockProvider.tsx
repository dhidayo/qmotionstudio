import { createContext, useContext, type ReactNode } from 'react';
import type { PreviewClock } from '@/core/time/clock';

/**
 * Makes the transport reachable from the inspector.
 *
 * A context for the same reason the media store gets one: `PreviewClock` is a
 * plain mutable object advanced sixty times a second, and putting it in the
 * document state would re-render the editor at that rate for no benefit (§3A).
 *
 * The inspector needs it because some of its controls are *about* time — a
 * keyframe at the start of a clip is only meaningful if pressing the button
 * also takes you there to see it.
 */
const ClockContext = createContext<PreviewClock | null>(null);

export function ClockProvider({
  clock,
  children,
}: {
  clock: PreviewClock;
  children: ReactNode;
}): React.JSX.Element {
  return <ClockContext.Provider value={clock}>{children}</ClockContext.Provider>;
}

/** Null outside a provider rather than throwing: panels must still render. */
export function usePreviewClock(): PreviewClock | null {
  return useContext(ClockContext);
}

/**
 * Stops the preview where it is, for the moment someone picks an element to
 * edit (D-110) — on the canvas or the timeline, by click, tap or menu.
 *
 * Called where a person picks, never on a selection change as such: adding
 * music selects the new clip, and that must not stop a preview the person is
 * listening to (§10, the transport belongs to the user).
 */
export function useHoldStill(): () => void {
  const clock = useContext(ClockContext);
  return () => { if (clock?.playing === true) clock.pause(); };
}
