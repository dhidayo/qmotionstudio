import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';
import { useLayout } from '@/ui/shell/useLayout';

/**
 * The tip after switching an image to Video (D-165): where to add scenes.
 *
 * "When I clicked on Video mode, the next thing I see is Add a scene popup;
 * instead, it would be good to see the video mode without that popup since the
 * design will already be scene 1; then, you can have a quick tip on the + Add
 * to tell user to click to add more scenes to the video." So the switch opens
 * nothing; this small note points at the way to add a scene — the toolbar's
 * Add on a phone, the add bar's + Scene on a computer or tablet — and goes by
 * itself after ten seconds, or when tapped or closed. It is shown once per
 * device, like the phone's timing note (D-163), whose look it shares.
 */

const TIP_KEY = 'ms.videoSceneTip';
/** As long as the phone's timing note: long enough to read twice (D-163). */
const TIP_SHOWN_MS = 10_000;
const GAP = 8;
const MARGIN = 12;

const useSceneTip = create<{ open: boolean }>(() => ({ open: false }));

/** Whether the tip is showing: the phone's timing note waits for it, so the two never stack (D-165). */
export const useSceneTipOpen = (): boolean => useSceneTip((s) => s.open);

/** Shows the tip, unless this device has seen it already. */
export function offerSceneTip(): void {
  if (readTipSeen()) return;
  rememberTipSeen();
  useSceneTip.setState({ open: true });
}

/** Where the tip points: the toolbar's Add on a phone, the bar's + Scene elsewhere. */
const ANCHOR = {
  phone: '[data-phone-toolbar="main"] [data-phone-tool="add"]',
  wide: '[data-add-bar] [data-add="scene"]',
} as const;

type Place = { left: number; bottom: number; caret: number };

export function SceneTip(): React.JSX.Element | null {
  const open = useSceneTip((s) => s.open);
  const phone = useLayout() === 'phone';
  const [place, setPlace] = useState<Place | null>(null);
  const close = useCallback(() => { useSceneTip.setState({ open: false }); }, []);

  useEffect(() => {
    if (!open) return undefined;
    const id = setTimeout(close, TIP_SHOWN_MS);
    return () => { clearTimeout(id); };
  }, [open, close]);

  // Above whatever it points at, kept on screen, following it if the page moves.
  useLayoutEffect(() => {
    if (!open) return undefined;
    const selector = phone ? ANCHOR.phone : ANCHOR.wide;
    let frame = 0;
    let scrolled = false;
    const measure = (): void => {
      const anchor = document.querySelector<HTMLElement>(selector);
      if (anchor === null) { setPlace(null); return; }
      // + Scene may be scrolled out of view along the bar: bring it in, once.
      if (!scrolled) { scrolled = true; anchor.scrollIntoView({ block: 'nearest', inline: 'center' }); }
      const rect = anchor.getBoundingClientRect();
      const centre = rect.left + rect.width / 2;
      const width = Math.min(280, innerWidth - MARGIN * 2);
      const left = Math.max(MARGIN, Math.min(innerWidth - MARGIN - width, centre - width / 2));
      setPlace({ left, bottom: innerHeight - rect.top + GAP, caret: centre - left });
    };
    const soon = (): void => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    // After the switch has drawn the video's bar.
    soon();
    addEventListener('resize', soon);
    addEventListener('scroll', soon, true);
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener('resize', soon);
      removeEventListener('scroll', soon, true);
    };
  }, [open, phone]);

  if (!open || place === null) return null;
  const words = phone
    ? <>Your design is scene 1. Tap Add, then <span className="whitespace-nowrap">+ Scene</span>, to add more scenes.</>
    : <>Your design is scene 1. Use <span className="whitespace-nowrap">+ Scene</span> to add more scenes.</>;

  return createPortal(
    <div
      role="note"
      data-scene-tip
      onClick={close}
      className="fixed z-[70] flex items-center gap-1 rounded-lg py-1 pl-2.5 pr-1 text-[12px] leading-snug shadow-md"
      style={{
        left: place.left,
        bottom: place.bottom,
        width: Math.min(280, innerWidth - MARGIN * 2),
        // The soft accent over the panel, so the picture does not show through.
        background: 'linear-gradient(var(--c-accent-soft), var(--c-accent-soft)), var(--c-panel)',
        color: 'var(--c-ink)',
        border: '1px solid var(--c-edge)',
      }}
    >
      <span className="min-w-0 flex-1">{words}</span>
      {/* A quiet ×, as on the phone's timing note (D-163): it goes by itself anyway. */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); close(); }}
        aria-label="Close tip"
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-panel-alt"
      >
        <svg aria-hidden width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
        </svg>
      </button>
      {/* Points down at the button it names. */}
      <span
        aria-hidden
        className="absolute size-2.5 rotate-45"
        style={{
          left: Math.max(10, Math.min(place.caret, Math.min(280, innerWidth - MARGIN * 2) - 10)) - 5,
          bottom: -5,
          background: 'linear-gradient(var(--c-accent-soft), var(--c-accent-soft)), var(--c-panel)',
          borderRight: '1px solid var(--c-edge)',
          borderBottom: '1px solid var(--c-edge)',
        }}
      />
    </div>,
    document.body,
  );
}

function readTipSeen(): boolean {
  try { return localStorage.getItem(TIP_KEY) === '1'; } catch { return false; }
}

function rememberTipSeen(): void {
  try { localStorage.setItem(TIP_KEY, '1'); } catch {
    // A remembered tip is a convenience; seeing it twice changes nothing.
  }
}
