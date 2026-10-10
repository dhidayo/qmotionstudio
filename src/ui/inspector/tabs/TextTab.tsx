import { useEffect, useState } from 'react';
import * as actions from '@/document/actions';
import type { Overlay, TextStyle } from '@/document/types';
import { DEFAULT_OVERLAY_TEXT_STYLE } from '@/document/defaults';
import { addLayer } from '@/ui/editing/addLayer';
import { deleteSlot, undoHint } from '@/ui/editing/commands';
import { Icon } from '@/ui/mobile/Icon';
import { TextStyleControls } from '../OverlayPanel';
import { FONTS } from '@/fonts/registry';
import { useEditor } from '@/state/store';
import type { SceneTemplate, TextSlotDef } from '@/templates/schema';
import { resolveStyle } from '@/templates/_shared/text';
import { Button, ColorField, EmptyNote, NoSectionTabs, Row, Section, Segmented, Slider, TextInput, Toggle } from '../controls';
import { SlotPlacement } from '../SlotPlacement';

const WEIGHTS: readonly { value: TextStyle['weight']; label: string }[] = [
  { value: 400, label: 'Regular' },
  { value: 500, label: 'Medium' },
  { value: 600, label: 'Semibold' },
  { value: 700, label: 'Bold' },
  { value: 800, label: 'Extra' },
];

/**
 * §8.2, as a list (D-124): every piece of text in the design — the design's
 * own and any added — as a tile that opens to its settings. "Is it possible to
 * have each text shown as collapsible element in the Text tab… then I can
 * delete the text element… new texts can be added to canvas and it will be on
 * the text element lists."
 *
 * A design's own text can be deleted and put back as it was; added text is a
 * layer of its own, deleted outright. Picking text on the canvas opens its
 * tile here.
 */
