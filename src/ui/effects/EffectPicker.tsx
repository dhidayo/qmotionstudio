import { useEffect, useMemo, useRef, useState } from 'react';
import { ELEMENT_EFFECTS, FRAME_EFFECTS } from '@/core/effects/catalog';
import {
  ELEMENT_CATEGORIES, FRAME_CATEGORIES,
  type ElementCategory, type ElementEffectDef, type FrameCategory, type FrameEffectDef,
} from '@/core/effects/types';
import { useEditor } from '@/state/store';
import { useMediaStore } from '@/ui/media/MediaProvider';
import { noHover } from '@/ui/library/PlayingPreview';
import { useOverlays, type PickerState } from '@/ui/shell/overlays';
import { EffectPreview, type PreviewEffect } from './EffectPreview';
import { addElementEffect, addFrameEffect } from './addEffect';
import { CurrentEffects } from './EffectEditors';

/**
 * The effect library (D-100).
 *
 * One dialog for every way in — "+ Effect" on the timeline, "Add effect" in
 * the Motion panel, "Effects…", "Entrance…" or "Exit…" on a right-click — that
 * shows the effects that make sense where it was opened from: whole-picture
 * effects for a scene or the timeline, element effects for one thing.
 *
 * Every card is a live preview drawn by the real renderer, so choosing is
 * looking, not reading descriptions.
 */

const CATEGORY_NOTES: Readonly<Record<FrameCategory | ElementCategory, string>> = {
  Atmosphere: 'Things in the air',
  Light: 'Glows, flares and flashes',
  Camera: 'The whole frame moves',
  Stylize: 'Looks and textures',
  Entrance: 'How it arrives',
  Exit: 'How it leaves',
  Emphasis: 'While it is on screen',
};

type Card = { readonly id: string; readonly name: string; readonly blurb: string; readonly category: FrameCategory | ElementCategory; readonly effect: PreviewEffect };

export function EffectPicker(): React.JSX.Element | null {
  const picker = useOverlays((s) => s.picker);
  if (!picker) return null;
  return <PickerDialog picker={picker} />;
}

