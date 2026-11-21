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
    if (toast === null || toast.sticky === true) return;
    const timer = setTimeout(clear, shownFor(toast.message));
    return () => { clearTimeout(timer); };
  }, [toast, clear]);

  if (toast === null) return null;

  /*
   * A failure's notice (D-171): it stays until it is acted on or dismissed,
   * takes clicks for its button and ×, and is read out at once. Everything
   * else about it — the place, the look — is the ordinary toast's, so a
   * failure reads as the app talking, not as a different app.
   */
  const lasting = toast.sticky === true || toast.action !== undefined;

  /*
   * Centred by the `toast-in-out` animation's own translate(-50%). A
   * `-translate-x-1/2` here as well moved it half its width again, so a long
   * notice on a phone — "Your 3 photos replaced 3 samples." — started off the
   * left edge of the screen (D-152).
   */
  return (
    <div
      key={toast.id}
      role={toast.urgent === true ? 'alert' : 'status'}
      data-toast
      data-toast-sticky={lasting ? '' : undefined}
      className={`${lasting ? 'toast-stay pointer-events-auto max-w-[min(560px,calc(100vw-32px))]' : 'toast pointer-events-none max-w-[calc(100vw-32px)]'} fixed left-1/2 z-[60] flex w-max items-center gap-2 rounded-md px-3 py-2 text-[12px]`}
      style={{
        // On a phone, under the top bar: the bottom of the screen is the toolbar.
        ...(phone ? { top: 'calc(env(safe-area-inset-top, 0px) + 60px)' } : { bottom: 64 }),
        ...(lasting ? {} : { animationDuration: `${shownFor(toast.message)}ms` }),
        background: 'var(--c-panel)',
        border: '1px solid var(--c-edge)',
        color: 'var(--c-ink)',
        boxShadow: 'var(--shadow-lg)',
      }}
    >
      <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: toast.urgent === true ? 'var(--c-danger)' : 'var(--c-accent)' }} />
      <span className={lasting ? 'min-w-0 leading-snug' : undefined}>{toast.message}</span>
      {toast.action !== undefined && (
        <button
          type="button"
          className="shrink-0 rounded-md bg-accent px-2.5 py-1 text-[12px] font-semibold text-accent-ink"
          style={phone ? { minHeight: 44 } : undefined}
          onClick={() => { const run = toast.action?.run; clear(); run?.(); }}
        >
          {toast.action.label}
        </button>
      )}
      {lasting && (
        <button
          type="button"
          aria-label="Dismiss"
          className="grid shrink-0 place-items-center rounded-md text-ink-muted hover:text-ink"
          style={phone ? { width: 44, height: 44 } : { width: 24, height: 24 }}
          onClick={clear}
        >
          <span aria-hidden>×</span>
        </button>
      )}
    </div>
  );
}
