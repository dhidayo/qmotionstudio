import { useEffect } from 'react';
import * as actions from '@/document/actions';
import { partsIn, type PartInfo } from '@/core/render/parts';
import { parseSlotKey } from '@/core/render/slots';
import type { PaletteRole } from '@/core/types';
import { useEditor } from '@/state/store';
import { useDrawnScene } from '@/ui/artboard/drawnScene';
import { deleteSlot } from '@/ui/editing/commands';
import { PART_SECTION, entryEditing } from '@/ui/editing/parts';
import { useOverlays } from '@/ui/shell/overlays';
import { Button, ElementColorField, EmptyNote, Row, Section, TextInput } from './controls';
import { SlotPlacement } from './SlotPlacement';

/**
 * A design's own parts in Style (D-159): "The T and the background box cannot
 * be modified, changed, or customized. Same with Episode 24 rounded
 * background."
 *
 * Two sections. **Shape** is the part picked on the canvas: its colour (the
 * design's, a palette colour, or one's own), its outline where it has one,
 * the letter or number it shows, where it sits, and deleting it — the same
 * colour row an added shape has (D-158), so a shape is a shape wherever it
 * came from. **Shapes in this design** lists every part, so one that was
 * deleted can be put back, and one too small to click can be found.
 */

/** The parts the selected scene drew, while it is the one on the canvas. */
function useSceneParts(): readonly PartInfo[] | null {
  const drawn = useDrawnScene((d) => d.drawn);
  const sceneId = useEditor((s) => s.project.scenes[s.selectedScene]?.id);
  if (!drawn || drawn.sceneId !== sceneId) return null;
  return partsIn(drawn.layers);
}

const swatchOf = (palette: Record<PaletteRole, string> | undefined, role: PaletteRole): string => palette?.[role] ?? '#888888';

/** The part picked on the canvas. */
export function SelectedPart(): React.JSX.Element | null {
  const key = useEditor((s) => s.selectedSlot);
  const parts = useSceneParts();
  const dispatch = useEditor((s) => s.dispatch);
  const inputs = useEditor((s) => s.project.scenes[s.selectedScene]?.inputs);
  const template = useEditor((s) => s.template);
  const drawn = useDrawnScene((d) => d.drawn);
  const focus = useOverlays((o) => o.inspectorSection);

  // "Colour" on the canvas brings this section into view, as Background does (D-120).
  useEffect(() => {
    if (focus !== PART_SECTION) return;
    document.querySelector(`[data-inspector-section="${PART_SECTION}"]`)?.closest('section')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    useOverlays.getState().focusInspectorSection(null);
  }, [focus]);

  // Another part picked: its settings in view, from the top (D-159).
  const isPart = key !== null && parseSlotKey(key)?.kind === 'shape';
  useEffect(() => {
    if (!isPart) return;
    document.querySelector(`[data-inspector-section="${PART_SECTION}"]`)?.closest('section')?.scrollIntoView({ block: 'nearest' });
  }, [key, isPart]);

  if (key === null || !isPart || !inputs) return null;
  const part = parts?.find((p) => p.key === key);
  if (!part) return null;
  const override = inputs.shapeOverrides?.[key];
  const palette = inputs.look.palette;
  const as = { name: 'As designed', swatch: swatchOf(palette, part.tint) };
  const editing = part.text ? entryEditing(part.text, inputs, template, drawn?.layers ?? null) : null;
  // What its words are called: the slot's own name ("Brand mark letter", "Featured badge"), or Number for one of a list.
  const wordsLabel = part.text?.item === undefined ? template?.textSlots.find((slot) => slot.id === part.text?.slot)?.label ?? 'Words' : 'Number';

  return (
    <Section title={PART_SECTION}>
      <div data-inspector-section={PART_SECTION} data-part-settings={key}>
        <p className="mb-2 text-[12px] font-semibold">{part.label}</p>
        <ElementColorField
          label="Colour"
          value={override?.color}
          own={as}
          onChange={(color) => { dispatch(actions.setShapeColor(key, color ?? null)); }}
        />
        {part.hasOutline && (
          <ElementColorField
            label="Outline"
            value={override?.outline}
            own={{ name: 'As designed', swatch: swatchOf(palette, part.outlineRole ?? 'inkMuted') }}
            onChange={(color) => { dispatch(actions.setShapeOutline(key, color ?? null)); }}
          />
        )}
        {editing && (
          <Row label={wordsLabel}>
            <TextInput
              label={wordsLabel}
              value={editing.text}
              {...(editing.maxLength === undefined ? {} : { maxLength: editing.maxLength })}
              onChange={(words) => { dispatch(editing.write(words)); }}
            />
            <p className="mt-1 text-[10px] text-ink-faint">Or double-click it on the picture and type.</p>
          </Row>
        )}
        <div className="flex">
          <Button variant="danger" onClick={() => { deleteSlot(key); }}>Delete shape</Button>
        </div>
      </div>
      <div className="mt-3">
        <SlotPlacement slotKey={key} />
      </div>
    </Section>
  );
}

