import { useRef } from 'react';
import type { MotionSpan } from '@/document/select/motion';
import { capturePointer } from './pointerCapture';
import { msToPct, pxToMs } from './timelineGeometry';

/**
 * An element's motion, as a bar on its own lane.
 *
 * Two things were wrong with the first version, and both were reported plainly.
 *
 * It was *nested inside the clip*. The positions are lane percentages, so inside
 * a clip four seconds wide they were percentages of four seconds — the bar came
 * out a few pixels long, in the wrong place, hiding in a corner of the clip it
 * belonged to. "It is too tiny to know that I can move it" was generous.
 *
 * And the ends were two-pixel strips with no shape. A control that can be
 * dragged has to *look* like a control that can be dragged, which for a keyframe
 * means a diamond — the shape every timeline in every editor has used for this
 * for thirty years, and the one people arrive already knowing.
 *
 * So the bar has a lane of its own, full width, with the same time axis as every
 * other row: the body moves the motion, the diamonds at the ends change how long
 * it takes, and a custom path shows a smaller diamond at each point it passes
 * through.
 */

type Change = { move: number } | { edge: 'start' | 'end'; toMs: number };

/** Big enough to hit without aiming. The diamond inside it is 14. */
const GRIP_PX = 24;

export function MotionBar({
  span,
  /** Every pose time in the element's own clock, for the path markers. */
  poseTimes,
  /** Where the element begins on the timeline, in project time. */
  originMs,
  /** Project milliseconds per unit of the element's own clock. */
  scale,
  /** The lane's full span, for converting pixels to time. */
  laneMs,
  onChange,
  onCommit,
  onSeek,
}: {
  span: MotionSpan;
  poseTimes: readonly number[];
  originMs: number;
  scale: number;
  laneMs: number;
  onChange: (change: Change) => void;
  onCommit: () => void;
  onSeek: (atMs: number) => void;
}): React.JSX.Element {
  const drag = useRef<{ mode: 'move' | 'start' | 'end'; fromMs: number; moved: boolean } | null>(null);

  // The element's own clock to the project's, so a scene played at half speed
  // shows its motion over twice as much timeline.
  const toProject = (atMs: number): number => originMs + atMs * scale;
  const toLocal = (projectMs: number): number => (projectMs - originMs) / scale;

  const left = msToPct(toProject(span.startMs), laneMs);
  const right = msToPct(toProject(span.endMs), laneMs);
  const width = Math.max(0.4, right - left);
  const lengthMs = span.endMs - span.startMs;

  const atPointer = (event: React.PointerEvent<HTMLElement>): number => {
    const lane = event.currentTarget.closest('[data-lane]');
    if (!lane) return 0;
    const box = lane.getBoundingClientRect();
    return toLocal(pxToMs(event.clientX - box.left, box.width, laneMs));
  };

  const begin = (event: React.PointerEvent<HTMLElement>, mode: 'move' | 'start' | 'end'): void => {
    event.stopPropagation();
    capturePointer(event.currentTarget, event.pointerId);
    drag.current = { mode, fromMs: atPointer(event), moved: false };
  };

  const move = (event: React.PointerEvent<HTMLElement>): void => {
    const current = drag.current;
    if (!current || event.buttons === 0) return;

    const at = atPointer(event);
    if (current.mode === 'move') {
      onChange({ move: at - current.fromMs });
      drag.current = { ...current, fromMs: at, moved: true };
      return;
    }
    drag.current = { ...current, moved: true };
    onChange({ edge: current.mode, toMs: at });
  };

  const end = (): void => {
    const current = drag.current;
    if (!current) return;
    drag.current = null;
    // A press that never moved is a click, and a click on a time axis is a
    // request to stand there — the same rule the rest of the timeline follows.
    if (!current.moved) {
      onSeek(current.mode === 'end' ? span.endMs : current.mode === 'start' ? span.startMs : current.fromMs);
      return;
    }
    onCommit();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      data-motion-bar
      aria-label={`Motion, ${seconds(lengthMs)} long. Drag to move it, its ends to change how long it takes.`}
      title={`${seconds(span.startMs)} → ${seconds(span.endMs)}`}
      onPointerDown={(event) => { begin(event, 'move'); }}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onKeyDown={(event) => { if (event.key === 'Enter') onSeek(span.startMs); }}
      className="absolute inset-y-1 cursor-grab select-none active:cursor-grabbing"
      style={{ left: `${left}%`, width: `${width}%` }}
    >
      {/* The rail. Inset by half a grip so the diamonds sit over its ends. */}
      <div
        className="pointer-events-none absolute left-0 right-0 top-1/2 h-2 -translate-y-1/2 rounded-full border"
        style={{ background: 'var(--c-accent-soft)', borderColor: 'var(--c-accent)' }}
      />

      {/* How long it takes, on the bar, when there is room to read it. */}
      {width > 7 && (
        <span
          className="tabular pointer-events-none absolute inset-0 flex items-center justify-center text-[9px] font-semibold"
          style={{ color: 'var(--c-accent)' }}
        >
          {seconds(lengthMs)}
        </span>
      )}

      {/*
        * A marker for every point the path passes through.
        *
        * Only for a custom path: on a plain A-to-B the two ends are the whole
        * story and a third diamond in the middle would be inventing one.
        */}
      {span.custom && poseTimes.map((atMs) => {
        if (atMs <= span.startMs || atMs >= span.endMs) return null;
        const within = ((toProject(atMs) - toProject(span.startMs)) / Math.max(1, toProject(span.endMs) - toProject(span.startMs))) * 100;
        return (
          <span
            key={atMs}
            aria-hidden
            className="pointer-events-none absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border"
            style={{ left: `${within}%`, background: 'var(--c-panel)', borderColor: 'var(--c-accent)' }}
          />
        );
      })}

      <Grip side="start" onDown={(event) => { begin(event, 'start'); }} onMove={move} onUp={end} />
      <Grip side="end" onDown={(event) => { begin(event, 'end'); }} onMove={move} onUp={end} />
    </div>
  );
}

/**
 * An end of the bar: a diamond, in a target much larger than it looks.
 *
 * The diamond is the part that says "this is a keyframe and you can move it".
 * The box round it is the part that lets anyone actually hit it — a 14px shape
 * on a timeline is a 14px shape you miss, and missing it drags the whole motion
 * instead, which is the worst possible wrong outcome.
 */
function Grip({
  side,
  onDown,
  onMove,
  onUp,
}: {
  side: 'start' | 'end';
  onDown: (event: React.PointerEvent<HTMLElement>) => void;
  onMove: (event: React.PointerEvent<HTMLElement>) => void;
  onUp: () => void;
}): React.JSX.Element {
  return (
    <span
      role="presentation"
      data-motion-grip={side}
      aria-label={side === 'start' ? 'Motion start' : 'Motion end'}
      title={side === 'start' ? 'Drag to change where the motion starts' : 'Drag to change where it ends'}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      className="absolute inset-y-0 flex cursor-ew-resize items-center justify-center"
      style={{ width: GRIP_PX, [side === 'start' ? 'left' : 'right']: -GRIP_PX / 2 }}
    >
      <span
        aria-hidden
        className="h-3.5 w-3.5 rotate-45 rounded-[2px] border-2 shadow-sm"
        style={{ background: 'var(--c-accent)', borderColor: 'var(--c-panel)' }}
      />
    </span>
  );
}

function seconds(ms: number): string {
  return `${(Math.max(0, ms) / 1000).toFixed(1)}s`;
}
