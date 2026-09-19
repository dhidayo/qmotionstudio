import { TEMPLATE_MANIFEST, CATEGORIES, posterUrl, type TemplateSummary } from '@/templates/manifest';
import { useEditor } from '@/state/store';

/**
 * A minimal template rail.
 *
 * The real library — search, free/pro filter, favourites, hover previews — is
 * M3 (§1.1). This exists so M2 is testable by hand: pick a template, see it
 * render. It shows the generated posters, which is also a standing check that
 * `npm run thumbs` output is actually wired up.
 */
export function LibraryRail(): React.JSX.Element {
  const currentId = useEditor((s) => s.project.scenes[0]?.templateId);
  const setTemplate = useEditor((s) => s.setTemplate);

  return (
    <aside
      className="flex shrink-0 flex-col border-r border-edge bg-panel"
      style={{ width: 'var(--w-library)' }}
      aria-label="Template library"
    >
      <div className="border-b border-edge px-3 py-2.5 text-[12px] font-semibold">Templates</div>

      <div className="flex-1 overflow-y-auto p-3">
        {CATEGORIES.map((category) => (
          <section key={category} className="mb-4 last:mb-0">
            <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
              {category}
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {TEMPLATE_MANIFEST.filter((t) => t.category === category).map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  active={template.id === currentId}
                  onSelect={setTemplate}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      <p className="border-t border-edge px-3 py-2 text-[11px] text-ink-faint">
        Search, filters and favourites arrive at M3.
      </p>
    </aside>
  );
}

function TemplateCard({
  template,
  active,
  onSelect,
}: {
  template: TemplateSummary;
  active: boolean;
  onSelect: (id: string) => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={() => { onSelect(template.id); }}
      aria-pressed={active}
      title={template.blurb}
      className="group relative overflow-hidden rounded-md border text-left transition-colors"
      style={{
        borderColor: active ? 'var(--c-accent)' : 'var(--c-edge)',
        transitionDuration: 'var(--t-fast)',
      }}
    >
      <img
        src={posterUrl(template.id)}
        alt=""
        loading="lazy"
        className="block aspect-square w-full object-cover"
        style={{ background: 'var(--c-panel-alt)' }}
      />
      {template.tier === 'pro' && (
        <span
          className="absolute right-1 top-1 rounded-sm px-1 py-0.5 text-[9px] font-bold uppercase"
          style={{ background: 'var(--c-pro-soft)', color: 'var(--c-pro)' }}
        >
          Pro
        </span>
      )}
      {template.isNew === true && (
        <span
          className="absolute left-1 top-1 rounded-sm px-1 py-0.5 text-[9px] font-bold uppercase"
          style={{ background: 'var(--c-accent)', color: 'var(--c-accent-ink)' }}
        >
          New
        </span>
      )}
      <span
        className="block truncate px-1.5 py-1 text-[11px]"
        style={{ color: active ? 'var(--c-accent)' : 'var(--c-ink-muted)', fontWeight: active ? 600 : 400 }}
      >
        {template.name}
      </span>
    </button>
  );
}
