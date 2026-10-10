import { useCallback, useMemo, useState } from 'react';
import { CATEGORIES, posterUrl, previewUrl, templatesForMode, type TemplateSummary } from '@/templates/manifest';
import { lookPreset } from '@/templates/_shared/look';
import { purposeOf, purposesFor } from '@/templates/purpose';
import { useEditor } from '@/state/store';
import { useEntitlements } from '@/entitlements';
import { PlayingPreview, noHover } from './PlayingPreview';

/**
 * The template library (§1.1): grouped by category, with search, a free/pro
 * filter and favourites.
 *
 * Cards show the generated poster and swap to the looping preview on hover,
 * which is what `npm run thumbs` produces both of for.
 */
export function LibraryRail({
  variant = 'rail',
  onPicked,
}: {
  /**
   * `sheet` is the phone's (D-109): full width, previews that play by
   * themselves, and a tap that opens a large preview before anything changes.
   */
  variant?: 'rail' | 'sheet';
  /** Called once a design has been put on the canvas. */
  onPicked?: () => void;
} = {}): React.JSX.Element {
  const sheet = variant === 'sheet';
  const [previewing, setPreviewing] = useState<TemplateSummary | null>(null);
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
      return `${t.name} ${t.category} ${purposeOf(t)} ${t.blurb}`.toLowerCase().includes(query);
    });
  }, [mode, search, tierFilter, showFavourites, favourites]);

  // By purpose — what it is for — unless the person chose to browse by look (D-143).
  const [groupBy, setGroupBy] = useGroupBy();
  const groupOf = (t: TemplateSummary): string => (groupBy === 'purpose' ? purposeOf(t) : t.category);
  const order: readonly string[] = groupBy === 'purpose' ? purposesFor(mode === 'motionAd' ? 'ad' : 'scene') : CATEGORIES;
  const categories = order.filter((c) => visible.some((t) => groupOf(t) === c));
  const { collapsed, toggle, setAll } = useCollapsedCategories();
  // A search shows everything it found: a match hidden in a folded group is a match missed.
  const searching = search.trim().length > 0;
  const folded = (category: string): boolean => !searching && collapsed.has(category);
  const allFolded = categories.length > 0 && categories.every((c) => collapsed.has(c));

  return (
    <aside
      className={sheet ? 'flex flex-col' : 'flex shrink-0 flex-col border-r border-edge bg-panel'}
      style={sheet ? undefined : { width: 'var(--w-library)' }}
      aria-label="Template library"
    >
      {previewing && (
        <DesignPreview
          template={previewing}
          onBack={() => { setPreviewing(null); }}
          onUse={() => { setTemplate(previewing.id); setPreviewing(null); onPicked?.(); }}
        />
      )}
      <div className={sheet ? 'pb-2' : 'border-b border-edge p-3'}>
        <input
          type="search"
          value={search}
          onChange={(e) => { setSearch(e.target.value); }}
          placeholder="Search templates"
          aria-label="Search templates"
          className={`w-full rounded-md border border-edge bg-panel-alt px-2 ${sheet ? 'py-2 text-[15px]' : 'py-1.5 text-[12px]'} placeholder:text-ink-faint focus:border-accent focus:outline-none`}
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
          <button
            type="button"
            data-group-by
            onClick={() => { setGroupBy(groupBy === 'purpose' ? 'style' : 'purpose'); }}
            title={groupBy === 'purpose' ? 'Grouped by what each design is for. Click to group by how it looks.' : 'Grouped by how each design looks. Click to group by what it is for.'}
            className={`rounded-md border border-edge px-1.5 text-ink-muted hover:bg-panel-alt ${sheet ? 'text-[12px]' : 'text-[10px]'}`}
          >
            By {groupBy === 'purpose' ? 'purpose' : 'style'}
          </button>
          {!searching && categories.length > 1 && (
            <button
              type="button"
              data-fold-all
              onClick={() => { setAll(allFolded ? [] : categories); }}
              className={`ml-auto rounded-md px-1.5 text-ink-faint hover:text-ink ${sheet ? 'text-[12px]' : 'text-[10px]'}`}
            >
              {allFolded ? 'Expand all' : 'Collapse all'}
            </button>
          )}
        </div>
      </div>

      <div className={sheet ? 'pt-1' : 'flex-1 overflow-y-auto p-3'}>
        {visible.length === 0 ? (
          <p className="py-4 text-center text-[11px] text-ink-faint">
            {showFavourites && favourites.length === 0
              ? 'No favourites yet. Hover a card and press the star.'
              : 'Nothing matches that search.'}
          </p>
        ) : (
          categories.map((category) => {
            const inCategory = visible.filter((t) => groupOf(t) === category);
            const open = !folded(category);
            const id = `library-${category.toLowerCase().replace(/\s+/g, '-')}`;
            return (
            <section key={category} className={open ? 'mb-4 last:mb-0' : 'mb-1.5'} data-library-category={category}>
              {/* A category folds away (D-123): the library is long, and most visits want one corner of it. */}
              <h3>
                <button
                  type="button"
                  onClick={() => { toggle(category); }}
                  aria-expanded={open}
                  aria-controls={id}
                  className={`brand-surface flex w-full items-center gap-2 rounded-lg px-3 text-left font-semibold uppercase tracking-wider hover:bg-[var(--c-brand-hover)] ${sheet ? 'py-3 text-[13px]' : 'py-2.5 text-[11px]'}`}
                >
                  <span aria-hidden className="inline-block w-3 text-center transition-transform" style={{ transform: open ? 'rotate(90deg)' : 'none', transitionDuration: 'var(--t-fast)' }}>›</span>
                  <span className="min-w-0 flex-1 truncate">{category}</span>
                  <span className="tabular rounded-full px-2 py-0.5 font-normal normal-case tracking-normal" style={{ background: 'rgb(255 255 255 / 0.14)' }}>{inCategory.length}</span>
                </button>
              </h3>
              {open && (
              <div id={id} className={`mt-2 ${sheet ? 'grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4' : 'grid grid-cols-2 gap-2'}`}>
                {inCategory
                  .map((template) => (
                    <TemplateCard
                      key={template.id}
                      template={template}
                      active={template.id === currentId}
                      favourite={favourites.includes(template.id)}
                      autoplay={sheet}
                      onSelect={() => {
                        if (sheet) setPreviewing(template);
                        else { setTemplate(template.id); onPicked?.(); }
                      }}
                      onToggleFavourite={() => { toggleFavourite(template.id); }}
                    />
                  ))}
              </div>
              )}
            </section>
            );
          })
        )}
      </div>
    </aside>
  );
}

