import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * A panel that rises from the bottom of a phone screen (D-109).
 *
 * Every phone panel is one of these, so they all close the same three ways: the
 * ✕, a tap on the dimmed picture above, or a swipe down on the grab bar. The
 * picture stays partly visible behind it, which is what tells you a control
 * you are moving is doing something.
 */
export function BottomSheet({
  title,
  onClose,
  children,
  tall = false,
  action,
  label,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Nearly full height, for lists to browse (designs, effects, photos). */
  tall?: boolean;
  /** One button beside the title — "Upload a photo", say. */
  action?: ReactNode;
  /** The dialog's accessible name, when it should differ from the title. */
  label?: string;
}): React.JSX.Element {
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label ?? title}
      data-bottom-sheet
      className="fixed inset-0 z-50 flex flex-col justify-end"
      style={{ background: 'rgb(0 0 0 / 0.32)' }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div
        className="flex min-h-0 flex-col rounded-t-2xl bg-panel"
        style={{
          maxHeight: tall ? '88dvh' : '62dvh',
          boxShadow: '0 -8px 30px rgb(0 0 0 / 0.18)',
          transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
          transition: dragging ? 'none' : 'transform 160ms ease-out',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <div
          className="touch-none select-none px-4 pb-2 pt-2"
          onPointerDown={(event) => {
            start.current = event.clientY;
            setDragging(true);
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (start.current === null) return;
            setDragY(Math.max(0, event.clientY - start.current));
          }}
          onPointerUp={() => {
            const pulled = dragY;
            start.current = null;
            setDragging(false);
            setDragY(0);
            if (pulled > 90) onClose();
          }}
          onPointerCancel={() => { start.current = null; setDragging(false); setDragY(0); }}
        >
          <span aria-hidden className="mx-auto mb-2 block h-1.5 w-10 rounded-full" style={{ background: 'var(--c-edge-strong)' }} />
          <div className="flex items-center gap-2">
            <h2 className="min-w-0 flex-1 truncate text-[15px] font-semibold">{title}</h2>
            {action}
            <button
              type="button"
              onClick={onClose}
              onPointerDown={(event) => { event.stopPropagation(); }}
              aria-label={`Close ${title.toLowerCase()}`}
              className="grid size-9 place-items-center rounded-full text-[18px] leading-none text-ink-muted hover:bg-panel-alt"
              style={{ background: 'var(--c-panel-alt)' }}
            >
              ✕
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4">{children}</div>
      </div>
    </div>
  );
}
