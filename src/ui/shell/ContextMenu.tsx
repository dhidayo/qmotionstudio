import { useEffect, useLayoutEffect, useRef } from 'react';
import { useOverlays, type MenuItem } from './overlays';

/**
 * The right-click menu — and the long-press menu on a touch screen (D-104).
 *
 * "Provide me a very easy and user friendly way" to act on what is on the
 * timeline: a menu at the pointer listing what can be done to the thing under
 * it, so nothing has to be hunted for in a panel. The same menu opens from a
 * right-click, a long press, and the "⋯" button on a selected clip — three
 * ways in, for a mouse, a finger and a keyboard.
 *
 * Positioned in the window, clamped inside it, and closed by anything that
 * means "never mind": a click elsewhere, Escape, a scroll or a resize.
 */
export function ContextMenu(): React.JSX.Element | null {
  const menu = useOverlays((s) => s.menu);
  const close = useOverlays((s) => s.closeMenu);
  const ref = useRef<HTMLDivElement | null>(null);
  /**
   * When it opened. Lifting the finger after a long press makes the browser
   * send a click to whatever is now under it — which is the menu, opened right
   * there — and that click chose the first item before anyone had read it.
   * Pointer clicks in the first moments after opening are ignored; keyboard
   * activation (a click with no pointer behind it) never is.
   */
  const openedAt = useRef(0);
  /** Whether a finger (or pen) was the last thing to press — only then is there a lift to ignore. */
  const lastPointer = useRef<string>('mouse');
  const openedByTouch = useRef(false);

  useEffect(() => {
    const note = (event: PointerEvent): void => { lastPointer.current = event.pointerType; };
    window.addEventListener('pointerdown', note, true);
    return () => { window.removeEventListener('pointerdown', note, true); };
  }, []);

  // Measured once it is in the page, then nudged inside the window before it
  // is shown — so a menu opened near an edge never hangs off it.
  useLayoutEffect(() => {
    const node = ref.current;
    if (!menu || !node) return;
    const box = node.getBoundingClientRect();
    node.style.left = `${Math.max(8, Math.min(menu.x, window.innerWidth - box.width - 8))}px`;
    node.style.top = `${Math.max(8, Math.min(menu.y, window.innerHeight - box.height - 8))}px`;
    node.style.visibility = 'visible';
    openedAt.current = performance.now();
    openedByTouch.current = lastPointer.current !== 'mouse';
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const first = ref.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not([disabled])');
    first?.focus();

    const onPointer = (event: PointerEvent): void => {
      if (ref.current && event.target instanceof Node && ref.current.contains(event.target)) return;
      close();
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') { event.preventDefault(); close(); return; }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      event.preventDefault();
      const items = [...(ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? [])];
      const at = items.findIndex((item) => item === document.activeElement);
      const next = items[(at + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % Math.max(1, items.length)];
      next?.focus();
    };
    const onDismiss = (): void => { close(); };
    // Captured, so a click that opens something else still closes this first.
    window.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onDismiss);
    window.addEventListener('blur', onDismiss);
    return () => {
      window.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onDismiss);
      window.removeEventListener('blur', onDismiss);
    };
  }, [menu, close]);

  if (!menu) return null;

  const run = (event: React.MouseEvent, item: Extract<MenuItem, { onSelect: () => void }>): void => {
    if (openedByTouch.current && event.detail > 0 && event.timeStamp - openedAt.current < GHOST_CLICK_MS) return;
    close();
    item.onSelect();
  };

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={menu.title}
      data-context-menu
      className="fixed z-[60] w-60 rounded-lg border border-edge bg-panel py-1 shadow-xl"
      style={{ left: menu.x, top: menu.y, visibility: 'hidden' }}
      onContextMenu={(event) => { event.preventDefault(); }}
    >
      <div className="truncate px-3 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
        {menu.title}
      </div>
      {menu.items.map((item, i) =>
        item.kind === 'separator' ? (
          <div key={`sep-${i}`} role="separator" className="my-1 border-t border-edge" />
        ) : (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={(event) => { run(event, item); }}
            className="flex w-full items-baseline justify-between gap-3 px-3 py-1.5 text-left text-[12px] hover:bg-panel-alt focus:bg-panel-alt focus:outline-none disabled:opacity-40"
            style={item.danger === true ? { color: 'var(--c-danger)' } : undefined}
          >
            <span className="truncate">{item.label}</span>
            {item.hint !== undefined && <span className="shrink-0 text-[10px] text-ink-faint">{item.hint}</span>}
          </button>
        ),
      )}
    </div>
  );
}

/** How long after opening a pointer click is taken to be the finger lifting, not a choice. */
const GHOST_CLICK_MS = 450;

/** The delay before a held finger counts as a long press, and how far it may wander. */
const LONG_PRESS_MS = 480;
const LONG_PRESS_SLOP_PX = 8;

/**
 * Long press, for touch screens: the right-click a finger does not have.
 *
 * Only touch and pen start one — a mouse has its own button for this, and a
 * held mouse button is a drag. Moving the finger more than a few pixels is a
 * drag too, and cancels it.
 */
export class LongPress {
  #timer: ReturnType<typeof setTimeout> | null = null;
  #x = 0;
  #y = 0;
  fired = false;

  start(event: React.PointerEvent, onFire: (x: number, y: number) => void): void {
    this.cancel();
    this.fired = false;
    if (event.pointerType === 'mouse') return;
    this.#x = event.clientX;
    this.#y = event.clientY;
    this.#timer = setTimeout(() => {
      this.#timer = null;
      this.fired = true;
      onFire(this.#x, this.#y);
    }, LONG_PRESS_MS);
  }

  move(event: React.PointerEvent): void {
    if (this.#timer === null) return;
    if (Math.hypot(event.clientX - this.#x, event.clientY - this.#y) > LONG_PRESS_SLOP_PX) this.cancel();
  }

  cancel(): void {
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#timer = null;
  }
}
