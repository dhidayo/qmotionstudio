import { useEffect, useMemo, useRef, useState } from 'react';
import * as actions from '@/document/actions';
import { createSceneFrom } from '@/document/defaults';
import { userPhotoIds } from '@/document/select/media';
import { useEntitlements } from '@/entitlements';
import { CATEGORIES, posterUrl, previewUrl, sceneTemplates, type TemplateSummary } from '@/templates/manifest';
import { loadSceneTemplate } from '@/templates/registry';
import { useEditor } from '@/state/store';

/**
 * Choosing what kind of scene to add, or what a scene should become (D-097).
 *
 * "When I click + Scene, I am not able to specify the type of scene I need…
 * one is basically forced on me." It was: "+ Scene" copied whichever scene was
 * selected, and in Motion Ads the library lists ad templates — so there was no
 * way at all to put a Soft Pop beat after a Kinetic Type one, or to change one
 * beat's design without rebuilding it.
 *
 * Every scene template is here, grouped as the library groups them, with Blank
 * first for building from nothing. The same picker does both jobs:
 *
 *   add      a new scene after the selected one, carrying the person's photos,
 *            logo and look forward (D-098) so it matches what is already there.
 *   replace  the selected scene takes the new design and keeps its photos, its
 *            text where the slots line up, and its length where the new
 *            design allows it — changing the look of a beat should not cost
 *            its content or its place in the timing.
 *
 * Pro designs are badged and selectable, as in the library: the gate is at
 * export, never at looking.
 */
