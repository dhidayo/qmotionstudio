import { useEffect } from 'react';
import { useOverlays } from './overlays';

/**
 * Every shortcut, in one place (D-107). Opened with "?" or the keyboard button
 * in the top bar — a shortcut nobody can find is a shortcut nobody uses.
 */

const MOD = typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.userAgent) ? '⌘' : 'Ctrl';

const GROUPS: readonly { title: string; rows: readonly [string, string][] }[] = [
  {
    title: 'On the canvas',
    rows: [
      ['Click', 'Select a photo, text, layer or the logo'],
      ['Double-click', 'Type into text · replace a photo or the logo'],
      ['Enter', 'The same as a double-click, for what is selected'],
      ['Right-click · hold on touch', 'Everything you can do to it'],
      ['Arrow keys', 'Nudge what is selected (⇧ for bigger steps)'],
      [']  /  [', 'Bring to front / send to back'],
      ['Esc', 'Deselect · stop typing without keeping it'],
    ],
  },
  {
    title: 'Anywhere',
    rows: [
      ['Delete · Backspace', 'Delete what is selected'],
      [`${MOD}D`, 'Duplicate what is selected'],
      [`${MOD}Z  /  ${MOD}⇧Z`, 'Undo / redo'],
      ['Space', 'Play / pause'],
      ['← →', 'Step one frame'],
      [`${MOD}E`, 'Export'],
      ['?', 'This list'],
    ],
  },
  {
    title: 'On the timeline',
    rows: [
      ['Drag a clip', 'Move it — up or down to change layer'],
      ['Drag its dotted ends', 'Make it shorter or longer'],
      ['Click a selected clip', 'Move the playhead there'],
      ['Click a layer name', 'Add new elements to that layer'],
      ['⌥ while dragging', 'Turn snapping off'],
    ],
  },
];

export function ShortcutsDialog(): React.JSX.Element | null {
  const open = useOverlays((o) => o.shortcutsOpen);
  const setOpen = useOverlays((o) => o.setShortcutsOpen);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); };
  }, [open, setOpen]);

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      className="fixed inset-0 z-50 grid place-items-center p-4"
      style={{ background: 'rgb(0 0 0 / 0.45)' }}
      onClick={(event) => { if (event.target === event.currentTarget) setOpen(false); }}
    >
      <div className="max-h-[85vh] w-[560px] max-w-full overflow-y-auto rounded-lg border border-edge bg-panel p-4 shadow-lg">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[14px] font-semibold">Shortcuts</h2>
          <button type="button" onClick={() => { setOpen(false); }} className="rounded-md border border-edge px-2 py-1 text-[11px] hover:bg-panel-alt">
            Close
          </button>
        </div>
        {GROUPS.map((group) => (
          <section key={group.title} className="mb-3">
            <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">{group.title}</h3>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              {group.rows.map(([keys, what]) => (
                <div key={keys} className="contents">
                  <dt className="tabular whitespace-nowrap text-[11px] font-semibold">{keys}</dt>
                  <dd className="text-[11px] text-ink-muted">{what}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </div>
  );
}
