import { useEffect, useRef, type RefObject } from 'react';

/**
 * Focus for a modal window (D-169), as Welcome back and Switch to Image
 * mode? already had it (D-168): "Accessibility is important to me right now.
 * We need to clean this app up."
 *
 * When the window opens, focus goes into it, unless something in it already
 * took it (a picker's search, on a computer). Tab and Shift+Tab go round the
 * window's own controls and never out to the editor behind it. When it
 * closes, focus goes back to where it was, so a keyboard is not dropped at
 * the top of the page. Escape calls `onEscape`, for windows that do not
 * listen for it themselves.
 *
 * Only the window on top answers: a picker opened over a sheet takes Tab
 * from it, and gives it back when it closes.
 */

const stack: symbol[] = [];

/** What Tab stops on, in the order the page has them. */
const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])', 'select:not([disabled])',
  'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(', ');

function stops(box: HTMLElement): HTMLElement[] {
  return [...box.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0 && !el.closest('[inert]'));
}

export function useDialogFocus(box: RefObject<HTMLElement | null>, { onEscape, active = true }: {
  readonly onEscape?: () => void;
  /** False while the window is not on screen, or is drawn by another (a phone's sheet). */
  readonly active?: boolean;
} = {}): void {
  const escape = useRef(onEscape);
  useEffect(() => { escape.current = onEscape; }, [onEscape]);

  useEffect(() => {
    if (!active) return undefined;
    const me = Symbol('dialog');
    stack.push(me);
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = box.current;
    if (root && !root.contains(document.activeElement)) {
      // The window itself, not its first control: on a phone that would open the keyboard, or press a ✕ by accident.
      if (!root.hasAttribute('tabindex')) root.setAttribute('tabindex', '-1');
      root.focus({ preventScroll: true });
    }

    const onKey = (event: KeyboardEvent): void => {
      if (stack[stack.length - 1] !== me) return;
      const el = box.current;
      if (!el) return;
      if (event.key === 'Escape' && escape.current) {
        event.preventDefault();
        escape.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const all = stops(el);
      const first = all[0];
      const last = all[all.length - 1];
      if (!first || !last) { event.preventDefault(); return; }
      const inside = el.contains(document.activeElement) && document.activeElement !== el;
      if (event.shiftKey && (!inside || document.activeElement === first)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (!inside || document.activeElement === last)) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      const at = stack.indexOf(me);
      if (at >= 0) stack.splice(at, 1);
      // Back where it was, unless the person has already moved it somewhere else.
      const now = document.activeElement;
      const lost = now === null || now === document.body || (root?.contains(now) ?? false);
      if (lost && before?.isConnected === true) before.focus({ preventScroll: true });
    };
  }, [box, active]);
}

/** A window that handles its own keys (ConfirmDialog) still sits on top of the others while it is open. */
export function useDialogLayer(): void {
  useEffect(() => {
    const me = Symbol('dialog');
    stack.push(me);
    return () => {
      const at = stack.indexOf(me);
      if (at >= 0) stack.splice(at, 1);
    };
  }, []);
}