/** Every part of the design, to find one, or put back one that was deleted. */
export function DesignShapes(): React.JSX.Element | null {
  const parts = useSceneParts();
  const overrides = useEditor((s) => s.project.scenes[s.selectedScene]?.inputs.shapeOverrides);
  const palette = useEditor((s) => s.project.scenes[s.selectedScene]?.inputs.look.palette);
  const selected = useEditor((s) => s.selectedSlot);
  const selectSlot = useEditor((s) => s.selectSlot);
  const dispatch = useEditor((s) => s.dispatch);
  if (!parts || parts.length === 0) return null;

  const hidden = parts.filter((p) => overrides?.[p.key]?.hidden === true);
  const colourOf = (p: PartInfo): string => {
    const own = overrides?.[p.key]?.color;
    if (own && 'hex' in own) return own.hex;
    const role = own && 'role' in own ? own.role : p.tint;
    return role === 'onAccent' ? '#ffffff' : swatchOf(palette, role);
  };

  return (
    <Section title={`Shapes in this design (${parts.length})`} defaultOpen={hidden.length > 0}>
      <div data-design-shapes>
        {hidden.length > 0 && (
          <p className="mb-2 text-[11px] text-ink-muted">
            {hidden.length === 1 ? 'One shape is deleted.' : `${hidden.length} shapes are deleted.`} Put back brings one back as it was.
          </p>
        )}
        <ul className="flex flex-col gap-1">
          {parts.map((p) => {
            const gone = overrides?.[p.key]?.hidden === true;
            const active = selected === p.key;
            return (
              <li key={p.key} data-part-row={p.key} className="flex items-center gap-2 rounded-md border px-2 py-1" style={{ borderColor: active ? 'var(--c-accent)' : 'var(--c-edge)' }}>
                <span aria-hidden className="size-3.5 shrink-0 rounded-full border border-edge" style={{ background: colourOf(p), opacity: gone ? 0.35 : 1 }} />
                <button
                  type="button"
                  disabled={gone}
                  onClick={() => { selectSlot(p.key, 'look'); }}
                  className="min-w-0 flex-1 truncate text-left text-[12px] disabled:cursor-default"
                  style={{ color: gone ? 'var(--c-ink-faint)' : 'var(--c-ink)' }}
                  title={p.pick ? 'Select it on the picture' : 'Its colour and effects — it is not picked on the picture'}
                >
                  {p.label}
                </button>
                {gone ? (
                  <button
                    type="button"
                    onClick={() => { dispatch(actions.showShape(p.key)); }}
                    className="shrink-0 rounded-md border border-edge px-2 py-0.5 text-[11px] hover:bg-panel-alt"
                  >
                    Put back
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
        {hidden.length > 1 && (
          <div className="mt-2 flex">
            <Button onClick={() => { dispatch(actions.showAllShapes()); }}>Put every shape back</Button>
          </div>
        )}
        {hidden.length === 0 && (
          <EmptyNote>Select a shape here or on the picture to change its colour, move it or delete it.</EmptyNote>
        )}
      </div>
    </Section>
  );
}
