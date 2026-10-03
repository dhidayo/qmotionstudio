import type { OverlayEasing } from '@/document/types';
import { spanOf } from '@/document/select/motion';
import { Button, EmptyNote, Section, Segmented } from './controls';

/**
 * The keyframe editor, for anything that can be keyframed.
 *
 * One component for overlays and for the template's own photos and text,
 * because the two had better look and behave identically — an editor where
 * some things animate and some do not, with nothing saying which, is exactly
 * the confusion this is here to end. It was reported twice: "nothing on the UI
 * says keyframe", from someone looking at a selected photo.
 *
 * Purely presentational, and deliberately thin: the timeline bar is the real
 * control now. What motion *means* differs between the two — an overlay's pose
 * is its placement, a slot's is an offset from the template's — and that
 * belongs in the callers, not here.
 */

export function KeyframeControls({
  animated,
  times,
  spanMs,
  localMs,
  explain,
  easing,
  onToggle,
  onAdd,
  onGoTo,
}: {
  animated: boolean;
  /** Keyframe times in the element's own clock, sorted. */
  times: readonly number[];
  spanMs: number;
  /** Where the playhead is, in that same clock. */
  localMs: number;
  explain: string;
  easing?: { value: OverlayEasing; onChange: (next: OverlayEasing) => void } | undefined;
  onToggle: (on: boolean) => void;
  /** Creates a motion of the default length starting at `atMs`. */
  onAdd: (atMs: number) => void;
  onGoTo: (atMs: number) => void;
}): React.JSX.Element {
  const span = spanOf(times);

  return (
    <Section title="Motion path">
      {!animated && (
        <>
          <EmptyNote>{explain}</EmptyNote>
          <div className="mt-2 flex gap-1.5">
            <Button onClick={() => { onToggle(true); onAdd(localMs); }}>Add motion</Button>
          </div>
        </>
      )}

      {animated && span && (
        <>
          {/*
            * The bar on the timeline is the control. This says what it
            * currently is and gets out of the way — repeating every handle
            * here would be a second place to change the same thing, and the
            * two would disagree the moment one was dragged.
            */}
          <p className="tabular text-[11px] text-ink-muted">
            {seconds(span.startMs)} → {seconds(span.endMs)}
            <span className="text-ink-faint"> · {seconds(span.endMs - span.startMs)} long</span>
          </p>
          <EmptyNote>
            {span.custom
              ? 'A custom path with several points. Drag the bar on the timeline to move the '
                + 'whole thing, or its ends to change how long it takes.'
              : 'Drag the bar on the timeline to move it, or its ends to change how long it '
                + 'takes. Put the playhead at the end and drag the element to say where it '
                + 'finishes.'}
          </EmptyNote>

          <div className="mt-2 flex gap-1.5">
            <Button onClick={() => { onGoTo(span.startMs); }}>Go to start</Button>
            <Button onClick={() => { onGoTo(span.endMs); }}>Go to end</Button>
          </div>

          {easing && (
            /*
              * Named for what the motion looks like. One style for the whole
              * span rather than per point: a curve editor is where a motion
              * tool starts needing to be taught, and these three cover what
              * anyone reaches for.
              */
            <div className="mt-2.5">
              <Segmented
                value={easing.value}
                options={[
                  { value: 'smooth' as const, label: 'Smooth' },
                  { value: 'springy' as const, label: 'Soft bounce' },
                  { value: 'linear' as const, label: 'Steady' },
                ]}
                onChange={easing.onChange}
                label="How it moves"
                columns={3}
              />
            </div>
          )}

          <div className="mt-2.5 flex gap-1.5">
            <Button variant="danger" onClick={() => { onToggle(false); }}>Remove motion</Button>
            <Button
              onClick={() => { onAdd(localMs); }}
              disabled={localMs < 0 || localMs > spanMs}
            >
              Restart here
            </Button>
          </div>
          <EmptyNote>
            “Restart here” throws the current motion away and begins a new one at the playhead.
          </EmptyNote>
        </>
      )}
    </Section>
  );
}

function seconds(ms: number): string {
  return `${(Math.max(0, ms) / 1000).toFixed(1)}s`;
}
