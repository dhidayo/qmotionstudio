import { useEffect } from 'react';
import { useOverlays } from './overlays';
import { isApplePlatform, useInputCaps } from './platform';
import { gestureGroups, shortcutGroups } from './shortcuts';
import { useLayout } from './useLayout';

/**
 * Every shortcut, in one place (D-107). Opened with "?" or the keyboard button
 * in the top bar — a shortcut nobody can find is a shortcut nobody uses.
 *
 * Written for the device in hand (D-161): ⌘ ⌥ ⇧ on a Mac, iPhone or iPad,
 * Ctrl, Alt and Shift elsewhere; and on a phone or tablet used by touch
 * alone, the touch gestures instead — the same help, in the device's terms.
 */
export function ShortcutsDialog(): React.JSX.Element | null {
  const open = useOverlays((o) => o.shortcutsOpen);
  const setOpen = useOverlays((o) => o.setShortcutsOpen);
  const caps = useInputCaps();
  const phone = useLayout() === 'phone';

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); };
  }, [open, setOpen]);

  if (!open) return null;
  const groups = caps.keyboard ? shortcutGroups(isApplePlatform(), caps.touchToo) : gestureGroups(phone);
  // Larger on a touch screen, which is held further away; on a phone each
  // gesture sits above what it does, as two columns leave neither room.
  const text = caps.keyboard ? 'text-[11px]' : 'text-[13px]';
  const stacked = !caps.keyboard && phone;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={caps.keyboard ? 'Keyboard shortcuts' : 'Touch gestures'}
      // A flex row, so the window is never wider than the screen it is on.
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgb(0 0 0 / 0.45)' }}
      onClick={(event) => { if (event.target === event.currentTarget) setOpen(false); }}
    >
      <div className="max-h-[85vh] w-full max-w-[560px] overflow-y-auto rounded-lg border border-edge bg-panel p-4 shadow-lg" data-help-window>
        <div className="mb-3 flex items-center justify-between">
          <h2 className={`font-semibold ${caps.keyboard ? 'text-[14px]' : 'text-[16px]'}`}>{caps.keyboard ? 'Shortcuts' : 'Touch gestures'}</h2>
          <button
            type="button"
            onClick={() => { setOpen(false); }}
            className={`rounded-md border border-edge hover:bg-panel-alt ${caps.keyboard ? 'px-2 py-1 text-[11px]' : 'px-3 py-1.5 text-[13px]'}`}
          >
            Close
          </button>
        </div>
        {groups.map((group) => (
          <section key={group.title} className="mb-3">
            <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">{group.title}</h3>
            <dl className={stacked ? 'grid gap-y-2' : `grid grid-cols-[auto_1fr] gap-x-4 ${caps.keyboard ? 'gap-y-1' : 'gap-y-1.5'}`}>
              {group.rows.map(([keys, what]) => (
                <div key={keys} className={stacked ? 'block' : 'contents'}>
                  {/* Not tabular: no figures to line up, and tabular hyphens split "Double-tap" apart. */}
                  <dt className={`font-semibold ${stacked ? '' : 'whitespace-nowrap'} ${text}`}>{keys}</dt>
                  <dd className={`text-ink-muted ${text}`}>{what}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </div>
  );
}
