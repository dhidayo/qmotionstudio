import { useRef } from 'react';
import type { MotionSpan } from '@/document/select/motion';
import { capturePointer } from './pointerCapture';
import { msToPct, pxToMs } from './timelineGeometry';

/**
 * An element's motion, as a bar you can drag and stretch.
 *
 * This is the part that was missing. Motion was a list of times in a panel,
 * and a list of times is not where anyone looks to answer "how long does this
 * take and when does it happen" — the timeline is, because that is what a
 * timeline is *for*. Reported plainly: "can't I have them on the timeline like
 * other products have them".
 *
 * The body moves the whole motion, the ends change its length, and the times
 * are shown on the bar so the answer is readable without dragging anything.
 */

type Change = { move: number } | { edge: 'start' | 'end'; toMs: number };

export function MotionBar({
  span,
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
  originMs: number;
  scale: number;
  laneMs: number;
  onChange: (change: Change) => void;
  onCommit: () => void;
  onSeek: (atMs: number) => void;
}): React.JSX.Element {
  const drag = useRef<{ mode: 'move' | 'start' | 'end'; fromMs: number } | null>(null);

  // The element's own clock to the project's, so a scene played at half speed
  // shows its motion over twice as much timeline.
  const toProject = (atMs: number): number => originMs + atMs * scale;
  const toLocal = (projectMs: number): number => (projectMs - originMs) / scale;

  const left = msToPct(toProject(span.startMs), laneMs);
  const right = msToPct(toProject(span.endMs), laneMs);

  const atPointer = (event: React.PointerEvent<HTMLElement>): number => {
    const lane = event.currentTarget.closest('[data-lane]');
    if (!lane) return 0;
    const box = lane.getBoundingClientRect();
    return toLocal(pxToMs(event.clientX - box.left, box.width, laneMs));
  };

  const begin = (event: React.PointerEvent<HTMLElement>, mode: 'move' | 'start' | 'end'): void => {
    event.stopPropagation();
    capturePointer(event.currentTarget, event.pointerId);
    drag.current = { mode, fromMs: atPointer(event) };
  };

  const move = (event: React.PointerEvent<HTMLElement>): void => {
    const current = drag.current;
    if (!current || event.buttons === 0) return;

    const at = atPointer(event);
    if (current.mode === 'move') {
      onChange({ move: at - current.fromMs });
      drag.current = { ...current, fromMs: at };
      return;
    }
    onChange({ edge: current.mode, toMs: at });
  };

  const end = (): void => {
    if (!drag.current) return;
    drag.current = null;
    onCommit();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      data-motion-bar
      aria-label={`Motion, ${seconds(span.endMs - span.startMs)} long. Drag to move it, its ends to change how long it takes.`}
      title={`${seconds(span.startMs)} → ${seconds(span.endMs)}`}
      onPointerDown={(event) => { begin(event, 'move'); }}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onKeyDown={(event) => { if (event.key === 'Enter') onSeek(span.startMs); }}
      className="absolute bottom-0.5 flex h-2 cursor-grab items-center rounded-full border"
      style={{
        left: `${left}%`,
        width: `${Math.max(0.8, right - left)}%`,
        background: 'var(--c-accent-soft)',
        borderColor: 'var(--c-accent)',
      }}
    >
      <Grip side="start" onDown={(event) => { begin(event, 'start'); }} onMove={move} onUp={end} onSeek={() => { onSeek(span.startMs); }} />
      <Grip side="end" onDown={(event) => { begin(event, 'end'); }} onMove={move} onUp={end} onSeek={() => { onSeek(span.endMs); }} />
    </div>
  );
}

/**
 * An end of the bar.
 *
 * Wider than it looks, because a two-pixel target on a timeline is a target
 * nobody hits — and clicking one takes the playhead there, which is the
 * quickest way to get to the moment you are about to change.
 */
function Grip({
  side,
  onDown,
  onMove,
  onUp,
  onSeek,
}: {
  side: 'start' | 'end';
  onDown: (event: React.PointerEvent<HTMLElement>) => void;
  onMove: (event: React.PointerEvent<HTMLElement>) => void;
  onUp: () => void;
  onSeek: () => void;
}): React.JSX.Element {
  return (
    <span
      role="presentation"
      data-motion-grip={side}
      aria-label={side === 'start' ? 'Motion start' : 'Motion end'}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onDoubleClick={onSeek}
      className="absolute -top-1 h-4 w-2.5 cursor-ew-resize rounded-full border"
      style={{
        [side === 'start' ? 'left' : 'right']: -5,
        background: 'var(--c-accent)',
        borderColor: 'var(--c-panel)',
      }}
    />
  );
}

function seconds(ms: number): string {
  return `${(Math.max(0, ms) / 1000).toFixed(1)}s`;
}
