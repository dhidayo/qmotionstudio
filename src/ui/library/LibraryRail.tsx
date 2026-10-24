import { useEffect, useMemo, useState } from 'react';
import type { Aspect } from '@/core/types';
import { aspectPosterUrl, posterUrl, previewUrl, templatesForMode, type TemplateSummary } from '@/templates/manifest';
import { lookPreset } from '@/templates/_shared/look';
import { purposeOf } from '@/templates/purpose';
import { START_HERE, WORKSPACES, effectiveFolded, libraryGroups } from '@/templates/workspaces';
import { useEditor } from '@/state/store';
import { useWorkspace } from '@/state/workspace';
import { useStoredFolds, writeFolds } from './libraryFolds';
import { useEntitlements } from '@/entitlements';
import { usePreviewClock } from '@/ui/shell/ClockProvider';
import { useLayout } from '@/ui/shell/useLayout';
import { noHover } from './PlayingPreview';
import { CardPicture, useHoverIntent } from './CardPicture';
import { LivePreview } from './LivePreview';
import { libraryTrial, useTrialProject } from './useTrialProject';

/**
 * The template library (§1.1): grouped by purpose (D-143, D-160), with search,
 * a free/pro filter and favourites.
 *
 * Cards show the generated still in the project's frame shape, and move only
 * in that shape (D-160): the recorded loop where it was made in it, or, with a
 * mouse resting on a card, the design drawn live with the person's own work.
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
  const shape = useEditor((s) => s.project.aspect);

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

  // By purpose — what it is for (D-143), on every device (D-160) — set out for
  // the person (D-149): their groups first, a few picks above them.
  const workspace = useWorkspace();
  const narrowed = search.trim().length > 0 || tierFilter !== 'all' || showFavourites;
  const layout = useMemo(
    () => libraryGroups({ templates: visible, workspace, kind: mode === 'motionAd' ? 'ad' : 'scene', narrowed }),
    [visible, workspace, mode, narrowed],
  );
  const sections: readonly { readonly name: string; readonly templates: readonly TemplateSummary[]; readonly featured: boolean }[] = [
    ...(layout.startHere.length > 0 ? [{ name: START_HERE, templates: layout.startHere, featured: true }] : []),
    ...layout.groups.map((group) => ({ ...group, featured: false })),
  ];
  const stored = useStoredFolds(workspace);
  const collapsed = effectiveFolded(stored, workspace);
  const names = sections.map((section) => section.name);
  /*
   * A search shows everything it found: a match hidden in a folded group is a
   * match missed. So does a Free/Pro or favourites filter where groups start
   * folded (D-149) — otherwise "Pro" in Social could leave only closed headings.
   */
  const searching = search.trim().length > 0;
  const unfolded = searching || (narrowed && WORKSPACES[workspace].foldOthers);
  const folded = (name: string): boolean => !unfolded && collapsed.has(name);
  const allFolded = names.length > 0 && names.every((name) => collapsed.has(name));
  // While a search or filter holds every group open, a heading has nothing to fold.
  const toggle = (name: string): void => {
    if (unfolded) return;
    const next = new Set(collapsed);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    writeFolds(workspace, [...next]);
  };
  // Collapse all and Expand all change the groups in view and keep every other fold,
  // so folding the Design list never opens the Video one (D-149). Everything keeps its old behaviour.
  const setAll = (fold: boolean): void => {
    if (!WORKSPACES[workspace].foldOthers) { writeFolds(workspace, fold ? names : []); return; }
    const next = new Set(collapsed);
    for (const name of names) { if (fold) next.add(name); else next.delete(name); }
    writeFolds(workspace, [...next]);
  };

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
      {/*
        * The header in two rows (D-150): search with the favourites star and
        * one icon to fold or open every group beside it, then the Free/Pro
        * filter — nothing cut short at the rail's narrowest. The groups are
        * always by purpose (D-160), so there is no grouping switch.
        */}
      <div className={sheet ? 'pb-2' : 'border-b border-edge p-3'} data-library-header>
        <div className="flex items-center gap-1.5">
          <input
            type="search"
            value={search}
            onChange={(e) => { setSearch(e.target.value); }}
            placeholder="Search designs"
            aria-label="Search templates"
            className={`min-w-0 flex-1 rounded-md border border-edge bg-panel-alt px-2 ${sheet ? 'h-10 text-[15px]' : 'h-8 text-[12px]'} placeholder:text-ink-faint focus:border-accent focus:outline-none`}
          />
          <button
            type="button"
            data-favourites-filter
            onClick={toggleFavouritesFilter}
            aria-pressed={showFavourites}
            aria-label={`Show favourites only (${favourites.length})`}
            title={showFavourites ? 'Showing your favourites. Click to show every design.' : `Show only your favourites (${favourites.length})`}
            className={`relative grid shrink-0 place-items-center rounded-md border ${showFavourites ? 'chip-on' : 'border-edge text-ink-muted hover:bg-panel-alt'} ${sheet ? 'size-10' : 'size-8'}`}
          >
            <span aria-hidden className={sheet ? 'text-[17px]' : 'text-[14px]'}>{showFavourites || favourites.length > 0 ? '★' : '☆'}</span>
            {favourites.length > 0 && (
              <span aria-hidden className="tabular absolute -right-1 -top-1 min-w-4 rounded-full px-1 text-center text-[9px] font-semibold leading-4" style={{ background: 'var(--c-pro)', color: '#1a1300' }}>{favourites.length}</span>
            )}
          </button>
          {!unfolded && names.length > 1 && (
            <button
              type="button"
              data-fold-all
              onClick={() => { setAll(!allFolded); }}
              aria-label={allFolded ? 'Expand all groups' : 'Collapse all groups'}
              title={allFolded ? 'Expand all groups' : 'Collapse all groups'}
              className={`brand-surface grid shrink-0 place-items-center rounded-md hover:bg-[var(--c-brand-hover)] ${sheet ? 'size-10' : 'size-8'}`}
            >
              <FoldIcon open={allFolded} />
            </button>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <div role="group" aria-label="Free or Pro" className="flex gap-1">
            {(['all', 'free', 'pro'] as const).map((tier) => (
              <FilterChip
                key={tier}
                active={tierFilter === tier}
                onClick={() => { setTierFilter(tier); }}
                label={tier === 'all' ? 'All' : tier === 'free' ? 'Free' : 'Pro'}
                large={sheet}
              />
            ))}
          </div>
        </div>
        {/*
          * A video template is a whole film, not a scene (D-160). In Video,
          * choosing one was read as adding a scene, and it replaced every
          * scene the person had made; this says so before anything is picked.
          */}
        {mode === 'motionAd' && (
          <p data-library-note className={`mt-2 leading-snug text-ink-muted ${sheet ? 'text-[13px]' : 'text-[11px]'}`}>
            A video template is a whole video — several scenes. Using one replaces your scenes. To add one scene, use + Scene.
          </p>
        )}
      </div>

      <div className={sheet ? 'pt-1' : 'flex-1 overflow-y-auto p-3'}>
        {visible.length === 0 ? (
          <p className="py-4 text-center text-[11px] text-ink-faint">
            {showFavourites && favourites.length === 0
              ? 'No favourites yet. Hover a card and press the star.'
              : 'Nothing matches that search.'}
          </p>
        ) : (
          sections.map((section) => {
            const open = !folded(section.name);
            const id = `library-${section.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
            const caption = section.featured ? WORKSPACES[workspace].startHereCaption : null;
            return (
            <section
              key={section.name}
              className={open ? 'mb-4 last:mb-0' : 'mb-1.5'}
              {...(section.featured ? { 'data-library-featured': '' } : { 'data-library-category': section.name })}
            >
              {/* A group folds away (D-123): the library is long, and most visits want one corner of it. */}
              <h3>
                <button
                  type="button"
                  onClick={() => { toggle(section.name); }}
                  disabled={unfolded}
                  aria-expanded={open}
                  aria-controls={id}
                  className={`brand-surface flex w-full items-center gap-2 rounded-lg px-3 text-left font-semibold uppercase tracking-wider hover:bg-[var(--c-brand-hover)] ${sheet ? 'py-3 text-[13px]' : 'py-2.5 text-[11px]'}`}
                >
                  <span aria-hidden className="inline-block w-3 text-center transition-transform" style={{ transform: open ? 'rotate(90deg)' : 'none', transitionDuration: 'var(--t-fast)' }}>›</span>
                  <span className="min-w-0 flex-1 truncate">{section.name}</span>
                  <span className="tabular rounded-full px-2 py-0.5 font-normal normal-case tracking-normal" style={{ background: 'rgb(255 255 255 / 0.14)' }}>{section.templates.length}</span>
                </button>
              </h3>
              {open && caption !== null && (
                <p className={`mt-1.5 px-1 text-ink-faint ${sheet ? 'text-[12px]' : 'text-[10px]'}`}>{caption} · every design is still below</p>
              )}
              {open && (
              <div
                id={id}
                /*
                 * In the sheet, Start here is one row that scrolls sideways
                 * (D-160): as a grid it filled the phone's first screen, so the
                 * purpose groups — the part that changes with the purpose — were
                 * out of sight below it. The next card peeks in at the edge.
                 */
                {...(sheet && section.featured ? { 'data-start-here-row': '' } : {})}
                className={`mt-2 ${sheet
                  ? section.featured
                    ? 'flex snap-x snap-mandatory gap-2.5 overflow-x-auto overscroll-x-contain pb-1'
                    : 'grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4'
                  : 'grid grid-cols-2 gap-2'}`}
              >
                {section.templates
                  .map((template) => {
                    const card = (
                      <TemplateCard
                        key={template.id}
                        template={template}
                        featured={section.featured}
                        active={template.id === currentId}
                        favourite={favourites.includes(template.id)}
                        autoplay={sheet}
                        onSelect={() => {
                          if (sheet) setPreviewing(template);
                          else { setTemplate(template.id); onPicked?.(); }
                        }}
                        onToggleFavourite={() => { toggleFavourite(template.id); }}
                      />
                    );
                    return sheet && section.featured
                      ? <div key={template.id} className={`shrink-0 snap-start ${startHereWidth(shape)}`}>{card}</div>
                      : card;
                  })}
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

/** A card's width in the sheet's sideways Start here row: narrower for a tall frame, so the row stays short. */
function startHereWidth(shape: Aspect): string {
  return shape === '9:16' ? 'w-[36%] sm:w-[24%] lg:w-[18%]' : 'w-[44%] sm:w-[30%] lg:w-[23%]';
}

/** The background colour a design opens in, from its look. */
export function groundOf(template: TemplateSummary): string {
  const look = template.look === undefined ? undefined : lookPreset(template.look);
  return look?.palette.bg ?? 'var(--c-panel-alt)';
}

function FilterChip({
  active,
  onClick,
  label,
  large,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  large: boolean;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      // The chosen one in deep navy (D-150), so what is filtered reads at a glance.
      className={`whitespace-nowrap rounded-md border px-2.5 transition-colors ${large ? 'h-9 text-[13px]' : 'h-7 text-[11px]'} ${active ? 'chip-on' : 'border-edge text-ink-muted hover:bg-panel-alt'}`}
      style={{ transitionDuration: 'var(--t-fast)' }}
    >
      {label}
    </button>
  );
}

/** Two chevrons: apart to open every group, together to fold them. */
function FoldIcon({ open }: { open: boolean }): React.JSX.Element {
  return (
    <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      {open
        ? <path d="M7 9l5-5 5 5M7 15l5 5 5-5" />
        : <path d="M7 4l5 5 5-5M7 20l5-5 5 5" />}
    </svg>
  );
}

function TemplateCard({
  template,
  featured = false,
  active,
  favourite,
  autoplay,
  onSelect,
  onToggleFavourite,
}: {
  template: TemplateSummary;
  /** A copy in Start here (D-149): its own marker, and no second favourite star. */
  featured?: boolean;
  active: boolean;
  favourite: boolean;
  autoplay: boolean;
  onSelect: () => void;
  onToggleFavourite: () => void;
}): React.JSX.Element {
  // A screen with no hover has no other way to see a design move (point 4).
  const playsItself = autoplay || noHover();
  // The card takes the frame shape chosen above the picture (D-150): landscape
  // for 16:9, tall for 9:16, with the design's still in that shape — and it
  // only ever moves in that shape (D-160).
  const shape = useEditor((s) => s.project.aspect);
  const hover = useHoverIntent();
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
        {...(featured ? { 'data-featured-card': template.id } : { 'data-design-card': template.id })}
        {...hover.bind}
        title={template.blurb}
        className="block w-full overflow-hidden rounded-md border text-left transition-colors"
        style={{
          borderColor: active ? 'var(--c-accent)' : 'var(--c-edge)',
          transitionDuration: 'var(--t-fast)',
        }}
      >
        {/* The design's own ground behind its picture (D-121), so even before the poster loads the card is the colour the design opens in. */}
        <span className="relative block w-full" data-card-shape={shape} style={{ background: groundOf(template), aspectRatio: shape.replace(':', ' / ') }}>
          <CardPicture template={template} shape={shape} playsItself={playsItself} resting={hover.resting} trial={libraryTrial} />
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

      {!featured && <button
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
      </button>}
    </div>
  );
}

/**
 * A design large enough to judge, before it replaces anything.
 *
 * Drawn live in the project's own frame shape, with the person's photos,
 * words, look and logo (D-160): the change worked out here is the very one
 * "Use this design" then makes. The design's still in that shape shows at
 * once; the recorded loop stands in only if the design cannot be drawn.
 */
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
  const mode = useEditor((s) => s.project.mode);
  const shape = useEditor((s) => s.project.aspect);
  const sceneCount = useEditor((s) => s.project.scenes.length);
  const phone = useLayout() === 'phone';
  const trial = useTrialProject(template.id, libraryTrial);
  useEditorHeld();
  // A film replaces every scene (D-160); said here, before it does.
  const replaces = template.kind === 'ad' && sceneCount > 1;
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
        <span className="min-w-0 flex-1 text-center">
          <span className="block truncate text-[15px] font-semibold">{template.name}</span>
          <span className="tabular block text-[11px] text-ink-faint">In your {shape} frame</span>
        </span>
        <span className="w-14" />
      </div>
      {/* The picture takes whatever room is left and fits inside it; it never
          sets the height itself, so the button below can never be pushed off. */}
      <div className="relative min-h-0 flex-1 overflow-hidden" style={{ background: 'var(--c-stage)' }} data-design-preview-shape={shape}>
        <div className="absolute inset-3">
          {trial.status === 'failed' ? (
            // The design could not be drawn: its recorded loop, so the preview is never empty.
            <video
              src={previewUrl(template.id)}
              poster={posterUrl(template.id)}
              autoPlay
              muted
              loop
              playsInline
              className="size-full object-contain"
            />
          ) : (
            <LivePreview
              project={trial.status === 'ready' ? trial.project : null}
              aspect={shape}
              still={aspectPosterUrl(template.id, shape)}
              maxShortEdge={phone ? PHONE_PREVIEW_EDGE : WINDOW_PREVIEW_EDGE}
              rounded
            />
          )}
        </div>
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
          {mode === 'motionAd' ? 'Use this video template' : 'Use this design'}
        </button>
        {replaces && (
          <p className="tabular mt-1.5 text-center text-[12px] text-ink-faint" data-design-preview-replaces>
            Replaces your {sceneCount} scenes
          </p>
        )}
      </div>
    </div>
  );
}

/** The large preview's sharpest picture on a phone: the thumbnails' size, so it costs half the editor's (D-160). */
const PHONE_PREVIEW_EDGE = 540;
/** And in the tablet window, which is larger and further from the eye. */
const WINDOW_PREVIEW_EDGE = 720;

/**
 * Holds the editor's playback still while the large preview is open (D-160)
 * — one picture moving, not two, and no music under a silent preview — and
 * lets it carry on afterwards if it was playing.
 */
function useEditorHeld(): void {
  const clock = usePreviewClock();
  useEffect(() => {
    if (!clock) return;
    const was = clock.playing;
    clock.pause();
    return () => { if (was) clock.play(); };
  }, [clock]);
}
