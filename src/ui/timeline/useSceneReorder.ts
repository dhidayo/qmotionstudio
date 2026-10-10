import { useCallback, useRef, useState } from 'react';
import type { SceneSpan } from '@/document/select/timeline';

/**
 * Scenes rearranged by dragging them along the timeline (D-130): "On the
 * timeline, I should be able to move the scenes around to rearrange them.
 * That is a natural behaviour."
 *
 * Press a scene and move sideways past a small threshold and it lifts and
 * follows the pointer; a marker shows where it will land; letting go puts it
 * there as one undoable step. Less than the threshold is still a click, and a
 * finger held still is still the long-press menu. Shared by the computer's
 * timeline and the phone's scene strip.
 */
export type SceneDrag = { readonly from: number; readonly to: number; readonly dx: number; readonly markerMs: number };

/** Where a scene dragged to `ms` lands: after every other scene whose middle it has passed. */
export function dropIndex(spans: readonly SceneSpan[], from: number, ms: number): number {
  return spans.filter((span) => span.index !== from && (span.startMs + span.endMs) / 2 < ms).length;
}

/** The time at which the landing marker sits: the end of the scene it lands after. */
function markerAt(spans: readonly SceneSpan[], from: number, to: number): number {
  const others = spans.filter((span) => span.index !== from);
  return to === 0 ? (others[0]?.startMs ?? 0) : others[to - 1]?.endMs ?? 0;
}

const THRESHOLD_PX = 8;

export function useSceneReorder(options: {
  readonly spans: readonly SceneSpan[];
  /** Pointer x to project time along the lane. */
  readonly msAt: (clientX: number) => number;
  readonly onMove: (from: number, to: number) => void;
  /** Called when a drag begins, so a pending long-press can stand down. */
  readonly onLift?: () => void;
}): {
  drag: SceneDrag | null;
  /** Whether the pointer that just went up was a drag, so its click is not also a click. */
  wasDrag: () => boolean;
  handlers: (index: number) => {
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
    onPointerMove: (event: React.PointerEvent<HTMLElement>) => void;
    onPointerUp: (event: React.PointerEvent<HTMLElement>) => void;
    onPointerCancel: () => void;
  };
} {
  const { spans, msAt, onMove, onLift } = options;
  const [drag, setDragState] = useState<SceneDrag | null>(null);
  // The same, readable from the pointer handlers without waiting for a render.
  const shown = useRef<SceneDrag | null>(null);
  const setDrag = (next: SceneDrag | null): void => { shown.current = next; setDragState(next); };
  const press = useRef<{ index: number; x: number; id: number; lifted: boolean } | null>(null);
  const justDragged = useRef(false);

  const finish = useCallback((commit: boolean): void => {
    const current = press.current;
    const landed = shown.current;
    press.current = null;
    shown.current = null;
    setDragState(null);
    justDragged.current = current?.lifted === true;
    if (commit && current?.lifted === true && landed !== null && landed.to !== landed.from) onMove(landed.from, landed.to);
  }, [onMove]);

  const handlers = useCallback((index: number) => ({
    onPointerDown: (event: React.PointerEvent<HTMLElement>): void => {
      if (event.button !== 0) return;
      press.current = { index, x: event.clientX, id: event.pointerId, lifted: false };
      justDragged.current = false;
    },
    onPointerMove: (event: React.PointerEvent<HTMLElement>): void => {
      const current = press.current;
      if (!current || event.pointerId !== current.id) return;
      const dx = event.clientX - current.x;
      if (!current.lifted) {
        if (Math.abs(dx) < THRESHOLD_PX) return;
        current.lifted = true;
        onLift?.();
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      const to = dropIndex(spans, current.index, msAt(event.clientX));
      setDrag({ from: current.index, to, dx, markerMs: markerAt(spans, current.index, to) });
    },
    onPointerUp: (event: React.PointerEvent<HTMLElement>): void => {
      if (press.current?.id !== event.pointerId) return;
      finish(true);
    },
    onPointerCancel: (): void => { finish(false); },
  }), [spans, msAt, onLift, finish]);

  const wasDrag = useCallback((): boolean => {
    const was = justDragged.current;
    justDragged.current = false;
    return was;
  }, []);

  return { drag, wasDrag, handlers };
}
