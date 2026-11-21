import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLayout } from '@/ui/shell/useLayout';
import { useDialogFocus } from '@/ui/shell/useDialogFocus';

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
  closeLabel,
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
  /** The ✕'s accessible name, when "Close …" would not say what it does. */
  closeLabel?: string;
}): React.JSX.Element {
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const phone = useLayout() === 'phone';
  const start = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); };
  }, [onClose]);
  // Focus goes in, goes round inside, and comes back when it closes (D-169).
  const dialogBox = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogBox);

  return (
    <div
      ref={dialogBox}
      role="dialog"
      aria-modal="true"
      aria-label={label ?? title}
      data-bottom-sheet
      /* A sheet from the bottom on a phone; on anything wider, the same panel
         as a window in the middle of the screen (D-116). */
      className={phone ? 'scrim fixed inset-0 z-50 flex flex-col justify-end' : 'scrim fixed inset-0 z-50 flex items-center justify-center p-6'}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div
        // Frosted (D-174): a sheet floats over the picture, a window over the studio.
        className={phone ? 'glass ui-dialog flex min-h-0 flex-col rounded-t-2xl rounded-b-none border-x-0 border-b-0' : 'glass ui-dialog flex min-h-0 w-full flex-col'}
        style={phone ? {
          // Of the screen the sheet covers, not `dvh`: a browser that does not
          // know `dvh` drops the rule, and the sheet then grows past the top
          // of the screen, taking its close button with it.
          maxHeight: tall ? '90%' : '64%',
          transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
          transition: dragging ? 'none' : 'transform var(--t-base) var(--ease-drawer)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        } : {
          maxWidth: tall ? 980 : 560,
          maxHeight: tall ? '88%' : '80%',
        }}
      >
        <div
          className={phone ? 'touch-none select-none px-4 pb-2 pt-2' : 'px-5 pb-3 pt-4'}
          onPointerDown={(event) => {
            if (!phone) return;
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
          {phone && <span aria-hidden className="mx-auto mb-2 block h-1.5 w-10 rounded-full" style={{ background: 'var(--c-edge-strong)' }} />}
          <div className="flex items-center gap-2">
            <h2 className="font-headline min-w-0 flex-1 truncate text-[16px] font-bold">{title}</h2>
            {action}
            <button
              type="button"
              onClick={onClose}
              onPointerDown={(event) => { event.stopPropagation(); }}
              aria-label={closeLabel ?? `Close ${title.toLowerCase()}`}
              // A thumb's 44px on a phone (D-169).
              className={`ui-iconbtn ${phone ? 'size-11' : 'size-9'} shrink-0 rounded-full bg-sunk text-[16px]`}
            >
              ✕
            </button>
          </div>
        </div>
        <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4 ${phone ? 'px-3' : 'px-5'}`}>{children}</div>
      </div>
    </div>
  );
}
