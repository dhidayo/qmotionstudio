import * as actions from '@/document/actions';
import { isAnimated, poseIndexAt, posesOf } from '@/document/select/overlay';
import type { Overlay } from '@/document/types';
import { useEditor } from '@/state/store';
import { usePreviewClock } from '@/ui/shell/ClockProvider';
import { Button, EmptyNote, Section, Segmented, Toggle } from './controls';

/**
 * The keyframe editor for one overlay (§6.1, made reachable).
 *
 * Its own component and its own section, titled with the word people are
 * actually looking for. The first version hid all of this behind a switch
 * called "Animate movement" and only said "keyframe" once that switch was on,
 * which meant someone hunting for keyframes found nothing at all — reported
 * exactly that way.
 *
 * Two things are on show whether or not anything is animated: what a keyframe
 * is for, and the two buttons that make the common case — move from here to
 * there across the clip — a pair of clicks rather than a technique.
 */

/** Keyframes inside this of an end count as being *at* it. */
const EDGE_MS = 120;

export function Keyframes({ overlay }: { overlay: Overlay }): React.JSX.Element {
  const dispatch = useEditor((s) => s.dispatch);
  const playheadMs = useEditor((s) => s.playheadMs);
  const clock = usePreviewClock();
  const setPlayhead = useEditor((s) => s.setPlayhead);

  const { id } = overlay;
  const spanMs = Math.max(1, overlay.endMs - overlay.startMs);
  /*
   * The last moment the overlay is actually drawn.
   *
   * A layer's time range is half-open — `activeOverlaysAt` takes
   * `timeMs < endMs` — so the exact end is the first instant the overlay is
   * *gone*. Sending the playhead there for "Set end" put it on a frame with
   * nothing on it: the keyframe was real and there was no object to drag.
   */
  const lastMs = Math.max(0, spanMs - 1);

  /*
   * Keyframe times are in the overlay's own time, like every other layer time
   * in §6.1 — so a clip dragged along the timeline takes its motion with it
   * rather than having it reinterpreted against the project clock.
   */
  const localMs = Math.round(playheadMs - overlay.startMs);
  const animated = isAnimated(overlay);
  const poses = posesOf(overlay);
  const withinClip = localMs >= 0 && localMs <= spanMs;
  const atIndex = poseIndexAt(overlay, localMs, actions.POSE_TOLERANCE_MS);

  /**
   * Moves the playhead to a moment in the overlay's own time.
   *
   * Publishes it as well as seeking, for the same reason a scrub does
   * (D-064): everything that *acts* on the playhead reads the published value,
   * which the readout only refreshes at 20Hz. Leaving that to catch up meant a
   * drag straight after "Set end" wrote its keyframe at the time the playhead
   * used to be — usually the start — so the two ends of the motion quietly
   * became the same pose.
   */
  const goTo = (atMs: number): void => {
    const at = overlay.startMs + atMs;
    clock?.pause();
    clock?.seek(at);
    setPlayhead(at);
  };

  const hasStart = poses.some((pose) => pose.atMs <= EDGE_MS);
  const hasEnd = poses.some((pose) => pose.atMs >= lastMs - EDGE_MS);

  return (
    <Section title="Keyframes">
      <Toggle
        checked={animated}
        onChange={(on) => { dispatch(actions.setOverlayAnimated(id, on, localMs)); }}
        label="Use keyframes"
      />

      {!animated && (
        <EmptyNote>
          A keyframe records where this overlay is at one moment. Give it two and it travels
          between them. Turn this on, then set a start and an end below.
        </EmptyNote>
      )}

      {animated && (
        <>
          {/*
            * Start and end as named buttons.
            *
            * "Move the playhead and drag" is the general mechanism and it is
            * not what someone asks for first — they ask to say where a thing
            * begins and where it ends. Each button goes to that moment *and*
            * puts a keyframe there, so the artboard is showing the frame being
            * defined rather than leaving the user to check.
            */}
          <div className="mt-2 flex gap-1.5">
            <Button
              onClick={() => { goTo(0); dispatch(actions.setOverlayPose(id, 0, {})); }}
            >
              {hasStart ? 'Go to start' : 'Set start'}
            </Button>
            <Button
              onClick={() => { goTo(lastMs); dispatch(actions.setOverlayPose(id, lastMs, {})); }}
            >
              {hasEnd ? 'Go to end' : 'Set end'}
            </Button>
          </div>

          <EmptyNote>
            With a start and an end set, move the overlay while the playhead sits on one of
            them. Anywhere else, dragging adds a keyframe of its own.
          </EmptyNote>

          {/*
            * The list, with times.
            *
            * Small diamonds on a timeline clip say *that* there are keyframes;
            * this says when, which is the thing you need while deciding
            * whether the motion is too fast.
            */}
          <p className="mt-2.5 mb-1 text-[10px] uppercase tracking-wide text-ink-faint">
            {poses.length === 1 ? '1 keyframe' : `${poses.length} keyframes`}
          </p>
          <div className="flex flex-wrap gap-1">
            {poses.map((pose, index) => (
              <span key={pose.atMs} className="flex items-center">
                <button
                  type="button"
                  data-keyframe-chip={Math.round(pose.atMs)}
                  aria-current={index === atIndex}
                  onClick={() => { goTo(pose.atMs); }}
                  title={`Go to ${seconds(pose.atMs)}`}
                  className="tabular rounded-l-sm border px-1.5 py-0.5 text-[10px]"
                  style={
                    index === atIndex
                      ? { borderColor: 'var(--c-accent)', background: 'var(--c-accent-soft)', color: 'var(--c-accent)' }
                      : { borderColor: 'var(--c-edge-strong)', color: 'var(--c-ink-muted)' }
                  }
                >
                  {seconds(pose.atMs)}
                </button>
                <button
                  type="button"
                  aria-label={`Remove the keyframe at ${seconds(pose.atMs)}`}
                  onClick={() => { dispatch(actions.removeOverlayPose(id, pose.atMs)); }}
                  className="rounded-r-sm border border-l-0 px-1 py-0.5 text-[10px] hover:bg-panel-alt"
                  style={{ borderColor: 'var(--c-edge-strong)', color: 'var(--c-ink-faint)' }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>

          <div className="mt-2 flex gap-1.5">
            <Button
              onClick={() => { dispatch(actions.setOverlayPose(id, localMs, {})); }}
              disabled={atIndex >= 0 || !withinClip}
            >
              Add at playhead
            </Button>
          </div>

          {!withinClip && (
            <EmptyNote>The playhead is outside this clip, so there is nothing to key there.</EmptyNote>
          )}

          {/*
            * One easing for the whole overlay, not one per keyframe. A curve
            * editor is the point where a motion tool starts needing to be
            * taught, and three named choices cover what anyone reaches for.
            */}
          <div className="mt-2.5">
            <Segmented
              value={overlay.easing ?? 'smooth'}
              options={[
                { value: 'smooth' as const, label: 'Smooth' },
                { value: 'linear' as const, label: 'Even' },
                { value: 'springy' as const, label: 'Springy' },
              ]}
              onChange={(easing) => { dispatch(actions.setOverlayEasing(id, easing)); }}
              label="Between keyframes"
              columns={3}
            />
          </div>
        </>
      )}
    </Section>
  );
}

/** 1.5s rather than 1500ms: a keyframe is a moment, not a measurement. */
function seconds(ms: number): string {
  return `${(Math.max(0, ms) / 1000).toFixed(1)}s`;
}
