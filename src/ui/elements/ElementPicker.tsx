import { useEffect, useMemo, useRef, useState } from 'react';
import * as actions from '@/document/actions';
import type { Overlay } from '@/document/types';
import type { StickerCategory } from '@/core/stickers/types';
import { useEditor } from '@/state/store';
import { addLayer } from '@/ui/editing/addLayer';
import { elementName, overlayLabel, undoHint } from '@/ui/editing/commands';
import { noHover } from '@/ui/library/PlayingPreview';
import { usePreviewClock } from '@/ui/shell/ClockProvider';
import { useOverlays, type ElementPickerCategory, type ElementPickerState } from '@/ui/shell/overlays';
import { ElementPreview, type ElementContent } from './ElementPreview';
import { elementTiles, stickerCategories, tileMatches, type ElementTile } from './presets';

/**
 * The elements library (D-158): shapes, animated stickers and numbers.
 *
 * One window for every way in — "+ Shape", "+ Sticker" and "+ Number" in the
 * add bar each open it on their own chip, "Add an element…" on the picture's
 * menu opens it on everything — modelled on the effects library: a sheet from
 * the bottom on a phone, a window on a computer, chips that scroll sideways
 * on a narrow screen and a grid of live previews that scrolls down.
 *
 * What is on the design already comes first (D-138), and it is the way to an
 * element hidden under another in an image, which has no timeline. Opened to
 * replace a sticker ("Change sticker…"), it shows stickers only and swaps the
 * content of the one in hand, keeping where it is and how it moves.
 */

const GROUPS: readonly ElementPickerCategory[] = ['Shapes', 'Stickers', 'Numbers'];

const GROUP_NOTES: Readonly<Record<ElementPickerCategory, string>> = {
  Shapes: 'Boxes, circles, lines and arrows — every colour, outline and corner can change',
  Stickers: 'Small animations that loop',
  Numbers: 'Figures that count up, and numbers for steps and ranks',
};

export function ElementPicker(): React.JSX.Element | null {
  const state = useOverlays((s) => s.elementPicker);
  if (!state) return null;
  return <PickerDialog state={state} />;
}

