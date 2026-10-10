import { useEditor, type InspectorTab } from '@/state/store';
import { PhotosTab } from './tabs/PhotosTab';
import { TextTab } from './tabs/TextTab';
import { MotionTab } from './tabs/MotionTab';
import { LookTab } from './tabs/LookTab';
import { OverlayPanel } from './OverlayPanel';
import { AudioPanel } from './AudioPanel';
import { TimelineEffectPanel } from '@/ui/effects/EffectEditors';

/*
 * Logo became part of Look, and its place went to Motion — the template's
 * motion properties and the effects library (D-105).
 */
const TABS: readonly { id: InspectorTab; label: string }[] = [
  { id: 'photos', label: 'Photos' },
  { id: 'text', label: 'Text' },
  { id: 'motion', label: 'Motion' },
  { id: 'look', label: 'Look' },
];

/**
 * §8. The inspector reads the template to know what controls to show — a
 * template with no text slots has no Text tab content, and one that does not
 * place a logo says so rather than offering a dead control.
 */
export function Inspector(): React.JSX.Element {
  const tab = useEditor((s) => s.inspectorTab);
  const setTab = useEditor((s) => s.setInspectorTab);
  // Resolved by AppShell once the lazy registry (D-029) has fetched it.
  const template = useEditor((s) => s.template);
  /**
   * An overlay is not a scene (§3C), so it has no photo slots, no template text
   * slots and no look. While one is selected the panel replaces the four tabs
   * rather than adding a fifth that would be empty the rest of the time.
   */
  const editingOverlay = useEditor((s) => s.selectedOverlay !== null);
  const editingAudio = useEditor((s) => s.selectedAudio !== null);
  const editingEffect = useEditor((s) => s.selectedEffect !== null);

  if (editingEffect) {
    return (
      <aside
        className="flex shrink-0 flex-col overflow-y-auto border-l border-edge bg-panel p-3"
        style={{ width: 'var(--w-inspector)' }}
        aria-label="Effect inspector"
      >
        <TimelineEffectPanel />
      </aside>
    );
  }

  if (editingAudio) {
    return (
      <aside
        className="flex shrink-0 flex-col overflow-y-auto border-l border-edge bg-panel p-3"
        style={{ width: 'var(--w-inspector)' }}
        aria-label="Music inspector"
      >
        <AudioPanel />
      </aside>
    );
  }

  if (editingOverlay) {
    return (
      <aside
        className="flex shrink-0 flex-col overflow-y-auto border-l border-edge bg-panel p-3"
        style={{ width: 'var(--w-inspector)' }}
        aria-label="Overlay inspector"
      >
        <OverlayPanel />
      </aside>
    );
  }

  return (
    <aside
      className="flex shrink-0 flex-col border-l border-edge bg-panel"
      style={{ width: 'var(--w-inspector)' }}
      aria-label="Inspector"
    >
      <div className="brand-surface flex border-b border-edge" role="tablist">
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
        {tab === 'photos' && <PhotosTab template={template} />}
        {tab === 'text' && <TextTab template={template} />}
        {tab === 'motion' && <MotionTab template={template} />}
        {tab === 'look' && <LookTab template={template} />}
      </div>
    </aside>
  );
}
