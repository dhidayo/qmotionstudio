/**
 * Shown while a part of the interface fetched on first use is still on its
 * way (D-173): a window, a panel, the timeline. Usually never seen — each is
 * fetched once the editor is idle — but on a slow connection a tap answers at
 * once rather than seeming to do nothing.
 *
 * `inline` sits in the space the part will fill; otherwise it floats above
 * the picture, where a window or a sheet is about to open.
 */
export function PartLoading({ inline = false }: { inline?: boolean }): React.JSX.Element {
  if (inline) {
    return (
      <div role="status" data-part-loading className="flex shrink-0 items-center justify-center py-3 text-[12px] text-ink-faint">
        Loading…
      </div>
    );
  }
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center">
      {/* A notice that floats, frosted like the others (D-174). */}
      <div role="status" data-part-loading className="glass ui-toast px-4 py-2 text-[13px] font-medium text-ink-muted">
        Loading…
      </div>
    </div>
  );
}
