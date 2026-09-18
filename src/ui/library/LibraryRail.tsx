/** Placeholder. The real library — categories, search, free/pro filter, favourites — is M3. */
export function LibraryRail(): React.JSX.Element {
  return (
    <aside
      className="flex shrink-0 flex-col border-r border-edge bg-panel"
      style={{ width: 'var(--w-library)' }}
      aria-label="Template library"
    >
      <div className="border-b border-edge px-3 py-2.5 text-[12px] font-semibold">Templates</div>
      <div className="grid flex-1 grid-cols-2 content-start gap-2 overflow-y-auto p-3">
        {Array.from({ length: 8 }, (_, i) => (
          <div
            key={i}
            className="aspect-[9/16] rounded-md border border-dashed border-edge-strong"
            style={{ background: 'var(--c-panel-alt)' }}
          />
        ))}
      </div>
      <p className="border-t border-edge px-3 py-2 text-[11px] text-ink-faint">
        Template library arrives at M3.
      </p>
    </aside>
  );
}