export function TextTab({ template }: { template: SceneTemplate | null }): React.JSX.Element {
  const selectedSlot = useEditor((s) => s.selectedSlot);
  const overlays = useEditor((s) => s.project.overlays);
  const corporate = useEditor((s) => s.project.mode === 'motionAd');
  const [open, setOpen] = useState<string | null>(() => (selectedSlot?.startsWith('text:') === true ? selectedSlot : null));
  // Low in the frame, where designs leave room, rather than over their headline.
  const addText = (): string => addLayer({ kind: 'text', text: 'Your text', style: DEFAULT_OVERLAY_TEXT_STYLE }, { x: 0.5, y: 0.78 });

  // Text picked on the canvas opens here — decided while rendering, as the
  // selection changes, rather than a render later.
  const [seen, setSeen] = useState(selectedSlot);
  if (selectedSlot !== seen) {
    setSeen(selectedSlot);
    if (selectedSlot?.startsWith('text:') === true) setOpen(selectedSlot);
  }
  useEffect(() => {
    if (selectedSlot?.startsWith('text:') !== true) return;
    document.querySelector(`[data-text-tile="${CSS.escape(selectedSlot)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedSlot]);

  if (!template) {
    return (
      <Section>
        <EmptyNote>Loading the template…</EmptyNote>
      </Section>
    );
  }

  const layers = overlays.filter((o): o is Overlay & { content: { kind: 'text' } } => o.content.kind === 'text');
  const toggle = (key: string): void => { setOpen((current) => (current === key ? null : key)); };

  return (
    <NoSectionTabs>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Text in this design</h3>
        <button
          type="button"
          data-add-text
          onClick={() => { const id = addText(); setOpen(`layer:${id}`); }}
          className="rounded-md bg-accent px-2.5 py-1 text-[12px] font-semibold text-accent-ink hover:bg-accent-hover"
        >
          + Add text
        </button>
      </div>

      {template.textSlots.length === 0 && layers.length === 0 && (
        <EmptyNote>This design has no text of its own. Add some with <strong>+ Add text</strong>.</EmptyNote>
      )}

      <div className="flex flex-col gap-1.5">
        {template.textSlots.map((slot) => (
          <SlotTile key={slot.id} slot={slot} open={open === `text:${slot.id}`} onToggle={() => { toggle(`text:${slot.id}`); }} />
        ))}
        {layers.map((layer, i) => (
          <LayerTile
            key={layer.id}
            layer={layer}
            index={i}
            timed={corporate}
            open={open === `layer:${layer.id}`}
            onToggle={() => { toggle(`layer:${layer.id}`); }}
          />
        ))}
      </div>
    </NoSectionTabs>
  );
}

/** The bar of a tile: what it is, what it says, and its one-tap actions. */
function TileHead({
  open,
  onToggle,
  name,
  says,
  removed,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  name: string;
  says: string;
  removed?: boolean;
  children?: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className={`brand-surface flex items-center gap-1 pr-1 ${open ? 'rounded-t-[7px]' : 'rounded-[7px]'}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-panel-alt"
      >
        <span aria-hidden className="inline-block w-3 shrink-0 text-center text-ink-faint transition-transform" style={{ transform: open ? 'rotate(90deg)' : 'none', transitionDuration: 'var(--t-fast)' }}>›</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[11px] font-semibold">{name}</span>
          <span className={`block truncate text-[11px] ${removed === true ? 'italic text-ink-faint' : 'text-ink-muted'}`}>{says}</span>
        </span>
      </button>
      {children}
    </div>
  );
}

function SlotTile({ slot, open, onToggle }: { slot: TextSlotDef; open: boolean; onToggle: () => void }): React.JSX.Element | null {
  const dispatch = useEditor((s) => s.dispatch);
  const value = useEditor((s) => s.project.scenes[s.selectedScene]?.inputs.texts[slot.id]);
  const selectSlot = useEditor((s) => s.selectSlot);
  const key = `text:${slot.id}`;
  // An empty text is a removed one: the design draws nothing there.
  const removed = value === '';
  const says = removed ? 'Removed' : value ?? slot.placeholder;

  return (
    <div data-text-tile={key} className="rounded-lg border" style={{ borderColor: open ? 'var(--c-accent)' : 'var(--c-edge)' }}>
      <TileHead
        open={open}
        onToggle={() => {
          // Opening a tile picks its text on the canvas, so you can see which it is.
          if (!open && !removed) selectSlot(key, 'text');
          onToggle();
        }}
        name={slot.label}
        says={says}
        removed={removed}
      >
        {removed ? (
          <button
            type="button"
            onClick={() => { dispatch(actions.restoreText(slot.id)); }}
            className="shrink-0 rounded-md border border-edge px-2 py-1 text-[11px] hover:bg-panel-alt"
          >
            Put back
          </button>
        ) : (
          <IconButton label={`Delete ${slot.label.toLowerCase()}`} onClick={() => { deleteSlot(key); }} />
        )}
      </TileHead>
      {open && !removed && (
        <div className="border-t border-edge px-2 pb-2 pt-3">
          <TextSlotBlock slot={slot} />
          <button
            type="button"
            onClick={() => { deleteSlot(key); }}
            className="mt-1 w-full rounded-md border px-2 py-1.5 text-[12px] font-semibold"
            style={{ borderColor: 'var(--c-danger)', color: 'var(--c-danger)' }}
          >
            Delete this text
          </button>
        </div>
      )}
      {open && removed && (
        <p className="border-t border-edge px-2.5 py-2 text-[11px] text-ink-muted">
          Deleted from the design. <strong>Put back</strong> brings it back as it was.
        </p>
      )}
    </div>
  );
}

function LayerTile({
  layer,
  index,
  timed,
  open,
  onToggle,
}: {
  layer: Overlay & { content: { kind: 'text' } };
  index: number;
  timed: boolean;
  open: boolean;
  onToggle: () => void;
}): React.JSX.Element {
  const dispatch = useEditor((s) => s.dispatch);
  const selectOverlay = useEditor((s) => s.selectOverlay);
  const showToast = useEditor((s) => s.showToast);
  const remove = (): void => {
    dispatch(actions.removeOverlay(layer.id));
    showToast(`Text deleted. ${undoHint()}`);
  };
  const when = timed ? ` · ${seconds(layer.startMs)}–${seconds(layer.endMs)}` : '';

  return (
    <div data-text-tile={`layer:${layer.id}`} className="rounded-lg border" style={{ borderColor: open ? 'var(--c-accent)' : 'var(--c-edge)' }}>
      <TileHead open={open} onToggle={onToggle} name={`Added text ${index + 1}${when}`} says={layer.content.text.length > 0 ? layer.content.text : 'Empty'}>
        <IconButton label={`Delete added text ${index + 1}`} onClick={remove} />
      </TileHead>
      {open && (
        <div className="border-t border-edge px-2 pb-2 pt-3">
          <div className="mb-2.5">
            <TextInput
              label="Overlay text"
              value={layer.content.text}
              placeholder="Say something"
              maxLength={120}
              multiline
              onChange={(text) => { dispatch(actions.setOverlayText(layer.id, text)); }}
            />
          </div>
          <TextStyleControls id={layer.id} style={layer.content.style} />
          <div className="mt-2 flex gap-1.5">
            <button
              type="button"
              onClick={() => { selectOverlay(layer.id); }}
              className="flex-1 rounded-md border border-edge px-2 py-1.5 text-[12px] hover:bg-panel-alt"
              title="Placement, motion, entrance and exit, effects"
            >
              More settings
            </button>
            <button
              type="button"
              onClick={remove}
              className="flex-1 rounded-md border px-2 py-1.5 text-[12px] font-semibold"
              style={{ borderColor: 'var(--c-danger)', color: 'var(--c-danger)' }}
            >
              Delete this text
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function IconButton({ label, onClick }: { label: string; onClick: () => void }): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid size-8 shrink-0 place-items-center rounded-md text-ink-faint hover:bg-panel-alt hover:text-[var(--c-danger)]"
    >
      <Icon name="trash" size={16} />
    </button>
  );
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function TextSlotBlock({ slot }: { slot: TextSlotDef }): React.JSX.Element {
  const dispatch = useEditor((s) => s.dispatch);
  const inputs = useEditor((s) => s.project.scenes[s.selectedScene]?.inputs);
  if (!inputs) return <EmptyNote>No scene.</EmptyNote>;

  const style = resolveStyle(slot, inputs);
  const value = inputs.texts[slot.id] ?? '';
  const override = inputs.styleOverrides.texts[slot.id];
  const hasOverrides = override !== undefined && Object.keys(override).length > 0;

  const patch = (
    fields: Partial<TextStyle>,
    options?: { label?: string; coalesceKey?: string },
  ): void => { dispatch(actions.setTextStyle(slot.id, fields, options)); };

  return (
    <>
    <div>
      <div className="mb-2.5">
        <TextInput
          label={slot.label}
          value={value}
          placeholder={slot.placeholder}
          maxLength={slot.maxChars}
          multiline={slot.maxChars > 48}
          onChange={(next) => { dispatch(actions.setText(slot.id, next)); }}
        />
        <p className="tabular mt-1 text-right text-[10px] text-ink-faint">
          {value.length}/{slot.maxChars}
        </p>
      </div>

      <Segmented
        label="Font"
        value={style.fontId}
        options={Object.values(FONTS)
          .filter((f) => f.family.length > 0)
          .map((f) => ({ value: f.id, label: f.label }))}
        onChange={(fontId) => { patch({ fontId }, { label: 'Change font' }); }}
      />

      <Segmented
        label="Weight"
        value={style.weight}
        columns={5}
        options={WEIGHTS}
        onChange={(weight) => { patch({ weight }, { label: 'Change weight' }); }}
      />

      <Segmented
        label="Alignment"
        value={style.align}
        options={[
          { value: 'left' as const, label: 'Left' },
          { value: 'center' as const, label: 'Centre' },
          { value: 'right' as const, label: 'Right' },
        ]}
        onChange={(align) => { patch({ align }, { label: 'Change alignment' }); }}
      />

      <Slider
        label="Size"
        value={style.sizePct}
        min={40}
        max={220}
        suffix="%"
        onChange={(sizePct) => { patch({ sizePct }, { label: 'Change size', coalesceKey: `size:${slot.id}` }); }}
      />

      <Row label="Colour">
        <div className="flex flex-col gap-1.5">
          <ColorField
            label="Text colour"
            value={style.color.length > 0 ? style.color : inputs.look.palette.ink}
            onChange={(color) => { patch({ color }, { label: 'Change colour', coalesceKey: `colour:${slot.id}` }); }}
          />
          {style.color.length > 0 && (
            <button
              type="button"
              onClick={() => { patch({ color: '' }, { label: 'Use palette colour' }); }}
              className="self-start text-[10px] underline"
              style={{ color: 'var(--c-ink-faint)' }}
            >
              Use the palette colour instead
            </button>
          )}
        </div>
      </Row>

      <Row label="Style">
        <div className="grid grid-cols-2 gap-1">
          <Toggle label="Wrap" checked={style.wrap} onChange={(wrap) => { patch({ wrap }, { label: 'Toggle wrap' }); }} />
          <Toggle label="Shadow" checked={style.shadow} onChange={(shadow) => { patch({ shadow }, { label: 'Toggle shadow' }); }} />
          <Toggle label="Outline" checked={style.outline} onChange={(outline) => { patch({ outline }, { label: 'Toggle outline' }); }} />
          <Toggle label="Pill" checked={style.pill} onChange={(pill) => { patch({ pill }, { label: 'Toggle pill' }); }} />
        </div>
      </Row>

      {style.wrap && (
        <Slider
          label="Wrap width"
          value={style.wrapWidthPct}
          min={30}
          max={100}
          suffix="%"
          onChange={(wrapWidthPct) => {
            patch({ wrapWidthPct }, { label: 'Change wrap width', coalesceKey: `wrap:${slot.id}` });
          }}
        />
      )}

      <Slider
        label="Letter spacing"
        value={style.letterSpacingPct}
        min={-8}
        max={30}
        suffix="%"
        onChange={(letterSpacingPct) => {
          patch({ letterSpacingPct }, { label: 'Change letter spacing', coalesceKey: `tracking:${slot.id}` });
        }}
      />

      {hasOverrides && (
        <div className="mt-1 flex">
          <Button
            onClick={() => {
              dispatch(
                actions.setTextStyle(
                  slot.id,
                  {
                    fontId: slot.defaultStyle.fontId ?? 'body',
                    weight: slot.defaultStyle.weight ?? 500,
                    align: slot.defaultStyle.align ?? 'center',
                    sizePct: slot.defaultStyle.sizePct ?? 100,
                    color: '',
                    wrap: slot.defaultStyle.wrap ?? true,
                    shadow: false,
                    outline: false,
                    pill: false,
                    wrapWidthPct: 100,
                    letterSpacingPct: slot.defaultStyle.letterSpacingPct ?? 0,
                  },
                  { label: 'Reset text style' },
                ),
              );
            }}
          >
            Reset to template style
          </Button>
        </div>
      )}
    </div>
    {/* Where it sits, its motion and its stacking: after what it says and how it looks. */}
    <div className="mt-3">
      <SlotPlacement slotKey={`text:${slot.id}`} />
    </div>
    </>
  );
}
