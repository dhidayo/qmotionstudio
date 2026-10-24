import type { ReactNode } from 'react';
import * as actions from '@/document/actions';
import type { ElementPatch } from '@/document/actions';
import type { CounterContent, CounterEase, CounterFormat, Overlay, ShapeContent, ShapeKind, StickerContent } from '@/document/types';
import { COUNTER_AFFIX_MAX, COUNTER_LIMIT, SHAPE_KINDS, SHAPE_NAMES, switchShape } from '@/document/elements';
import { stickerDef } from '@/core/stickers/catalog';
import { resolvePaint } from '@/core/render/paint';
import { DESIGN_SHORT_EDGE } from '@/core/render/bounds';
import { needsExtendedSubset } from '@/fonts/registry';
import { useEditor } from '@/state/store';
import { useOverlays } from '@/ui/shell/overlays';
import { ShapeIcon } from '@/ui/elements/shapeIcons';
import { ELEMENT_SECTIONS } from '@/ui/editing/commands';
import {
  Button, ElementColorField, EmptyNote, NumberField, Row, Section, Segmented, Slider, Stepper, TextInput, Toggle,
} from './controls';

/**
 * The settings of the elements people add (D-158) — a shape's form and
 * colours, a sticker's words and pace, where a number counts from and to.
 * Each is a section named for the thing, first in the overlay panel, so a
 * double-click on the picture or the toolbar's own button opens it.
 */

type Patch<K extends 'shape' | 'sticker' | 'counter'> = (fields: ElementPatch<K>, coalesce?: string) => void;

function usePatch<K extends 'shape' | 'sticker' | 'counter'>(id: string, kind: K, label: string): Patch<K> {
  const dispatch = useEditor((s) => s.dispatch);
  return (fields, coalesce) => {
    dispatch(actions.patchOverlayContent(id, kind, fields, {
      label,
      ...(coalesce === undefined ? {} : { coalesceKey: `${kind}:${id}:${coalesce}` }),
    }));
  };
}

/** Fractions of the short edge, shown as pixels of a 1080 frame — what a thickness slider means to people. */
const toPx = (fraction: number): number => Math.round(fraction * DESIGN_SHORT_EDGE);
const fromPx = (px: number): number => px / DESIGN_SHORT_EDGE;

// ── Shape ───────────────────────────────────────────────────────────────────

/** Which shapes have corners worth rounding. */
const CORNERED: ReadonlySet<ShapeKind> = new Set(['rect', 'roundedRect', 'triangle', 'diamond', 'hexagon', 'star', 'arrow', 'bubble']);

export function ShapeSection({ overlay, content }: { overlay: Overlay; content: ShapeContent }): React.JSX.Element {
  const { id } = overlay;
  const dispatch = useEditor((s) => s.dispatch);
  const endInteraction = useEditor((s) => s.endInteraction);
  const patch = usePatch(id, 'shape', 'Change shape');
  const line = content.shape === 'line';
  const outlined = content.stroke !== null;

  return (
    <Section title={ELEMENT_SECTIONS.shape}>
      <Row label="Shape">
        <div role="group" aria-label="Shape" className="grid grid-cols-7 gap-1">
          {SHAPE_KINDS.map((kind) => {
            const active = kind === content.shape;
            return (
              <button
                key={kind}
                type="button"
                aria-pressed={active}
                aria-label={SHAPE_NAMES[kind]}
                title={SHAPE_NAMES[kind]}
                onClick={() => {
                  dispatch(actions.setOverlayContent(id, switchShape(content, kind), 'Change shape'));
                  endInteraction();
                }}
                className="grid aspect-square place-items-center rounded-md border"
                style={{
                  borderColor: active ? 'var(--c-accent)' : 'var(--c-edge)',
                  background: active ? 'var(--c-accent-soft)' : 'transparent',
                  color: active ? 'var(--c-accent)' : 'var(--c-ink-muted)',
                }}
              >
                <ShapeIcon shape={kind} size={18} />
              </button>
            );
          })}
        </div>
      </Row>

      {!line && (
        <ElementColorField
          label="Fill"
          value={content.fill}
          allowNone
          onChange={(fill) => { patch({ fill: fill ?? null }, 'fill'); }}
        />
      )}
      <ElementColorField
        label={line ? 'Colour' : 'Outline'}
        value={content.stroke}
        allowNone={!line}
        onChange={(stroke) => { patch({ stroke: stroke ?? null }, 'stroke'); }}
      />
      {(line || outlined) && (
        <Slider
          label={line ? 'Thickness' : 'Outline width'}
          value={toPx(content.strokeWidth)}
          min={1}
          max={40}
          suffix="px"
          onChange={(px) => { patch({ strokeWidth: fromPx(px) }, 'strokeWidth'); }}
        />
      )}
      {!line && content.fill === null && !outlined && (
        <EmptyNote>With no fill and no outline the shape cannot be seen. Give it one or the other.</EmptyNote>
      )}

      {CORNERED.has(content.shape) && (
        <Slider
          label="Round corners"
          value={Math.round(content.corner * 100)}
          min={0}
          max={100}
          suffix="%"
          onChange={(v) => { patch({ corner: v / 100 }, 'corner'); }}
        />
      )}

      {(content.shape === 'star' || content.shape === 'badge') && (
        <>
          <Stepper
            label={content.shape === 'star' ? 'Points' : 'Scallops'}
            value={content.points ?? (content.shape === 'star' ? 5 : 18)}
            min={content.shape === 'star' ? 3 : 8}
            max={content.shape === 'star' ? 12 : 32}
            onChange={(points) => { patch({ points }); }}
          />
          <Slider
            label={content.shape === 'star' ? 'Inner size' : 'Edge depth'}
            value={Math.round((content.inner ?? (content.shape === 'star' ? 0.45 : 0.86)) * 100)}
            min={20}
            max={95}
            suffix="%"
            onChange={(v) => { patch({ inner: v / 100 }, 'inner'); }}
          />
        </>
      )}

      {line && (
        <Segmented
          label="Arrowheads"
          value={content.heads ?? 'none'}
          options={[
            { value: 'none' as const, label: 'None' },
            { value: 'end' as const, label: 'One end' },
            { value: 'both' as const, label: 'Both ends' },
          ]}
          onChange={(heads) => { patch({ heads }); endInteraction(); }}
        />
      )}

      {content.shape === 'bubble' && (
        <Segmented
          label="Tail"
          value={content.tail ?? 'left'}
          options={[
            { value: 'left' as const, label: 'Left' },
            { value: 'center' as const, label: 'Middle' },
            { value: 'right' as const, label: 'Right' },
          ]}
          onChange={(tail) => { patch({ tail }); endInteraction(); }}
        />
      )}

      <Slider
        label={line ? 'Length' : 'Width'}
        value={Math.round(content.w * 100)}
        min={2}
        max={250}
        suffix="%"
        onChange={(v) => { patch({ w: v / 100 }, 'w'); }}
      />
      {!line && (
        <Slider
          label="Height"
          value={Math.round(content.h * 100)}
          min={2}
          max={250}
          suffix="%"
          onChange={(v) => { patch({ h: v / 100 }, 'h'); }}
        />
      )}
      <div className="mt-1.5 grid grid-cols-2 gap-1">
        {(line || outlined) && (
          <Toggle checked={content.dash === true} onChange={(dash) => { patch({ dash }); endInteraction(); }} label="Dashed" />
        )}
        <Toggle checked={content.shadow} onChange={(shadow) => { patch({ shadow }); endInteraction(); }} label="Shadow" />
      </div>
    </Section>
  );
}

