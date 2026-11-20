import * as actions from '@/document/actions';
import { useEditor } from '@/state/store';
import { Button, EmptyNote, Section } from './controls';
import { SlotKeyframes } from './SlotKeyframes';
import { undoHint } from '@/ui/editing/commands';

/**
 * Putting a nudged element back where the template had it (B).
 *
 * This control is what makes dragging template elements safe to offer at all.
 * Letting people move anything is only reasonable if getting back to the
 * designed layout is one click — and because a nudge is stored as an offset
 * from the template's own position rather than as an absolute one, "reset"
 * really is just forgetting it. There is no original position to reconstruct
 * and nothing to get wrong.
 *
 * The reset half renders nothing until the element has actually been moved,
 * so the panels stay as short as they were for anyone not using this. Arrange
 * shows whenever the element is selected, because stacking is something people
 * go looking for rather than discover by accident.
 */
export function SlotPlacement({ slotKey }: { slotKey: string }): React.JSX.Element | null {
  const dispatch = useEditor((s) => s.dispatch);
  const transform = useEditor(
    (s) => s.project.scenes[s.selectedScene]?.inputs.slotTransforms[slotKey],
  );
  const selected = useEditor((s) => s.selectedSlot) === slotKey;

  /*
   * Arrange shows as soon as the element is selected, not only once it has
   * been moved: stacking is a thing people go looking for, and hiding the
   * control until some unrelated edit had happened would be a way of hiding it
   * for good.
   */
  const keyframes = selected ? <SlotKeyframes slotKey={slotKey} /> : null;

  const arrange = selected ? (
    <Section title="Arrange">
      <div className="flex gap-1.5">
        <Button onClick={() => { dispatch(actions.arrangeSlot(slotKey, 'front')); }}>
          Bring to front
        </Button>
        <Button onClick={() => { dispatch(actions.arrangeSlot(slotKey, 'back')); }}>
          Send to back
        </Button>
      </div>
    </Section>
  ) : null;

  if (!transform) {
    return selected ? (
      <>
        {keyframes}
        {arrange}
      </>
    ) : null;
  }

  const moved = transform.offsetX !== 0 || transform.offsetY !== 0;
  const resized = transform.scale !== 1;
  const turned = transform.rotation !== 0;
  const restacked = transform.z !== 0;

  // Only stacking changed, which is not "placement" — nothing to report here.
  if (!moved && !resized && !turned) {
    return restacked ? (
      <>
        {keyframes}
        {arrange}
        <Section title="Placement">
          <EmptyNote>Moved {transform.z > 0 ? 'in front of' : 'behind'} the rest of the scene.</EmptyNote>
          <div className="mt-2 flex gap-1.5">
            <Button onClick={() => { dispatch(actions.resetSlot(slotKey)); }}>
              Reset to template
            </Button>
          </div>
        </Section>
      </>
    ) : (
      <>
        {keyframes}
        {arrange}
      </>
    );
  }

  return (
    <>
    {keyframes}
    {arrange}
    <Section title="Placement">
      <EmptyNote>
        {[
          moved ? 'Moved' : null,
          resized ? `resized to ${Math.round(transform.scale * 100)}%` : null,
          turned ? `turned ${Math.round(transform.rotation)}°` : null,
          restacked ? (transform.z > 0 ? 'brought forward' : 'sent back') : null,
        ]
          .filter((part) => part !== null)
          .join(', ') || 'Adjusted'}
        {' '}from where the template put it.
      </EmptyNote>
      <div className="mt-2 flex gap-1.5">
        <Button onClick={() => { dispatch(actions.resetSlot(slotKey)); }}>
          Reset to template
        </Button>
      </div>
    </Section>
    </>
  );
}

/**
 * The same, for every element in the scene at once — and for the design's
 * own parts too (D-170): a recoloured, re-outlined or deleted part is put
 * back as the design made it in the same undo step, so "reset" means the
 * design as it came. Style's Shapes list keeps "Put every shape back" for
 * bringing back deleted parts alone, colours kept.
 */
export function SceneLayoutReset(): React.JSX.Element | null {
  const dispatch = useEditor((s) => s.dispatch);
  const showToast = useEditor((s) => s.showToast);
  const moved = useEditor(
    (s) => Object.keys(s.project.scenes[s.selectedScene]?.inputs.slotTransforms ?? {}).length,
  );
  const changed = useEditor(
    (s) => Object.keys(s.project.scenes[s.selectedScene]?.inputs.shapeOverrides ?? {}).length,
  );

  if (moved === 0 && changed === 0) return null;

  const elements = moved === 1 ? 'One element has' : `${moved} elements have`;
  const shapes = changed === 1 ? 'shape' : 'shapes';
  const summary =
    changed === 0 ? `${elements} been moved.`
      : moved === 0 ? `${changed === 1 ? 'One shape has' : `${changed} shapes have`} been changed or deleted.`
        : `${elements} been moved, and ${changed === 1 ? 'one' : changed} ${shapes} changed or deleted.`;

  return (
    <Section title="Layout">
      <EmptyNote>
        {summary} Resetting puts every position and shape back as the template made them; your
        words and photos stay.
      </EmptyNote>
      <div className="mt-2 flex gap-1.5">
        <Button
          onClick={() => {
            dispatch(actions.resetSceneLayout());
            showToast(`Layout and shapes reset. ${undoHint()}`);
          }}
        >
          Reset layout and shapes
        </Button>
      </div>
    </Section>
  );
}
