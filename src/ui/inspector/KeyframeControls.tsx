import type { OverlayEasing } from '@/document/types';
import { Button, EmptyNote, Section, Segmented, Toggle } from './controls';

/**
 * The keyframe editor, for anything that can be keyframed.
 *
 * One component for overlays and for the template's own photos and text,
 * because the two had better look and behave identically — an editor where
 * some things animate and some do not, with nothing saying which, is exactly
 * the confusion this is here to end. It was reported twice: "nothing on the UI
 * says keyframe", from someone looking at a selected photo.
 *
 * Purely presentational. What a keyframe *means* differs between the two — an
 * overlay's pose is its placement, a slot's is an offset from the template's —
 * and that belongs in the callers, not here.
 */

export function KeyframeControls({
  animated,
  times,
  spanMs,
  localMs,
  label,
  explain,
  easing,
  onToggle,
  onAdd,
  onRemove,
  onGoTo,
}: {
  animated: boolean;
  /** Keyframe times in the element's own clock, sorted. */
  times: readonly number[];
  spanMs: number;
  /** Where the playhead is, in that same clock. */
  localMs: number;
  label: string;
  explain: string;
  /** Overlays choose one easing for the whole path; slots follow the template. */
  easing?: { value: OverlayEasing; onChange: (next: OverlayEasing) => void } | undefined;
  onToggle: (on: boolean) => void;
  onAdd: (atMs: number) => void;
  onRemove: (atMs: number) => void;
  onGoTo: (atMs: number) => void;
}): React.JSX.Element {
  const withinClip = localMs >= 0 && localMs <= spanMs;
  const atIndex = times.findIndex((at) => Math.abs(at - localMs) <= 60);

  return (
    <Section title="Keyframes">
      <Toggle checked={animated} onChange={onToggle} label={label} />

      {!animated && <EmptyNote>{explain}</EmptyNote>}

      {animated && (
        <>
          {/*
            * One action: put a keyframe where the playhead is.
            *
            * This replaced a pair of buttons called "Set start" and "Set end",
            * which decided the times themselves — start meant zero and end
            * meant the end of the scene, wherever the playhead happened to be.
            * That is backwards. Moving the playhead *is* how you choose when
            * something happens, and a keyframe is a note about that moment;
            * anything that overrides the choice you just made with the scrubber
            * is going to read as the tool not listening.
            */}
          <div className="mt-2 flex gap-1.5">
            <Button
              onClick={() => { onAdd(localMs); }}
              disabled={atIndex >= 0 || !withinClip}
            >
              Add keyframe here
            </Button>
            <Button
              variant="danger"
              onClick={() => { onRemove(localMs); }}
              disabled={atIndex < 0}
            >
              Remove
            </Button>
          </div>

          <EmptyNote>
            {times.length === 0
              ? 'Move the playhead to where you want the motion to begin, then add a keyframe.'
              : times.length === 1
                ? 'One so far. Move the playhead to where the motion should end, drag the element '
                  + 'there, and a second keyframe is made for you.'
                : 'Drag the element while the playhead sits on a keyframe to change it. Anywhere '
                  + 'else, dragging adds a new one.'}
          </EmptyNote>

          <p className="mt-2.5 mb-1 text-[10px] uppercase tracking-wide text-ink-faint">
            {times.length === 1 ? '1 keyframe' : `${times.length} keyframes`}
          </p>
          <div className="flex flex-wrap gap-1">
            {times.map((at, index) => (
              <span key={at} className="flex items-center">
                <button
                  type="button"
                  data-keyframe-chip={Math.round(at)}
                  aria-current={index === atIndex}
                  onClick={() => { onGoTo(at); }}
                  title={`Go to ${seconds(at)}`}
                  className="tabular rounded-l-sm border px-1.5 py-0.5 text-[10px]"
                  style={
                    index === atIndex
                      ? { borderColor: 'var(--c-accent)', background: 'var(--c-accent-soft)', color: 'var(--c-accent)' }
                      : { borderColor: 'var(--c-edge-strong)', color: 'var(--c-ink-muted)' }
                  }
                >
                  {seconds(at)}
                </button>
                <button
                  type="button"
                  aria-label={`Remove the keyframe at ${seconds(at)}`}
                  onClick={() => { onRemove(at); }}
                  className="rounded-r-sm border border-l-0 px-1 py-0.5 text-[10px] hover:bg-panel-alt"
                  style={{ borderColor: 'var(--c-edge-strong)', color: 'var(--c-ink-faint)' }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>

          {!withinClip && (
            <EmptyNote>The playhead is outside this, so there is nothing to key there.</EmptyNote>
          )}

          {easing && (
            /*
              * One easing for the whole path, not one per keyframe. A curve
              * editor is the point where a motion tool starts needing to be
              * taught, and three named choices cover what anyone reaches for.
              */
            <div className="mt-2.5">
              <Segmented
                value={easing.value}
                options={[
                  { value: 'smooth' as const, label: 'Smooth' },
                  { value: 'linear' as const, label: 'Even' },
                  { value: 'springy' as const, label: 'Springy' },
                ]}
                onChange={easing.onChange}
                label="Between keyframes"
                columns={3}
              />
            </div>
          )}
        </>
      )}
    </Section>
  );
}

/** 1.5s rather than 1500ms: a keyframe is a moment, not a measurement. */
function seconds(ms: number): string {
  return `${(Math.max(0, ms) / 1000).toFixed(1)}s`;
}
