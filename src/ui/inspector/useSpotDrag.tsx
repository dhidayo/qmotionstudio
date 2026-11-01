import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HOLD_MS, pressIntent } from './spotDrag';

/** A photo being moved: where it came from, the spot under it, and where the finger is. */
export type SpotLift = {
  readonly from: number;
  readonly over: number;
  readonly x: number;
  readonly y: number;
  /** The tile's size, and where in it the press began, so it stays under the finger. */
  readonly size: number;
  readonly dx: number;
  readonly dy: number;
};

type Gesture = { readonly end: () => void };

/**
 * Press-and-hold, then drag, to move a photo to another spot (D-165) — with
 * Pointer Events, so a finger, a pen and a mouse all do it (see `spotDrag`).
 *
 * `onMove(from, to)` runs once, on release over another spot: one change, one
 * undo step. A release where it began, or a cancelled gesture — a scroll the
 * browser took over, a second finger, the app losing focus — changes nothing.
 * The tap that follows a drag is swallowed, so dropping a photo does not also
 * choose the spot it was dropped from.
 */
export function useSpotDrag(onMove: (from: number, to: number) => void): {
  lift: SpotLift | null;
  /** Spread onto each spot's outer element. */
  bind: (index: number) => {
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
    onClickCapture: (event: React.MouseEvent) => void;
    onContextMenu: (event: React.MouseEvent) => void;
  };
} {
  const [lift, setLift] = useState<SpotLift | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const justDragged = useRef(false);
  const onMoveRef = useRef(onMove);
  useEffect(() => { onMoveRef.current = onMove; });
  // A panel closed mid-drag leaves no listeners behind.
  useEffect(() => () => { gesture.current?.end(); }, []);

  const start = (index: number, event: React.PointerEvent<HTMLElement>): void => {
    justDragged.current = false;
    if (gesture.current !== null || event.button !== 0 || !event.isPrimary) return;
    // The × on a photo is a button of its own, not a handle.
    if (event.target instanceof Element && event.target.closest('[data-spot-out]') !== null) return;

    const tile = event.currentTarget;
    const rect = tile.getBoundingClientRect();
    const { pointerId, pointerType } = event;
    const origin = { x: event.clientX, y: event.clientY };
    let last = origin;
    let held = false;
    let dragging = false;
    let over = index;

    const show = (): void => {
      setLift({ from: index, over, x: last.x, y: last.y, size: rect.width, dx: origin.x - rect.left, dy: origin.y - rect.top });
    };
    const begin = (): void => {
      dragging = true;
      show();
    };
    const end = (): void => {
      if (timer !== null) clearTimeout(timer);
      removeEventListener('pointermove', onPointerMove);
      removeEventListener('pointerup', onPointerUp);
      removeEventListener('pointercancel', onPointerCancel);
      removeEventListener('blur', end);
      tile.removeEventListener('touchmove', holdStill);
      gesture.current = null;
      setLift(null);
    };

    const timer = pointerType === 'mouse' ? null : setTimeout(() => {
      held = true;
      if (pressIntent(pointerType, 0, held) === 'drag') begin();
    }, HOLD_MS);

    const onPointerMove = (e: PointerEvent): void => {
      if (e.pointerId !== pointerId) return;
      last = { x: e.clientX, y: e.clientY };
      if (!dragging) {
        const intent = pressIntent(pointerType, Math.hypot(last.x - origin.x, last.y - origin.y), held);
        if (intent === 'scroll') { end(); return; }
        if (intent === 'wait') return;
        begin();
      }
      const spot = document.elementFromPoint(last.x, last.y)?.closest<HTMLElement>('[data-spot]');
      const at = spot?.dataset['spot'];
      if (at !== undefined) over = Number(at);
      show();
    };
    const onPointerUp = (e: PointerEvent): void => {
      if (e.pointerId !== pointerId) return;
      const moved = dragging;
      const to = over;
      end();
      if (!moved) return;
      justDragged.current = true;
      if (to !== index) onMoveRef.current(index, to);
    };
    const onPointerCancel = (e: PointerEvent): void => {
      if (e.pointerId === pointerId) end();
    };
    // Once a photo is lifted, the finger moves it rather than scrolling the panel under it.
    const holdStill = (e: TouchEvent): void => {
      if (dragging && e.cancelable) e.preventDefault();
    };

    addEventListener('pointermove', onPointerMove);
    addEventListener('pointerup', onPointerUp);
    addEventListener('pointercancel', onPointerCancel);
    addEventListener('blur', end);
    tile.addEventListener('touchmove', holdStill, { passive: false });
    gesture.current = { end };
  };

  return {
    lift,
    bind: (index) => ({
      onPointerDown: (event) => { start(index, event); },
      onClickCapture: (event) => {
        if (!justDragged.current) return;
        justDragged.current = false;
        event.preventDefault();
        event.stopPropagation();
      },
      // A long press is a drag here, not the phone's menu for the picture.
      onContextMenu: (event) => { event.preventDefault(); },
    }),
  };
}

/** The photo being moved, lifted above the panel and following the finger. */
export function LiftedSpot({ lift, url }: { lift: SpotLift; url: string | null }): React.JSX.Element {
  // In the body, not the panel: a sheet's transform would move a fixed element with it.
  return createPortal(
    <div
      aria-hidden
      data-spot-lifted
      className="pointer-events-none fixed z-[80] overflow-hidden rounded-md border-2"
      style={{
        left: lift.x - lift.dx,
        top: lift.y - lift.dy,
        width: lift.size,
        height: lift.size,
        borderColor: 'var(--c-accent)',
        background: 'var(--c-panel-alt)',
        // Raised a little above the finger, so the outlined spot under it shows.
        transform: 'translateY(-14px) scale(1.06)',
        boxShadow: '0 10px 24px rgb(0 0 0 / 0.35)',
      }}
    >
      {url !== null && <img src={url} alt="" draggable={false} className="size-full object-cover" />}
    </div>,
    document.body,
  );
}
