import { useEffect, useLayoutEffect, useState } from 'react';
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

/*
 * Where a notice sits (D-176): centred at the foot of the stage — the area
 * round the picture that each layout marks `data-toast-anchor` — so it never
 * covers a control. On a computer it used to sit 64px from the bottom of the
 * window, over the row of + buttons it was confirming; on a phone under the
 * top bar, over the purpose chips. When a sheet or window is open over the
 * stage's foot, it sits just above that panel, or below it when there is no
 * room above (a window in the middle of a computer's screen), so it covers
 * neither. Measured as it appears and followed as the window and the stage
 * resize. Without an anchor (a layout still loading) it falls back to just
 * under the top bar.
 */
interface Anchor { readonly centreX: number; readonly bottom: number; readonly width: number }

const GAP_PX = 12;
/** Room a notice needs: its own height and a gap either side. */
const ROOM_PX = 56;

function placeNotice(stage: HTMLElement): Anchor {
  const box = stage.getBoundingClientRect();
  const height = window.innerHeight;
  const place = { centreX: box.left + box.width / 2, bottom: height - box.bottom + GAP_PX, width: box.width };
  // The topmost open sheet or window, if its panel covers the stage's foot.
  const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]');
  const panel = dialogs[dialogs.length - 1]?.firstElementChild;
  if (panel instanceof HTMLElement) {
    const p = panel.getBoundingClientRect();
    if (p.width > 0 && p.top < box.bottom - GAP_PX && p.bottom > box.bottom - ROOM_PX) {
      const centreX = p.left + p.width / 2;
      if (p.top >= ROOM_PX + GAP_PX) return { centreX, bottom: height - p.top + GAP_PX, width: p.width };
      if (height - p.bottom >= ROOM_PX) return { centreX, bottom: GAP_PX, width: p.width };
    }
  }
  return place;
}

/** Measured afresh for each notice (`id`), since a sheet may have opened or closed between two. */
function useToastAnchor(id: number | null): Anchor | null {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  useLayoutEffect(() => {
    if (id === null) return undefined;
    const el = document.querySelector<HTMLElement>('[data-toast-anchor]');
    const measure = (): void => {
      if (!el) { setAnchor(null); return; }
      const at = placeNotice(el);
      const next = { centreX: Math.round(at.centreX), bottom: Math.round(at.bottom), width: Math.round(at.width) };
      setAnchor((now) => (now?.centreX === next.centreX && now.bottom === next.bottom && now.width === next.width ? now : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (el) observer.observe(el);
    window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, [id]);
  return anchor;
}

export function Toast(): React.JSX.Element | null {
  const toast = useEditor((s) => s.toast);
  const clear = useEditor((s) => s.clearToast);

  const phone = useLayout() === 'phone';
  const anchor = useToastAnchor(toast?.id ?? null);
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
      className={`${lasting ? 'toast-stay pointer-events-auto max-w-[min(560px,calc(100vw-32px))] rounded-lg py-1.5 pl-3.5 pr-1.5' : 'toast pointer-events-none max-w-[calc(100vw-32px)] px-4 py-2'} glass ui-toast fixed left-1/2 z-[60] flex w-max items-center gap-2.5 text-[12.5px] font-medium`}
      style={{
        ...(anchor !== null
          // Kept inside the stage, so a long notice never reaches the panels either side.
          ? { left: anchor.centreX, bottom: anchor.bottom, maxWidth: `min(${lasting ? '560px' : '100vw'}, ${anchor.width - 2 * GAP_PX}px)` }
          : { top: phone ? 'calc(env(safe-area-inset-top, 0px) + 60px)' : 'calc(var(--h-topbar) + 8px)' }),
        ...(lasting ? {} : { animationDuration: `${shownFor(toast.message)}ms` }),
      }}
    >
      {/* Ink, or danger when urgent: a notice is not the screen's main action (D-176). */}
      <span aria-hidden className={`size-2 shrink-0 rounded-full ${toast.urgent === true ? 'bg-danger' : 'bg-ink-muted'}`} />
      <span className={lasting ? 'min-w-0 leading-snug' : undefined}>{toast.message}</span>
      {toast.action !== undefined && (
        <button
          type="button"
          className="ui-btn ui-btn--primary ui-btn--sm shrink-0 text-[12px]"
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
          className="ui-iconbtn shrink-0 rounded-full text-[15px]"
          style={phone ? { width: 44, height: 44 } : { width: 24, height: 24 }}
          onClick={clear}
        >
          <span aria-hidden>×</span>
        </button>
      )}
    </div>
  );
}
