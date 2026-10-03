import * as actions from '@/document/actions';
import type { TextStyle } from '@/document/types';
import { FONTS } from '@/fonts/registry';
import { useEditor } from '@/state/store';
import type { SceneTemplate, TextSlotDef } from '@/templates/schema';
import { resolveStyle } from '@/templates/_shared/text';
import { Button, ColorField, EmptyNote, Row, Section, Segmented, Slider, TextInput, Toggle } from '../controls';
import { SlotPlacement } from '../SlotPlacement';

const WEIGHTS: readonly { value: TextStyle['weight']; label: string }[] = [
  { value: 400, label: 'Regular' },
  { value: 500, label: 'Medium' },
  { value: 600, label: 'Semibold' },
  { value: 700, label: 'Bold' },
  { value: 800, label: 'Extra' },
];

/** §8.2. One block per text slot the template declares. */
export function TextTab({ template }: { template: SceneTemplate | null }): React.JSX.Element {
  if (!template) {
    return (
      <Section>
        <EmptyNote>Loading the template…</EmptyNote>
      </Section>
    );
  }

  if (template.textSlots.length === 0) {
    return (
      <Section>
        <EmptyNote>This design has no text of its own. Add words as a layer with <strong>+ Text</strong> under the preview.</EmptyNote>
      </Section>
    );
  }

  return (
    <div>
      {template.textSlots.map((slot) => (
        <TextSlotBlock key={slot.id} slot={slot} />
      ))}
    </div>
  );
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
    <SlotPlacement slotKey={`text:${slot.id}`} />
    <Section title={slot.label}>
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
            value={style.color.length > 0 ? style.color : '#ffffff'}
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
    </Section>
    </>
  );
}
