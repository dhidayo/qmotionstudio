import { useMemo } from 'react';
import { CATEGORIES, posterUrl, previewUrl, templatesForMode, type TemplateSummary } from '@/templates/manifest';
import { useEditor } from '@/state/store';
import { useEntitlements } from '@/entitlements';

/**
 * The template library (§1.1): grouped by category, with search, a free/pro
 * filter and favourites.
 *
 * Cards show the generated poster and swap to the looping preview on hover,
 * which is what `npm run thumbs` produces both of for.
 */
export function LibraryRail(): React.JSX.Element {
  const currentId = useEditor((s) =>
    s.project.sourceAdTemplateId ?? s.project.scenes[s.selectedScene]?.templateId,
  );
  const setTemplate = useEditor((s) => s.setTemplate);
  const favourites = useEditor((s) => s.favourites);
  const toggleFavourite = useEditor((s) => s.toggleFavourite);
  const search = useEditor((s) => s.librarySearch);
  const setSearch = useEditor((s) => s.setLibrarySearch);
  const tierFilter = useEditor((s) => s.libraryTierFilter);
  const setTierFilter = useEditor((s) => s.setLibraryTierFilter);
  const showFavourites = useEditor((s) => s.libraryShowFavourites);
  const toggleFavouritesFilter = useEditor((s) => s.toggleLibraryFavourites);

  /**
   * The two modes list different things (D-013): Showcase picks a scene
   * template for the selected scene, Motion Ads picks an ad template that
   * replaces the whole sequence. Mixing them in one grid would mean a card
   * whose meaning depends on a switch elsewhere in the chrome.
   */
  const mode = useEditor((s) => s.project.mode);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return templatesForMode(mode).filter((t) => {
      if (tierFilter !== 'all' && t.tier !== tierFilter) return false;
      if (showFavourites && !favourites.includes(t.id)) return false;
      if (query.length === 0) return true;
      // Category is searchable too, so typing "depth" finds the whole group.
      return `${t.name} ${t.category} ${t.blurb}`.toLowerCase().includes(query);
    });
  }, [mode, search, tierFilter, showFavourites, favourites]);

  const categories = CATEGORIES.filter((c) => visible.some((t) => t.category === c));

  return (
    <aside
      className="flex shrink-0 flex-col border-r border-edge bg-panel"
      style={{ width: 'var(--w-library)' }}
      aria-label="Template library"
    >
      <div className="border-b border-edge p-3">
        <input
          type="search"
          value={search}
          onChange={(e) => { setSearch(e.target.value); }}
          placeholder="Search templates"
          aria-label="Search templates"
          className="w-full rounded-md border border-edge bg-panel-alt px-2 py-1.5 text-[12px] placeholder:text-ink-faint focus:border-accent focus:outline-none"
        />
        <div className="mt-2 flex gap-1">
          {(['all', 'free', 'pro'] as const).map((tier) => (
            <FilterChip
              key={tier}
              active={tierFilter === tier}
              onClick={() => { setTierFilter(tier); }}
              label={tier === 'all' ? 'All' : tier === 'free' ? 'Free' : 'Pro'}
            />
          ))}
          <FilterChip
            active={showFavourites}
            onClick={toggleFavouritesFilter}
            label={`★ ${favourites.length}`}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {visible.length === 0 ? (
          <p className="py-4 text-center text-[11px] text-ink-faint">
            {showFavourites && favourites.length === 0
              ? 'No favourites yet. Hover a card and press the star.'
              : 'Nothing matches that search.'}
          </p>
        ) : (
          categories.map((category) => (
            <section key={category} className="mb-4 last:mb-0">
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                {category}
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {visible
                  .filter((t) => t.category === category)
                  .map((template) => (
                    <TemplateCard
                      key={template.id}
                      template={template}
                      active={template.id === currentId}
                      favourite={favourites.includes(template.id)}
                      onSelect={() => { setTemplate(template.id); }}
                      onToggleFavourite={() => { toggleFavourite(template.id); }}
                    />
                  ))}
              </div>
            </section>
          ))
        )}
      </div>
    </aside>
  );
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="rounded-md border px-2 py-0.5 text-[10px] transition-colors"
      style={{
        borderColor: active ? 'var(--c-accent)' : 'var(--c-edge)',
        background: active ? 'var(--c-accent-soft)' : 'transparent',
        color: active ? 'var(--c-accent)' : 'var(--c-ink-faint)',
        fontWeight: active ? 600 : 400,
        transitionDuration: 'var(--t-fast)',
      }}
    >
      {label}
    </button>
  );
}

