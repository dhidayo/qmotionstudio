import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useLayout } from './useLayout';

/**
 * A short question with two or three answers (D-168): Welcome back, and
 * Switch to Image mode?.
 *
 * Modal in the full sense, not only in look: focus starts on the first
 * answer, Tab and Shift+Tab go round the window's own buttons and never out
 * behind it, Escape gives the safe answer (`onCancel`), and focus goes back
 * to where it was when the window closes. Labelled by its heading and
 * described by its text, so a screen reader reads the question with it.
 * Larger on a phone, where it is held further away and pressed by a thumb.
 */

export type DialogChoice = {
  readonly label: string;
  readonly onSelect: () => void;
  /** The one filled button; the first choice is focused whichever it is. */
  readonly primary?: boolean;
};

export function ConfirmDialog({ title, children, choices, onCancel, aside, testId }: {
  readonly title: string;
  readonly children: ReactNode;
  readonly choices: readonly DialogChoice[];
  /** Escape, or a click outside: always the answer that changes nothing. */
  readonly onCancel: () => void;
  /** A picture beside the words, such as the design's own still. */
  readonly aside?: ReactNode;
  readonly testId?: string;
}): React.JSX.Element {
  const phone = useLayout() === 'phone';
  const titleId = useId();
  const bodyId = useId();
  const box = useRef<HTMLDivElement>(null);
  const cancel = useRef(onCancel);
  useEffect(() => { cancel.current = onCancel; }, [onCancel]);

  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    box.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const onKey = (event: KeyboardEvent): void => {
      /*
       * No key reaches the editor behind the window: Delete or ⌘Z there would
       * change a design nobody can see. Enter and Space still press the
       * focused button — that is the browser's own default, not a listener.
       */
      event.stopPropagation();
      if (event.key === 'Escape') {
        event.preventDefault();
        cancel.current();
        return;
      }
      if (event.key !== 'Tab' || !box.current) return;
      const buttons = [...box.current.querySelectorAll<HTMLButtonElement>('button:not([disabled])')];
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (!first || !last) return;
      const inside = box.current.contains(document.activeElement);
      if (event.shiftKey && (!inside || document.activeElement === first)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (!inside || document.activeElement === last)) { event.preventDefault(); first.focus(); }
    };
    // Capture on the window, so this runs before any other listener.
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      if (before?.isConnected === true) before.focus();
    };
  }, []);

  const button = phone ? 'min-h-11 px-4 py-2.5 text-[15px]' : 'px-3 py-1.5 text-[13px]';
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgb(0 0 0 / 0.5)' }}
      onClick={(event) => { if (event.target === event.currentTarget) onCancel(); }}
    >
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        data-confirm-dialog={testId}
        className="max-h-[90vh] w-full max-w-[440px] overflow-y-auto rounded-lg border border-edge bg-panel p-4 text-ink shadow-lg sm:p-5"
      >
        <div className="flex items-start gap-3">
          {aside}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className={`font-semibold ${phone ? 'text-[18px]' : 'text-[16px]'}`}>{title}</h2>
            <div id={bodyId} className={`mt-1.5 space-y-1.5 text-ink-muted ${phone ? 'text-[15px]' : 'text-[13px]'}`}>{children}</div>
          </div>
        </div>
        <div className={`mt-4 flex gap-2 ${phone ? 'flex-col' : 'flex-row-reverse flex-wrap'}`}>
          {choices.map((choice) => (
            <button
              key={choice.label}
              type="button"
              onClick={choice.onSelect}
              className={`rounded-md font-medium ${button} ${choice.primary === true ? 'bg-accent font-semibold text-accent-ink hover:bg-accent-hover' : 'border border-edge hover:bg-panel-alt'}`}
            >
              {choice.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
