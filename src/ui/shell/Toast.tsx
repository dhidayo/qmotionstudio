import { useEffect } from 'react';
import { useEditor } from '@/state/store';
import { useLayout } from './useLayout';

/**
 * The editor's one transient notice: "Saved", "Scene added", and so on.
 *
 * Reads from the store so anything can raise one — the top bar, the scene
 * picker, the project list — and clears itself after a few seconds. Keyed on
 * the toast's id rather than its text, so the same confirmation twice in a row
 * still plays twice; a toast that silently did not reappear would read as the
 * second action having failed.
 *
 * `role="status"` so a screen reader announces it without interrupting.
 */
const SHOWN_MS = 3_000;

/** Longer notices stay up long enough to be read: about a word every 250ms beyond the first few. */
function shownFor(message: string): number {
  return Math.min(9_000, SHOWN_MS + Math.max(0, message.length - 40) * 45);
}

export function Toast(): React.JSX.Element | null {
  const toast = useEditor((s) => s.toast);
  const clear = useEditor((s) => s.clearToast);

  const phone = useLayout() === 'phone';
  useEffect(() => {
    if (toast === null) return;
    const timer = setTimeout(clear, shownFor(toast.message));
    return () => { clearTimeout(timer); };
  }, [toast, clear]);

  if (toast === null) return null;

  return (
    <div
      key={toast.id}
      role="status"
      data-toast
      className="toast pointer-events-none fixed left-1/2 z-[60] flex w-max max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-2 rounded-md px-3 py-2 text-[12px]"
      style={{
        // On a phone, under the top bar: the bottom of the screen is the toolbar.
        ...(phone ? { top: 'calc(env(safe-area-inset-top, 0px) + 60px)' } : { bottom: 64 }),
        animationDuration: `${shownFor(toast.message)}ms`,
        background: 'var(--c-panel)',
        border: '1px solid var(--c-edge)',
        color: 'var(--c-ink)',
        boxShadow: 'var(--shadow-lg)',
      }}
    >
      <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: 'var(--c-accent)' }} />
      {toast.message}
    </div>
  );
}