// ── Sticker ─────────────────────────────────────────────────────────────────

export function StickerSection({ overlay, content }: { overlay: Overlay; content: StickerContent }): React.JSX.Element {
  const { id } = overlay;
  const endInteraction = useEditor((s) => s.endInteraction);
  const palette = useEditor((st) => (st.project.scenes[st.selectedScene] ?? st.project.scenes[0])?.inputs.look.palette);
  const patch = usePatch(id, 'sticker', 'Change sticker');
  const dispatch = useEditor((s) => s.dispatch);
  const def = stickerDef(content.sticker);
  const change = (): void => { useOverlays.getState().openElementPicker({ category: 'Stickers', replace: id }); };
  // Back to the sticker's own colour: the setting goes, rather than holding a copy of today's.
  const ownColour = (key: 'primary' | 'secondary'): void => {
    const { [key]: _gone, ...rest } = content;
    dispatch(actions.setOverlayContent(id, rest, 'Change sticker'));
  };

  if (!def) {
    return (
      <Section title={ELEMENT_SECTIONS.sticker}>
        <EmptyNote>This sticker comes from a newer version of the app, so it cannot be shown here. Choose another, or delete it.</EmptyNote>
        <div className="flex"><Button variant="accent" onClick={change}>Change sticker…</Button></div>
      </Section>
    );
  }

  const swatch = (paint: typeof def.primary): string => (palette ? resolvePaint(paint, palette) : '#888888');

  return (
    <Section title={ELEMENT_SECTIONS.sticker}>
      <Row label="Sticker" hint={def.category}>
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{def.name}</span>
          <div className="flex w-36 shrink-0"><Button onClick={change}>Change sticker…</Button></div>
        </div>
      </Row>

      {(def.labels ?? []).map((label) => (
        <Row key={label.key} label={label.name}>
          <TextInput
            label={label.name}
            value={content.labels?.[label.key] ?? label.text}
            placeholder={label.text}
            maxLength={label.maxChars}
            onChange={(text) => { patch({ labels: { ...content.labels, [label.key]: text } }, `label:${label.key}`); }}
          />
        </Row>
      ))}

      <ElementColorField
        label="Main colour"
        value={content.primary}
        own={{ name: 'The sticker’s own', swatch: swatch(def.primary) }}
        onChange={(primary) => { if (primary === undefined) ownColour('primary'); else patch({ primary }, 'primary'); }}
      />
      <ElementColorField
        label="Second colour"
        value={content.secondary}
        own={{ name: 'The sticker’s own', swatch: swatch(def.secondary) }}
        onChange={(secondary) => { if (secondary === undefined) ownColour('secondary'); else patch({ secondary }, 'secondary'); }}
      />

      <Segmented
        label="Animation"
        value={content.play}
        options={[
          { value: 'loop' as const, label: 'Plays' },
          { value: 'still' as const, label: 'Still' },
        ]}
        onChange={(play) => { patch({ play }); endInteraction(); }}
      />
      {content.play === 'loop' && (
        <Slider
          label="Speed"
          value={Math.round(content.speed * 100)}
          min={25}
          max={300}
          step={5}
          suffix="%"
          onChange={(v) => { patch({ speed: v / 100 }, 'speed'); }}
        />
      )}
      {def.flippable === true && (
        <Toggle checked={content.flip === true} onChange={(flip) => { patch({ flip }); endInteraction(); }} label="Flip" />
      )}
    </Section>
  );
}

