import { useEditor } from '@/state/store';
import { useOverlays } from '@/ui/shell/overlays';

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
      className="flex shrink-0 items-center gap-2 border-b border-edge bg-panel px-3"
      style={{ height: 52, paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <button
        type="button"
        onClick={() => { open('project'); }}
        aria-label={`Project: ${name}. Menu`}
        data-phone-project
        className="flex min-w-0 flex-1 items-center gap-2 rounded-lg py-1.5 pr-2 text-left"
      >
        <img src="/brand-q.png" alt="" aria-hidden width={28} height={28} className="size-7 shrink-0 rounded-md" />
        <span className="min-w-0 truncate text-[14px] font-semibold">{name}</span>
        <span aria-hidden className="shrink-0 text-[11px] text-ink-faint">▾</span>
      </button>

      <button
        type="button"
        onClick={() => { open('aspect'); }}
        aria-label={`Frame shape ${aspect}. Change`}
        data-phone-aspect
        className="flex shrink-0 items-center gap-1 rounded-lg border border-edge px-2.5 py-1.5 text-[13px] font-medium tabular"
      >
        {aspect} <span aria-hidden className="text-[10px] text-ink-faint">▾</span>
      </button>

      <button
        type="button"
        onClick={() => { setExporting(true); }}
        className="shrink-0 rounded-lg bg-accent px-3.5 py-1.5 text-[13px] font-semibold text-accent-ink"
      >
        Export
      </button>
    </header>
  );
}
