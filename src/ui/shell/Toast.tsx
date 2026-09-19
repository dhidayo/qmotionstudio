import { useEffect } from 'react';

/**
 * Minimal transient notice — §13's "saves automatically" is the first user.
 *
 * The fade is a CSS animation keyed on the message rather than React state:
 * re-keying restarts the animation, so a second toast of the same text still
 * plays, and there is no state to synchronise with an effect.
 */
export function Toast({ message, onDone }: { message: string | null; onDone: () => void }): React.JSX.Element | null {
  useEffect(() => {
    if (message === null) return;
    const clear = setTimeout(onDone, 2500);
    return () => { clearTimeout(clear); };
  }, [message, onDone]);

  if (message === null) return null;

  return (
    <div
      key={message}
      role="status"
      className="toast pointer-events-none fixed bottom-16 left-1/2 z-50 -translate-x-1/2 rounded-md px-3 py-1.5 text-[12px]"
      style={{
        background: 'var(--c-panel)',
        border: '1px solid var(--c-edge)',
        color: 'var(--c-ink-muted)',
        boxShadow: 'var(--shadow-lg)',
      }}
    >
      {message}
    </div>
  );
}
