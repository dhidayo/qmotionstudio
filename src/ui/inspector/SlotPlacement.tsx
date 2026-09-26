import * as actions from '@/document/actions';
import { useEditor } from '@/state/store';
import { Button, EmptyNote, Section } from './controls';

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
 * Renders nothing at all until the element has actually been moved, so the
 * panels stay as short as they were for anyone not using this.
 */
export function SlotPlacement({ slotKey }: { slotKey: string }): React.JSX.Element | null {
  const dispatch = useEditor((s) => s.dispatch);
  const transform = useEditor(
    (s) => s.project.scenes[s.selectedScene]?.inputs.slotTransforms[slotKey],
  );

  if (!transform) return null;

  const moved = transform.offsetX !== 0 || transform.offsetY !== 0;
  const resized = transform.scale !== 1;
  const turned = transform.rotation !== 0;

  return (
    <Section title="Placement">
      <EmptyNote>
        {[
          moved ? 'Moved' : null,
          resized ? `resized to ${Math.round(transform.scale * 100)}%` : null,
          turned ? `turned ${Math.round(transform.rotation)}°` : null,
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
  );
}

/** The same, for every element in the scene at once. */
export function SceneLayoutReset(): React.JSX.Element | null {
  const dispatch = useEditor((s) => s.dispatch);
  const count = useEditor(
    (s) => Object.keys(s.project.scenes[s.selectedScene]?.inputs.slotTransforms ?? {}).length,
  );

  if (count === 0) return null;

  return (
    <Section title="Layout">
      <EmptyNote>
        {count === 1 ? 'One element has' : `${count} elements have`} been moved from the
        template&rsquo;s layout.
      </EmptyNote>
      <div className="mt-2 flex gap-1.5">
        <Button onClick={() => { dispatch(actions.resetSceneLayout()); }}>
          Reset the whole layout
        </Button>
      </div>
    </Section>
  );
}