// ── Number ──────────────────────────────────────────────────────────────────

const SEPARATORS: readonly { readonly value: CounterFormat['grouping']; readonly label: string }[] = [
  { value: 'comma', label: '1,000' },
  { value: 'space', label: '1 000' },
  { value: 'dot', label: '1.000' },
  { value: 'none', label: '1000' },
];

const FEELS: readonly { readonly value: CounterEase; readonly label: string }[] = [
  { value: 'smooth', label: 'Smooth' },
  { value: 'steady', label: 'Steady' },
  { value: 'snappy', label: 'Snappy' },
  { value: 'gentle', label: 'Gentle' },
];

/** `children` are the text style controls, shared with captions. */
export function CounterSection({
  overlay,
  content,
  children,
}: {
  overlay: Overlay;
  content: CounterContent;
  children: ReactNode;
}): React.JSX.Element {
  const { id } = overlay;
  const endInteraction = useEditor((s) => s.endInteraction);
  const patch = usePatch(id, 'counter', 'Change number');
  const format = (fields: Partial<CounterFormat>, coalesce?: string): void => {
    patch({ format: { ...content.format, ...fields } }, coalesce);
  };
  const counts = content.from !== content.to;
  const affixes = `${content.format.prefix}${content.format.suffix}`;

  return (
    <Section title={ELEMENT_SECTIONS.counter}>
      <div className="grid grid-cols-2 gap-2">
        <Row label="Counts from">
          <NumberField label="Counts from" value={content.from} min={-COUNTER_LIMIT} max={COUNTER_LIMIT} onChange={(from) => { patch({ from }); }} />
        </Row>
        <Row label="To">
          <NumberField label="Counts to" value={content.to} min={-COUNTER_LIMIT} max={COUNTER_LIMIT} onChange={(to) => { patch({ to }); }} />
        </Row>
        <Row label="Before it">
          <TextInput label="Before the number" value={content.format.prefix} placeholder="$" maxLength={COUNTER_AFFIX_MAX} onChange={(prefix) => { format({ prefix }, 'prefix'); }} />
        </Row>
        <Row label="After it">
          <TextInput label="After the number" value={content.format.suffix} placeholder="%" maxLength={COUNTER_AFFIX_MAX} onChange={(suffix) => { format({ suffix }, 'suffix'); }} />
        </Row>
      </div>
      {needsExtendedSubset(affixes) && (
        <EmptyNote>Some of these characters may show in a different typeface from the number.</EmptyNote>
      )}
      {!counts && <EmptyNote>The same number at both ends shows it without counting — a step, a rank, a price.</EmptyNote>}

      <Segmented
        label="Decimals"
        value={content.format.decimals}
        options={[{ value: 0 as const, label: '1' }, { value: 1 as const, label: '1.5' }, { value: 2 as const, label: '1.25' }]}
        onChange={(decimals) => { format({ decimals }); endInteraction(); }}
      />
      <Segmented
        label="Thousands"
        value={content.format.grouping === 'apostrophe' ? 'comma' : content.format.grouping}
        options={SEPARATORS}
        onChange={(grouping) => { format({ grouping }); endInteraction(); }}
      />
      <Toggle
        checked={content.format.compact}
        onChange={(compact) => { format({ compact }); endInteraction(); }}
        label="Short form — 1.2K, 3.4M"
      />
      {counts && (
        <>
          <div className="mt-2.5" />
          <Slider
            label="Counts for"
            value={Math.round(content.countMs / 100) / 10}
            min={0.2}
            max={10}
            step={0.1}
            suffix="s"
            onChange={(s) => { patch({ countMs: Math.round(s * 1000) }, 'countMs'); }}
          />
          <Slider
            label="Starts after"
            value={Math.round(content.delayMs / 100) / 10}
            min={0}
            max={5}
            step={0.1}
            suffix="s"
            onChange={(s) => { patch({ delayMs: Math.round(s * 1000) }, 'delayMs'); }}
          />
          <Segmented
            label="Feel"
            value={content.ease}
            options={FEELS}
            onChange={(ease) => { patch({ ease }); endInteraction(); }}
            columns={4}
          />
        </>
      )}
      <div className="mt-3 border-t border-edge pt-3">{children}</div>
    </Section>
  );
}