export function ScenePicker({
  mode,
  onClose,
}: {
  mode: 'add' | 'replace';
  onClose: () => void;
}): React.JSX.Element {
  const project = useEditor((s) => s.project);
  const index = useEditor((s) => s.selectedScene);
  const dispatch = useEditor((s) => s.dispatch);
  const selectScene = useEditor((s) => s.selectScene);
  const showToast = useEditor((s) => s.showToast);
  const { limits } = useEntitlements(project.mode);

  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const search = useRef<HTMLInputElement | null>(null);

  const current = project.scenes[index];

  useEffect(() => { search.current?.focus(); }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const all = useMemo(() => sceneTemplates(), []);
  const blank = all.find((t) => t.id === 'blank');

  const groups = useMemo(() => {
    const wanted = query.trim().toLowerCase();
    const matches = (t: TemplateSummary): boolean =>
      wanted.length === 0
      || t.name.toLowerCase().includes(wanted)
      || t.category.toLowerCase().includes(wanted)
      || t.blurb.toLowerCase().includes(wanted);
    return CATEGORIES
      .map((category) => ({
        category,
        templates: all.filter((t) => t.category === category && t.listed !== false && matches(t)),
      }))
      .filter((group) => group.templates.length > 0);
  }, [all, query]);

  const choose = async (summary: TemplateSummary): Promise<void> => {
    if (busy !== null || !current) return;
    setBusy(summary.id);
    try {
      const template = await loadSceneTemplate(summary.id);

      if (mode === 'add') {
        const scene = createSceneFrom(template.id, {
          durationMs: template.defaultDurationMs,
          photoCount: template.photoSlots.default,
          from: current,
          photoIds: userPhotoIds(project),
        });
        dispatch(actions.addScene(scene, index + 1));
        selectScene(index + 1);
        showToast(`Added “${template.name}” as scene ${index + 2}.`);
      } else if (current.templateId === template.id) {
        // Already this design: nothing to change, and nothing to announce.
      } else {
        // Keep the beat's place in the timing, inside what the new design allows.
        const durationMs = Math.max(
          template.minDurationMs,
          Math.min(current.durationMs, template.maxDurationMs),
        );
        dispatch(actions.setTemplate(template.id, { durationMs, photoSlots: template.photoSlots }));
        showToast(`Scene ${index + 1} is now “${template.name}”.`);
      }
      onClose();
    } catch (error: unknown) {
      // §16: a design that will not load is a real failure, said out loud.
      console.error(`Could not load the "${summary.id}" design.`, error);
      showToast('That design could not be loaded. Try another, or reload the page.');
      setBusy(null);
    }
  };

  const title = mode === 'add' ? 'Add a scene' : `Change scene ${index + 1}`;
  const hint = mode === 'add'
    ? 'It goes after the selected scene, with your photos, logo and colours already in it.'
    : 'The scene keeps its photos, its text where the new design has room for it, and its length.';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 grid place-items-center p-4"
      style={{ background: 'rgb(0 0 0 / 0.45)' }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="flex max-h-[86vh] w-[880px] max-w-full flex-col rounded-lg border border-edge bg-panel shadow-lg">
        <div className="flex flex-wrap items-center gap-3 border-b border-edge px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-[14px] font-semibold">{title}</h2>
            <p className="text-[11px] text-ink-faint">{hint}</p>
          </div>
          <input
            ref={search}
            type="search"
            value={query}
            onChange={(event) => { setQuery(event.target.value); }}
            placeholder="Search designs"
            aria-label="Search designs"
            className="w-48 rounded-md border border-edge bg-panel-alt px-2 py-1 text-[12px] focus:border-accent focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-edge px-2 py-1 text-[11px] hover:bg-panel-alt"
          >
            Cancel
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {blank && query.trim().length === 0 && (
            <section className="mb-4">
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">Start from nothing</h3>
              <button
                type="button"
                onClick={() => { void choose(blank); }}
                disabled={busy !== null}
                aria-label="Blank — a background to build on with photos, text and video"
                className="flex w-full items-center gap-3 rounded-md border border-dashed px-3 py-3 text-left hover:bg-panel-alt disabled:opacity-50"
                style={{ borderColor: current?.templateId === 'blank' ? 'var(--c-accent)' : 'var(--c-edge-strong)' }}
              >
                <span
                  aria-hidden
                  className="grid size-12 shrink-0 place-items-center rounded-md text-[20px]"
                  style={{ background: 'var(--c-panel-alt)', color: 'var(--c-ink-faint)' }}
                >
                  +
                </span>
                <span className="min-w-0">
                  <span className="block text-[12px] font-semibold">Blank</span>
                  <span className="block text-[11px] text-ink-faint">
                    A background and your logo. Add photos, text and video with + Photo, + Text and + Media, and give each its own motion.
                  </span>
                </span>
              </button>
            </section>
          )}

          {groups.length === 0 && (
            <p className="py-8 text-center text-[12px] text-ink-faint">No designs match “{query}”.</p>
          )}

          {groups.map((group) => (
            <section key={group.category} className="mb-4">
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">{group.category}</h3>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                {group.templates.map((template) => (
                  <PickerCard
                    key={template.id}
                    template={template}
                    current={mode === 'replace' && current?.templateId === template.id}
                    pro={template.tier === 'pro' && !limits.proTemplates}
                    loading={busy === template.id}
                    disabled={busy !== null}
                    onChoose={() => { void choose(template); }}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function PickerCard({
  template,
  current,
  pro,
  loading,
  disabled,
  onChoose,
}: {
  template: TemplateSummary;
  current: boolean;
  pro: boolean;
  loading: boolean;
  disabled: boolean;
  onChoose: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onChoose}
      disabled={disabled}
      title={template.blurb}
      aria-label={`${template.name}${pro ? ', Pro' : ''}${current ? ', current design' : ''}`}
      className="group relative block overflow-hidden rounded-md border text-left disabled:cursor-wait"
      style={{ borderColor: current ? 'var(--c-accent)' : 'var(--c-edge)' }}
    >
      <span className="relative block aspect-square w-full" style={{ background: 'var(--c-panel-alt)' }}>
        <img
          src={posterUrl(template.id)}
          alt=""
          loading="lazy"
          className="absolute inset-0 size-full object-cover group-hover:opacity-0"
        />
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
        {loading && (
          <span
            className="absolute inset-0 grid place-items-center text-[11px] font-semibold"
            style={{ background: 'color-mix(in srgb, var(--c-panel) 70%, transparent)' }}
          >
            Adding…
          </span>
        )}
      </span>
      <span className="block truncate px-1.5 py-1 text-[11px]" style={{ color: current ? 'var(--c-accent)' : 'var(--c-ink-muted)' }}>
        {template.name}
      </span>
      {pro && (
        <span
          className="pointer-events-none absolute right-1 top-1 rounded-sm px-1 py-0.5 text-[9px] font-bold uppercase"
          style={{ background: 'var(--c-pro-soft)', color: 'var(--c-pro)' }}
        >
          Pro
        </span>
      )}
      {current && (
        <span
          className="pointer-events-none absolute left-1 top-1 rounded-sm px-1 py-0.5 text-[9px] font-bold uppercase"
          style={{ background: 'var(--c-accent)', color: 'var(--c-accent-ink)' }}
        >
          Now
        </span>
      )}
    </button>
  );
}