function TemplateCard({
  template,
  active,
  favourite,
  onSelect,
  onToggleFavourite,
}: {
  template: TemplateSummary;
  active: boolean;
  favourite: boolean;
  onSelect: () => void;
  onToggleFavourite: () => void;
}): React.JSX.Element {
  const { limits } = useEntitlements();
  // §12: Pro templates are badged and selectable; the gate is on export, not
  // on looking. Locking the card would make the library feel smaller than it is.
  const locked = template.tier === 'pro' && !limits.proTemplates;

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={active}
        title={template.blurb}
        className="block w-full overflow-hidden rounded-md border text-left transition-colors"
        style={{
          borderColor: active ? 'var(--c-accent)' : 'var(--c-edge)',
          transitionDuration: 'var(--t-fast)',
        }}
      >
        <span className="relative block aspect-square w-full" style={{ background: 'var(--c-panel-alt)' }}>
          <img
            src={posterUrl(template.id)}
            alt=""
            loading="lazy"
            className="absolute inset-0 size-full object-cover group-hover:opacity-0"
          />
          {/* The loop only loads on hover, so the library costs one poster per card. */}
          <video
            src={previewUrl(template.id)}
            muted
            loop
            playsInline
            preload="none"
            aria-hidden
            className="absolute inset-0 size-full object-cover opacity-0 group-hover:opacity-100"
            onMouseEnter={(e) => { void e.currentTarget.play().catch(() => undefined); }}
            onMouseLeave={(e) => { e.currentTarget.pause(); }}
          />
        </span>
        <span className="block px-1.5 py-1">
          <span
            className="block truncate text-[11px]"
            style={{ color: active ? 'var(--c-accent)' : 'var(--c-ink-muted)', fontWeight: active ? 600 : 400 }}
          >
            {template.name}
          </span>
          {template.kind === 'ad' && (
            <span className="tabular block truncate text-[9px] text-ink-faint">
              {template.sceneCount} scenes · {Math.round((template.durationMs ?? 0) / 1000)}s
            </span>
          )}
        </span>
      </button>

      {locked && (
        <span
          className="pointer-events-none absolute right-1 top-1 rounded-sm px-1 py-0.5 text-[9px] font-bold uppercase"
          style={{ background: 'var(--c-pro-soft)', color: 'var(--c-pro)' }}
        >
          Pro
        </span>
      )}
      {template.isNew === true && !locked && (
        <span
          className="pointer-events-none absolute right-1 top-1 rounded-sm px-1 py-0.5 text-[9px] font-bold uppercase"
          style={{ background: 'var(--c-accent)', color: 'var(--c-accent-ink)' }}
        >
          New
        </span>
      )}

      <button
        type="button"
        onClick={onToggleFavourite}
        aria-pressed={favourite}
        aria-label={favourite ? `Unfavourite ${template.name}` : `Favourite ${template.name}`}
        className="absolute left-1 top-1 grid size-5 place-items-center rounded-sm text-[11px] leading-none opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        style={{
          background: 'color-mix(in srgb, var(--c-panel) 85%, transparent)',
          color: favourite ? 'var(--c-pro)' : 'var(--c-ink-faint)',
          opacity: favourite ? 1 : undefined,
          transitionDuration: 'var(--t-fast)',
        }}
      >
        {favourite ? '★' : '☆'}
      </button>
    </div>
  );
}
