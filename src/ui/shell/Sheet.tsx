import { useRef, type ReactNode } from 'react';
import { useDialogFocus } from './useDialogFocus';

/**
 * A panel that becomes a bottom sheet on small screens (§13).
 *
 * The same children either way: the inspector and the library are the same
 * components at every size, and forking them into a phone version and a
 * desktop version would be two things to keep in step for the rest of the
 * project's life. Only the box they sit in changes.
 *
 * Height is capped rather than full: seeing a slice of the artboard behind the
 * sheet is what tells you the control you are dragging is doing something.
 */
export function Sheet({
  open,
  title,
  onClose,
  side,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  /** Which edge it slides from on a tablet, before it becomes a sheet. */
  side: 'left' | 'right';
  children: ReactNode;
}): React.JSX.Element | null {
  // Focus goes in, goes round inside, Escape closes, and focus comes back (D-169).
  const dialogBox = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogBox, { onEscape: onClose, active: open });
  if (!open) return null;

  return (
    <div
      ref={dialogBox}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-sheet={side}
      className="fixed inset-0 z-40 flex flex-col justify-end"
      style={{ background: 'rgb(0 0 0 / 0.35)' }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div
        className="flex max-h-[72%] min-h-0 flex-col rounded-t-xl border-t border-edge bg-panel"
        style={{ boxShadow: 'var(--shadow-lg)' }}
      >
        <div className="flex items-center gap-2 border-b border-edge px-3 py-2">
          {/* The grab bar people expect at the top of a sheet, even though this
              one is closed by the button rather than by dragging. */}
          <span aria-hidden className="mx-auto h-1 w-9 rounded-full" style={{ background: 'var(--c-edge-strong)' }} />
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title.toLowerCase()}`}
            className="absolute right-3 min-h-11 rounded-md px-3 text-[12px] font-medium hover:bg-panel-alt"
          >
            {/* Close, not Done: it closes the sheet and leaves the selection as it is (D-169). */}
            Close
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
