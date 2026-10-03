import { useEffect } from 'react';
import { useEditor } from '@/state/store';

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

export function Toast(): React.JSX.Element | null {
  const toast = useEditor((s) => s.toast);
  const clear = useEditor((s) => s.clearToast);

  useEffect(() => {
    if (toast === null) return;
    const timer = setTimeout(clear, SHOWN_MS);
    return () => { clearTimeout(timer); };
  }, [toast, clear]);

  if (toast === null) return null;

  return (
    <div
      key={toast.id}
      role="status"
      data-toast
      className="toast pointer-events-none fixed bottom-16 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-md px-3 py-2 text-[12px]"
      style={{
        background: 'var(--c-panel)',
        border: '1px solid var(--c-edge)',
        color: 'var(--c-ink)',
        boxShadow: 'var(--shadow-lg)',
      }}
    >
      <span aria-hidden className="size-1.5 rounded-full" style={{ background: 'var(--c-accent)' }} />
      {toast.message}
    </div>
  );
}
