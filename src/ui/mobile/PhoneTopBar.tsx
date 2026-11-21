import { useEditor } from '@/state/store';
import { useOverlays } from '@/ui/shell/overlays';
import { Icon } from './Icon';

/**
 * The phone's top bar (D-109): one row, nothing hidden off the edge.
 *
 * The desktop bar is twice a phone's width and scrolled sideways, which hid
 * the Export button — "who would know there are some hidden elements on the
 * top-right?" Here there are three things: the project (and its menu), the
 * frame shape, and Export. Everything else moved into the project menu.
 */
export function PhoneTopBar(): React.JSX.Element {
  const name = useEditor((s) => s.project.name);
  const aspect = useEditor((s) => s.project.aspect);
  const setExporting = useEditor((s) => s.setExporting);
  const open = useOverlays((o) => o.openPhonePanel);

  return (
    <header
      // Frosted, like the computer's bar (D-174).
      className="glass-bar flex shrink-0 items-center gap-1.5 border-b pl-1.5 pr-3"
      style={{ height: 52, paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      {/*
        * The menu is the three lines everyone knows as "menu" (D-113). The
        * logo alone was the way in, and "no one will know that the menu icon
        * is the menu".
        */}
      <button
        type="button"
        onClick={() => { open('project'); }}
        aria-label="Menu"
        data-phone-menu
        className="ui-iconbtn size-11 shrink-0 text-ink"
      >
        <Icon name="menu" size={24} />
      </button>
      <button
        type="button"
        onClick={() => { open('project'); }}
        aria-label={`Project: ${name}. Menu`}
        data-phone-project
        className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg pr-1 text-left"
      >
        <img src="/brand-q.png" alt="" aria-hidden width={26} height={26} className="size-[26px] shrink-0 rounded-md" />
        <span className="min-w-0 truncate text-[14px] font-semibold">{name}</span>
      </button>
      <SaveWarning />

      <button
        type="button"
        onClick={() => { open('aspect'); }}
        aria-label={`Frame shape ${aspect}. Change`}
        data-phone-aspect
        // 44px to the finger, around a slimmer pill (D-169).
        className="flex h-11 shrink-0 items-center"
      >
        <span className="ui-chip h-8 gap-1 px-3 text-[13px] font-medium tabular">
          {aspect} <span aria-hidden className="text-[10px] text-ink-faint">▾</span>
        </span>
      </button>

      <button
        type="button"
        onClick={() => { setExporting(true); }}
        data-tour="export"
        className="flex h-11 shrink-0 items-center"
      >
        <span className="ui-btn ui-btn--primary min-h-8 px-4 text-[13px]">Export</span>
      </button>
    </header>
  );
}

/**
 * Said when a save fails, and only then (D-111). The phone has no room for the
 * computer's "Saved" badge, but "your work is not being kept" is the one thing
 * nobody may be left to discover after a reload.
 */
function SaveWarning(): React.JSX.Element | null {
  const state = useEditor((s) => s.saveState);
  if (state !== 'failed') return null;
  return (
    <span
      role="alert"
      data-save-state="failed"
      className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold"
      style={{ background: 'var(--c-pro-soft)', color: 'var(--c-danger)' }}
    >
      Not saved
    </span>
  );
}
