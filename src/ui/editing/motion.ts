import type { PreviewClock } from '@/core/time/clock';
import { useEditor } from '@/state/store';
import { revealTimeline } from '@/ui/timeline/timelineFold';
import { addMotionAction, motionTargetOf, motionWindow } from './motionTarget';

export type AddMotionResult = 'added' | 'exists' | 'none';

/**
 * "+ Motion" (D-153): gives the selected element a motion, from the add bar on
 * a computer or the toolbar on a phone.
 *
 * Added, the preview stops at the motion's end — where the element will
 * finish — so the very next thing the person does, dragging it, sets where it
 * goes. That was the second half of the old lane button's instructions ("then
 * put the playhead at the end and drag it"), and a step people skipped. If it
 * already moves, the playhead goes to the start of its motion instead and the
 * toast says where its timing is changed. Either way the timeline unfolds, so
 * the bar is in view.
 *
 * Nothing that can move selected is not a dead end either: the chip stays
 * pressable and says what to do.
 */
export function addMotionToSelection(clock: PreviewClock | null): AddMotionResult {
  const state = useEditor.getState();
  const target = motionTargetOf(state.project, state);
  if (!target) {
    state.showToast('Select a photo, some text or an element first.');
    return 'none';
  }

  if (!target.has) state.dispatch(addMotionAction(target));
  const span = motionWindow(useEditor.getState().project, target);
  if (span) {
    const at = target.has ? span.startMs : span.endMs;
    clock?.pause();
    clock?.seek(at);
    state.setPlayhead(clock?.timeMs ?? at);
  }
  revealTimeline();
  state.showToast(target.has
    ? 'It already moves. Drag the ends of its motion bar to change when it starts and finishes.'
    : 'Motion added — drag it to where it should finish.');
  return target.has ? 'exists' : 'added';
}