function PickerDialog({ state }: { state: ElementPickerState }): React.JSX.Element {
  const openElementPicker = useOverlays((s) => s.openElementPicker);
  const close = (): void => { openElementPicker(null); };
  const palette = useEditor((s) => (s.project.scenes[s.selectedScene] ?? s.project.scenes[0])?.inputs.look.palette ?? s.project.brand.palette);
  const overlays = useEditor((s) => s.project.overlays);
  const replacing = state.replace === undefined ? null : overlays.find((o) => o.id === state.replace) ?? null;

  const [group, setGroup] = useState<ElementPickerCategory | 'All'>(replacing ? 'Stickers' : state.category ?? 'All');
  const [sub, setSub] = useState<StickerCategory | 'All'>('All');
  const [query, setQuery] = useState('');
  const [hovered, setHovered] = useState<string | null>(null);
  const search = useRef<HTMLInputElement | null>(null);

  // Typing straight away with a keyboard; on a touch screen the search waits to be tapped (D-113).
  useEffect(() => { if (!noHover()) search.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') { event.preventDefault(); openElementPicker(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); };
  }, [openElementPicker]);

  const tiles = useMemo(() => elementTiles(), []);
  const subs = useMemo(() => stickerCategories(), []);
  const groups: readonly ElementPickerCategory[] = replacing ? ['Stickers'] : GROUPS;
  const visible = tiles.filter((tile) =>
    groups.includes(tile.group)
    && (group === 'All' || tile.group === group)
    && (group !== 'Stickers' || sub === 'All' || tile.stickerCategory === sub)
    && tileMatches(tile, query),
  );
  const sections = groups.flatMap((name) => {
    const inGroup = visible.filter((tile) => tile.group === name);
    if (name !== 'Stickers') return inGroup.length > 0 ? [{ key: name, title: name, note: GROUP_NOTES[name], tiles: inGroup }] : [];
    // Stickers under their own headings: Social, Reactions, Badges, Pointers.
    return subs
      .map((category) => ({ key: `Stickers:${category}`, title: `Stickers · ${category}`, note: '', tiles: inGroup.filter((t) => t.stickerCategory === category) }))
      .filter((section) => section.tiles.length > 0)
      .map((section, i) => (i === 0 ? { ...section, note: GROUP_NOTES.Stickers } : section));
  });

  const choose = (tile: ElementTile): void => {
    const s = useEditor.getState();
    if (replacing) {
      const keep = replacing.content.kind === 'sticker' && tile.content.kind === 'sticker'
        ? { ...tile.content, play: replacing.content.play, speed: replacing.content.speed }
        : tile.content;
      s.dispatch(actions.setOverlayContent(replacing.id, keep, 'Change sticker'));
      s.endInteraction();
      s.showToast(`Changed to ${tile.name}.`);
      close();
      return;
    }
    const id = addLayer(tile.content, spotFor(s.project.overlays), { enterAnim: tile.enterAnim });
    s.selectOverlay(id);
    s.showToast(`${tile.name} added — drag it where you want it.`);
    close();
  };

  const touch = noHover();
  const title = replacing ? 'Change sticker' : 'Add an element';
  const chips: readonly (ElementPickerCategory | 'All')[] = replacing ? [] : ['All', ...GROUPS];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Elements"
      /* A sheet from the bottom on a phone (D-109), a window on a computer. */
      className="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center sm:p-4"
      style={{ background: 'rgb(0 0 0 / 0.45)' }}
      onClick={(event) => { if (event.target === event.currentTarget) close(); }}
    >
      <div className="flex max-h-[90dvh] w-full flex-col rounded-t-2xl border border-edge bg-panel shadow-lg sm:max-h-[86dvh] sm:w-[960px] sm:max-w-full sm:rounded-lg">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-edge px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-[14px] font-semibold">{title}</h2>
            <p className="text-[11px] text-ink-faint">
              {replacing
                ? 'The new sticker takes this one’s place, size and motion.'
                : 'Everything about it can be changed once it is on the design: colours, words, size and how it moves.'}
            </p>
          </div>
          <input
            ref={search}
            type="search"
            value={query}
            onChange={(event) => { setQuery(event.target.value); }}
            placeholder={replacing ? 'Search stickers' : 'Search shapes, stickers, numbers'}
            aria-label="Search elements"
            className="order-last w-full rounded-md border border-edge bg-panel-alt px-2 py-1.5 text-[14px] focus:border-accent focus:outline-none sm:order-none sm:w-56 sm:py-1 sm:text-[12px]"
          />
          <button type="button" onClick={close} className="rounded-md border border-edge px-2.5 py-1 text-[12px] hover:bg-panel-alt">
            Cancel
          </button>
        </div>

        {(chips.length > 0 || (group === 'Stickers' && subs.length > 1)) && (
          <div className="flex flex-col gap-1.5 border-b border-edge px-4 py-2">
            {chips.length > 0 && (
              <ChipRow label="Element kinds" chips={chips} chosen={group} onChoose={(name) => { setGroup(name); setSub('All'); }} name="elements-kind" />
            )}
            {group === 'Stickers' && subs.length > 1 && (
              <ChipRow label="Sticker categories" chips={['All', ...subs]} chosen={sub} onChoose={setSub} small name="elements-sticker" />
            )}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3" data-element-grid>
          {!replacing && <OnThisDesign overlays={overlays} palette={palette} onDone={close} />}
          {sections.length === 0 && (
            <p className="py-8 text-center text-[12px] text-ink-faint">
              {query.trim().length > 0 ? `Nothing matches “${query.trim()}”.` : 'No stickers in this category yet.'}
            </p>
          )}
          {sections.map((section) => (
            <section key={section.key} className="mb-4">
              <h3 className="mb-2 flex flex-wrap items-baseline gap-x-2 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                {section.title}
                {section.note.length > 0 && <span className="font-normal normal-case tracking-normal">{section.note}</span>}
              </h3>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                {section.tiles.map((tile) => (
                  <button
                    key={tile.id}
                    type="button"
                    data-element-tile={tile.id}
                    onClick={() => { choose(tile); }}
                    onMouseEnter={() => { setHovered(tile.id); }}
                    onMouseLeave={() => { setHovered((h) => (h === tile.id ? null : h)); }}
                    onFocus={() => { setHovered(tile.id); }}
                    onBlur={() => { setHovered((h) => (h === tile.id ? null : h)); }}
                    aria-label={replacing ? `Change to ${tile.name}` : `Add ${tile.name}`}
                    title={tile.name}
                    className="group overflow-hidden rounded-md border border-edge text-left transition-colors hover:border-accent focus:border-accent focus:outline-none"
                  >
                    <span className="grid aspect-square place-items-center overflow-hidden" style={{ background: palette.bg }}>
                      <ElementPreview content={tile.content} active={hovered === tile.id} palette={palette} autoplay={touch} size={112} seed={tile.id} />
                    </span>
                    <span className="block truncate px-1.5 py-1 text-[11px] font-medium">{tile.name}</span>
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

function ChipRow<T extends string>({
  label,
  chips,
  chosen,
  onChoose,
  small = false,
  name,
}: {
  label: string;
  chips: readonly T[];
  chosen: T;
  onChoose: (chip: T) => void;
  small?: boolean;
  name: string;
}): React.JSX.Element {
  return (
    // Sideways on a narrow screen rather than wrapping into a wall of chips.
    <div className="-mx-4 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none]" role="tablist" aria-label={label} data-chip-row={name}>
      {chips.map((chip) => {
        const on = chip === chosen;
        return (
          <button
            key={chip}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => { onChoose(chip); }}
            className={`shrink-0 rounded-full border px-3 ${small ? 'py-0.5 text-[11px]' : 'py-1 text-[12px]'}`}
            style={{
              borderColor: on ? 'var(--c-accent)' : 'var(--c-edge)',
              background: on ? 'var(--c-accent-soft)' : 'transparent',
              color: on ? 'var(--c-accent)' : 'var(--c-ink-muted)',
              fontWeight: on ? 600 : 400,
            }}
          >
            {chip}
          </button>
        );
      })}
    </div>
  );
}

const isElement = (overlay: Overlay): overlay is Overlay & { readonly content: ElementContent } =>
  overlay.content.kind === 'shape' || overlay.content.kind === 'sticker' || overlay.content.kind === 'counter';

/**
 * The shapes, stickers and numbers already on the design (D-138): a tap
 * picks one — the only way to reach one hidden under another in an image —
 * and × deletes it.
 */
function OnThisDesign({
  overlays,
  palette,
  onDone,
}: {
  overlays: readonly Overlay[];
  palette: Parameters<typeof ElementPreview>[0]['palette'];
  onDone: () => void;
}): React.JSX.Element | null {
  const clock = usePreviewClock();
  const elements = overlays.filter(isElement);
  if (elements.length === 0) return null;

  const pick = (overlay: Overlay): void => {
    const s = useEditor.getState();
    // In a video, go to where it shows, so its box is on the picture to drag.
    if (s.project.mode === 'motionAd' && (s.playheadMs < overlay.startMs || s.playheadMs >= overlay.endMs)) {
      clock?.pause();
      clock?.seek(overlay.startMs);
    }
    s.selectOverlay(overlay.id);
    onDone();
  };
  const remove = (overlay: Overlay): void => {
    const s = useEditor.getState();
    s.dispatch(actions.removeOverlay(overlay.id));
    if (s.selectedOverlay === overlay.id) s.selectOverlay(null);
    s.showToast(`Deleted ${overlayLabel(overlay)}. ${undoHint()}`);
  };

  return (
    <section className="mb-4" aria-label="On this design">
      <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">On it now · {elements.length}</h3>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" data-element-current>
        {elements.map((overlay) => (
          <div key={overlay.id} className="relative shrink-0">
            <button
              type="button"
              onClick={() => { pick(overlay); }}
              aria-label={`Select ${overlayLabel(overlay)}`}
              title={elementName(overlay.content)}
              className="block overflow-hidden rounded-md border border-edge hover:border-accent focus:border-accent focus:outline-none"
            >
              <span className="block" style={{ background: palette.bg }}>
                <ElementPreview content={overlay.content} active={false} palette={palette} size={60} seed={overlay.id} />
              </span>
              <span className="block w-[60px] truncate px-1 py-0.5 text-[10px]">{elementName(overlay.content)}</span>
            </button>
            <button
              type="button"
              onClick={() => { remove(overlay); }}
              aria-label={`Delete ${overlayLabel(overlay)}`}
              className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full border border-edge bg-panel text-[11px] leading-none text-ink-muted shadow-sm hover:text-danger"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * Where a new element goes: the middle of the picture, stepped down and
 * across for each element already sitting there, so a second star does not
 * land exactly on the first.
 */
export function spotFor(overlays: readonly Overlay[]): { x: number; y: number } {
  const near = (x: number, y: number): boolean => overlays.some((o) => {
    if (!isElement(o)) return false;
    const ox = o.transform.x ?? 0.5;
    const oy = o.transform.y ?? 0.5;
    return Math.abs(ox - x) < 0.02 && Math.abs(oy - y) < 0.02;
  });
  let step = 0;
  while (step < 8 && near(0.5 + step * 0.04, 0.5 + step * 0.04)) step++;
  return { x: 0.5 + step * 0.04, y: 0.5 + step * 0.04 };
}