function PickerDialog({ picker }: { picker: PickerState }): React.JSX.Element {
  const close = useOverlays((s) => s.closePicker);
  const showToast = useEditor((s) => s.showToast);
  const palette = useEditor((s) => s.project.scenes[s.selectedScene]?.inputs.look.palette ?? s.project.brand.palette);
  const media = useMediaStore();
  const photoId = useEditor((s) => {
    const scene = s.project.scenes[s.selectedScene];
    return scene?.inputs.photos[0]?.mediaId ?? null;
  });

  const forElement = picker.target.kind === 'element';
  const categories: readonly (FrameCategory | ElementCategory)[] = forElement ? ELEMENT_CATEGORIES : FRAME_CATEGORIES;
  const [category, setCategory] = useState<FrameCategory | ElementCategory | 'All'>(
    picker.category && categories.includes(picker.category) ? picker.category : 'All',
  );
  const [query, setQuery] = useState('');
  const [hovered, setHovered] = useState<string | null>(null);
  const search = useRef<HTMLInputElement | null>(null);

  /*
   * Typing straight away with a keyboard; on a touch screen the search waits
   * to be tapped (D-113). Focusing it there raised the on-screen keyboard over
   * half the list before anything had been asked for.
   */
  useEffect(() => { if (!noHover()) search.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); };
  }, [close]);

  const cards = useMemo((): readonly Card[] => {
    const frame = (def: FrameEffectDef): Card => ({ id: def.id, name: def.name, blurb: def.blurb, category: def.category, effect: { kind: 'frame', def } });
    const element = (def: ElementEffectDef): Card => ({ id: def.id, name: def.name, blurb: def.blurb, category: def.category, effect: { kind: 'element', def } });
    return forElement ? ELEMENT_EFFECTS.map(element) : FRAME_EFFECTS.map(frame);
  }, [forElement]);

  const wanted = query.trim().toLowerCase();
  const visible = cards.filter((card) =>
    (category === 'All' || card.category === category)
    && (wanted.length === 0 || `${card.name} ${card.blurb} ${card.category}`.toLowerCase().includes(wanted)),
  );
  const groups = categories
    .map((name) => ({ name, cards: visible.filter((card) => card.category === name) }))
    .filter((group) => group.cards.length > 0);

  const choose = (card: Card): void => {
    try {
      const message = card.effect.kind === 'frame'
        ? addFrameEffect(picker.target.kind === 'timeline' ? { kind: 'timeline' } : { kind: 'scene' }, card.effect.def)
        : picker.target.kind === 'element'
          ? addElementEffect(picker.target, card.effect.def)
          : 'That effect is for a single element — select one first.';
      showToast(message);
      close();
    } catch (error: unknown) {
      // §16: never silently.
      console.error(`Could not add the "${card.id}" effect.`, error);
      showToast('That effect could not be added. Try another, or reload the page.');
    }
  };

  // No hover on a phone: the cards on screen play by themselves instead.
  const touch = typeof matchMedia === 'function' && matchMedia('(hover: none)').matches;
  const title = picker.target.kind === 'element'
    ? `Effects for ${picker.target.label}`
    : picker.target.kind === 'timeline' ? 'Add an effect to the timeline' : 'Add an effect to this scene';
  const hint = picker.target.kind === 'element'
    ? 'Added on top of how it already moves. Change when it runs, how strong, and its settings in the panel.'
    : picker.target.kind === 'timeline'
      ? 'Goes at the playhead and covers everything — scenes and layers. Drag it on the FX lane to move it.'
      : 'Moods cover the whole scene; moments go at the playhead. Fine-tune them here or in Effects.';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Effects"
      /* A sheet from the bottom on a phone (D-109), a window on a computer. */
      className="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center sm:p-4"
      style={{ background: 'rgb(0 0 0 / 0.45)' }}
      onClick={(event) => { if (event.target === event.currentTarget) close(); }}
    >
      <div className="flex max-h-[90%] w-full flex-col rounded-t-2xl border border-edge bg-panel shadow-lg sm:w-[960px] sm:max-w-full sm:rounded-lg">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-edge px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-[14px] font-semibold">{title}</h2>
            <p className="text-[11px] text-ink-faint">{hint}</p>
          </div>
          <input
            ref={search}
            type="search"
            value={query}
            onChange={(event) => { setQuery(event.target.value); }}
            placeholder="Search effects"
            aria-label="Search effects"
            className="order-last w-full rounded-md border border-edge bg-panel-alt px-2 py-1.5 text-[14px] focus:border-accent focus:outline-none sm:order-none sm:w-48 sm:py-1 sm:text-[12px]"
          />
          <button type="button" onClick={close} className="rounded-md border border-edge px-2.5 py-1 text-[12px] hover:bg-panel-alt">
            Cancel
          </button>
        </div>

        <div className="flex gap-1 overflow-x-auto border-b border-edge px-4 py-2 sm:flex-wrap" role="tablist" aria-label="Effect categories">
          {(['All', ...categories] as const).map((name) => {
            const on = category === name;
            return (
              <button
                key={name}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => { setCategory(name); }}
                className="shrink-0 rounded-full border px-2.5 py-1 text-[12px] sm:py-0.5 sm:text-[11px]"
                style={{
                  borderColor: on ? 'var(--c-accent)' : 'var(--c-edge)',
                  background: on ? 'var(--c-accent-soft)' : 'transparent',
                  color: on ? 'var(--c-accent)' : 'var(--c-ink-muted)',
                  fontWeight: on ? 600 : 400,
                }}
              >
                {name}
              </button>
            );
          })}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {/* What is on it already, editable and removable, before adding more (D-138). */}
          {picker.target.kind === 'element' && <CurrentEffects target={{ kind: 'element', target: picker.target.target }} />}
          {picker.target.kind === 'scene' && <CurrentEffects target={{ kind: 'scene' }} />}
          {groups.length === 0 && (
            <p className="py-8 text-center text-[12px] text-ink-faint">No effects match “{query}”.</p>
          )}
          {groups.map((group) => (
            <section key={group.name} className="mb-4">
              <h3 className="mb-2 flex items-baseline gap-2 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                {group.name}
                <span className="font-normal normal-case tracking-normal">{CATEGORY_NOTES[group.name]}</span>
              </h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
                {group.cards.map((card) => (
                  <button
                    key={card.id}
                    type="button"
                    data-effect={card.id}
                    onClick={() => { choose(card); }}
                    onMouseEnter={() => { setHovered(card.id); }}
                    onMouseLeave={() => { setHovered((h) => (h === card.id ? null : h)); }}
                    onFocus={() => { setHovered(card.id); }}
                    onBlur={() => { setHovered((h) => (h === card.id ? null : h)); }}
                    title={card.blurb}
                    aria-label={`${card.name} — ${card.blurb}`}
                    className="group overflow-hidden rounded-md border border-edge text-left transition-colors hover:border-accent focus:border-accent focus:outline-none"
                  >
                    <span className="block overflow-hidden" style={{ background: 'var(--c-panel-alt)' }}>
                      <EffectPreview
                        effect={card.effect}
                        active={hovered === card.id}
                        palette={palette}
                        media={media}
                        photoId={photoId}
                        autoplay={touch}
                      />
                    </span>
                    <span className="block truncate px-1.5 pt-1 text-[11px] font-medium">{card.name}</span>
                    <span className="block truncate px-1.5 pb-1 text-[10px] text-ink-faint">{card.blurb}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