/** The background colour a design opens in, from its look. */
function groundOf(template: TemplateSummary): string {
  const look = template.look === undefined ? undefined : lookPreset(template.look);
  return look?.palette.bg ?? 'var(--c-panel-alt)';
}

const FOLDED_KEY = 'ms.library.folded';
const GROUP_KEY = 'ms.library.groupBy';

/** Purpose or style, remembered on this device (D-143). */
function useGroupBy(): ['purpose' | 'style', (next: 'purpose' | 'style') => void] {
  const [groupBy, set] = useState<'purpose' | 'style'>(() => {
    try {
      return localStorage.getItem(GROUP_KEY) === 'style' ? 'style' : 'purpose';
    } catch {
      return 'purpose';
    }
  });
  const choose = useCallback((next: 'purpose' | 'style'): void => {
    set(next);
    try { localStorage.setItem(GROUP_KEY, next); } catch { /* for this visit */ }
  }, []);
  return [groupBy, choose];
}

/**
 * Which categories are folded, remembered on this device (a viewer's
 * convenience, so browser storage, D-123). Storage can be missing or refuse —
 * a private window — and then folding simply lasts for the visit.
 */
function useCollapsedCategories(): {
  collapsed: ReadonlySet<string>;
  toggle: (category: string) => void;
  setAll: (categories: readonly string[]) => void;
} {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => {
    try {
      const raw = localStorage.getItem(FOLDED_KEY);
      const parsed: unknown = raw === null ? [] : JSON.parse(raw);
      return new Set(Array.isArray(parsed) ? parsed.filter((c): c is string => typeof c === 'string') : []);
    } catch {
      return new Set();
    }
  });
  const remember = useCallback((next: ReadonlySet<string>): void => {
    setCollapsed(next);
    try {
      localStorage.setItem(FOLDED_KEY, JSON.stringify([...next]));
    } catch {
      // Not remembered between visits; folding still works now.
    }
  }, []);
  const toggle = useCallback((category: string): void => {
    const next = new Set(collapsed);
    if (next.has(category)) next.delete(category);
    else next.add(category);
    remember(next);
  }, [collapsed, remember]);
  const setAll = useCallback((categories: readonly string[]): void => { remember(new Set(categories)); }, [remember]);
  return { collapsed, toggle, setAll };
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
  autoplay,
  onSelect,
  onToggleFavourite,
}: {
  template: TemplateSummary;
  active: boolean;
  favourite: boolean;
  autoplay: boolean;
  onSelect: () => void;
  onToggleFavourite: () => void;
}): React.JSX.Element {
  // A screen with no hover has no other way to see a design move (point 4).
  const playsItself = autoplay || noHover();
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
        data-design-card={template.id}
        title={template.blurb}
        className="block w-full overflow-hidden rounded-md border text-left transition-colors"
        style={{
          borderColor: active ? 'var(--c-accent)' : 'var(--c-edge)',
          transitionDuration: 'var(--t-fast)',
        }}
      >
        {/* The design's own ground behind its picture (D-121), so even before the poster loads the card is the colour the design opens in. */}
        <span className="relative block aspect-square w-full" style={{ background: groundOf(template) }}>
          {playsItself ? <PlayingPreview id={template.id} /> : <>
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
          </>}
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

/** A design large enough to judge, before it replaces anything. */
function DesignPreview({
  template,
  onBack,
  onUse,
}: {
  template: TemplateSummary;
  onBack: () => void;
  onUse: () => void;
}): React.JSX.Element {
  const { limits } = useEntitlements();
  const locked = template.tier === 'pro' && !limits.proTemplates;
  return (
    <div
      role="dialog"
      aria-label={`Preview of ${template.name}`}
      className="fixed inset-x-0 top-0 z-[60] flex flex-col bg-panel"
      // The visible height, not the layout's: on a phone the browser's own bars
      // come and go, and a 100vh sheet puts its last row under them (D-136).
      style={{ height: '100dvh', paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex shrink-0 items-center gap-2 px-3 py-2">
        <button type="button" onClick={onBack} className="rounded-lg px-2 py-1.5 text-[14px] font-medium text-accent">
          ‹ Back
        </button>
        <span className="min-w-0 flex-1 truncate text-center text-[15px] font-semibold">{template.name}</span>
        <span className="w-14" />
      </div>
      {/* The picture takes whatever room is left and fits inside it; it never
          sets the height itself, so the button below can never be pushed off. */}
      <div className="relative min-h-0 flex-1 overflow-hidden" style={{ background: 'var(--c-stage)' }}>
        <video
          src={previewUrl(template.id)}
          poster={posterUrl(template.id)}
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-3 h-[calc(100%-24px)] w-[calc(100%-24px)] object-contain"
        />
      </div>
      <div className="shrink-0 px-4 pb-3 pt-3" data-design-preview-actions>
        <p className="text-[13px] text-ink-muted">{template.blurb}</p>
        {template.kind === 'ad' && (
          <p className="tabular mt-0.5 text-[12px] text-ink-faint">
            {template.sceneCount} scenes · {Math.round((template.durationMs ?? 0) / 1000)}s
          </p>
        )}
        {locked && <p className="mt-1 text-[12px]" style={{ color: 'var(--c-pro)' }}>A Pro design — free to try here.</p>}
        <button
          type="button"
          onClick={onUse}
          className="mt-3 w-full rounded-xl bg-accent py-3 text-[15px] font-semibold text-accent-ink"
        >
          Use this design
        </button>
      </div>
    </div>
  );
}
