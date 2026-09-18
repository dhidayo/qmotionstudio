import { useEditor, type InspectorTab } from '@/state/store';

const TABS: readonly { id: InspectorTab; label: string }[] = [
  { id: 'photos', label: 'Photos' },
  { id: 'text', label: 'Text' },
  { id: 'logo', label: 'Logo' },
  { id: 'look', label: 'Look' },
];

const MILESTONE: Record<InspectorTab, string> = {
  photos: 'Upload, reorder, frame ratio, size mode and crop arrive at M3 (§8.1).',
  text: 'Per-slot text, font, weight, alignment and style toggles arrive at M3 (§8.2).',
  logo: 'Logo upload, placement and lockup arrive at M3 (§8.3).',
  look: 'Palette, background treatment, grain, vignette and speed arrive at M3 (§8.4).',
};

/** Placeholder. All four panels are built at M3 against the real document actions. */
export function Inspector(): React.JSX.Element {
  const tab = useEditor((s) => s.inspectorTab);
  const setTab = useEditor((s) => s.setInspectorTab);

  return (
    <aside
      className="flex shrink-0 flex-col border-l border-edge bg-panel"
      style={{ width: 'var(--w-inspector)' }}
      aria-label="Inspector"
    >
      <div className="flex border-b border-edge" role="tablist">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => { setTab(id); }}
            className="flex-1 border-b-2 px-2 py-2.5 text-[12px] transition-colors"
            style={{
              borderColor: tab === id ? 'var(--c-accent)' : 'transparent',
              color: tab === id ? 'var(--c-ink)' : 'var(--c-ink-faint)',
              fontWeight: tab === id ? 600 : 400,
              transitionDuration: 'var(--t-fast)',
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-3" role="tabpanel">
        <p className="text-[12px] leading-relaxed text-ink-muted">{MILESTONE[tab]}</p>
      </div>
    </aside>
  );
}
