import { colorFill, roleFill, type Layer, type Paint, type PaletteRole, type SlotRef, type Stroke } from '@/core/types';
import type { SceneInputs, ShapeOverride, SlotKey } from '@/document/types';
import { elementPaint } from './elements';
import { withAlpha } from './paint';
import { slotKey, slotOf } from './slots';

/**
 * A design's own parts, as the person changed them (D-159).
 *
 * "When you select some templates, they have some elements that are fixed and
 * cannot be selected or moved, or deleted." A part is a layer a template
 * tagged `shape:<name>` — a pill, a brand mark, the box behind highlighted
 * words — and this is where the person's colour, outline and deletion are
 * put on it. Like the nudges, it runs after the build (in `placed()`), never
 * inside it: dragging a colour picker repaints the next frame without
 * rebuilding, which is D-006's promise kept for parts too.
 *
 * It also carries a text slot's own colour onto every layer set in that
 * slot's style (`styleOf`), which fixed a real bug: the build memo left a
 * text's colour out of its key, so the preview kept a colour the export had
 * already changed.
 */

type Overrides = Readonly<Record<SlotKey, ShapeOverride>>;

/** The colour of each text slot the person set one for. */
function textColours(inputs: SceneInputs): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  for (const [id, style] of Object.entries(inputs.styleOverrides.texts)) {
    if (style.color !== undefined && style.color.length > 0) out.set(id, style.color);
  }
  return out;
}

export function hasShapeStyles(inputs: SceneInputs): boolean {
  return Object.keys(inputs.shapeOverrides ?? {}).length > 0 || textColours(inputs).size > 0;
}

/** A cache key for the overrides; empty when there are none. */
export function shapeStylesKey(inputs: SceneInputs): string {
  if (!hasShapeStyles(inputs)) return '';
  const overrides = inputs.shapeOverrides ?? {};
  return JSON.stringify([
    Object.keys(overrides).sort().map((key) => [key, overrides[key] ?? null]),
    [...textColours(inputs)].sort(([a], [b]) => a.localeCompare(b)),
  ]);
}

/** The role a part's colour is: as the template says, or its first fill's. */
export function tintOf(layer: Layer): PaletteRole {
  const slot = slotOf(layer);
  if (slot?.kind === 'shape' && slot.tint !== undefined) return slot.tint;
  for (const paint of paintsIn(layer)) {
    if (paint.kind === 'role' && paint.role !== 'onAccent') return paint.role;
  }
  return 'accent';
}

/** Every paint a layer and its children draw with. */
function* paintsIn(layer: Layer): Generator<Paint> {
  switch (layer.type) {
    case 'shape':
      yield layer.props.fill;
      if (layer.props.stroke) yield layer.props.stroke.paint;
      return;
    case 'gradient':
      for (const stop of layer.props.stops) yield stop.paint;
      return;
    case 'text':
      yield layer.props.fill;
      return;
    case 'group':
    case 'mask':
      for (const child of layer.children) yield* paintsIn(child);
      return;
    default:
      return;
  }
}

/** The role of a part's edge of another colour, when it is a palette role. */
function outlineRoleOf(layer: Layer, tint: PaletteRole): { outlineRole?: PaletteRole } {
  if (layer.type === 'shape') {
    const paint = layer.props.stroke?.paint;
    return paint?.kind === 'role' && paint.role !== tint && paint.role !== 'onAccent' ? { outlineRole: paint.role } : {};
  }
  if (layer.type === 'group' || layer.type === 'mask') {
    for (const child of layer.children) {
      const found = outlineRoleOf(child, tint);
      if (found.outlineRole) return found;
    }
  }
  return {};
}

/** Whether a part has an edge of another colour than its own — a chip's hairline — that can be recoloured on its own. */
function hasOutline(layer: Layer, tint: PaletteRole): boolean {
  if (layer.type === 'shape') {
    const stroke = layer.props.stroke?.paint;
    return stroke !== undefined && !(stroke.kind === 'role' && stroke.role === tint);
  }
  if (layer.type === 'group' || layer.type === 'mask') return layer.children.some((child) => hasOutline(child, tint));
  return false;
}

/**
 * Returns `layers` with the person's part changes and text colours applied.
 * The same array when nothing applies, so the caller's cache keeps it.
 */
export function applyShapeStyles(layers: readonly Layer[], inputs: SceneInputs): readonly Layer[] {
  if (!hasShapeStyles(inputs)) return layers;
  return restyle(layers, inputs.shapeOverrides ?? {}, textColours(inputs));
}

function restyle(layers: readonly Layer[], overrides: Overrides, colours: ReadonlyMap<string, string>): readonly Layer[] {
  // Deleted parts among these siblings, and what their followers sat on.
  const hidden = new Set<string>();
  /** A text a backing follows, by key: the backing's new colour, or 'bare' when it is gone. */
  const under = new Map<string, Paint | 'bare'>();
  /** The same, by the part's own key, for words that follow the part they sit on (a seal's, a card's). */
  const parts = new Map<string, Paint | 'bare'>();
  for (const layer of layers) {
    const slot = slotOf(layer);
    if (slot?.kind !== 'shape') continue;
    const key = slotKey(slot);
    const override = overrides[key];
    if (!override) continue;
    const now = override.hidden === true ? 'bare' : override.color ? elementPaint(override.color) ?? roleFill('accent') : undefined;
    if (override.hidden === true) hidden.add(key);
    if (now === undefined) continue;
    parts.set(key, now);
    if (layer.follows !== undefined) under.set(layer.follows, now);
  }

  let changed = false;
  const out: Layer[] = [];
  for (const layer of layers) {
    const slot = slotOf(layer);
    const key = slot ? slotKey(slot) : null;
    /*
     * A deleted part goes, and so does the decoration that only moved with it
     * (a shadow, a sheen). Anything with a slot of its own — words, a photo,
     * another part — stays where it is: deleting a card never deletes its words.
     */
    if ((key !== null && hidden.has(key)) || (key === null && layer.follows !== undefined && hidden.has(layer.follows))) {
      changed = true;
      continue;
    }
    let next = layer;
    const override = key === null ? undefined : overrides[key];
    if (slot?.kind === 'shape' && override && (override.color || override.outline)) {
      next = recolour(next, tintOf(layer), override.color ? elementPaint(override.color) : null, override.outline ? elementPaint(override.outline) : null);
    }
    if (next.type === 'group' || next.type === 'mask') {
      const children = restyle(next.children, overrides, colours);
      if (children !== next.children) next = next.type === 'group' ? { ...next, children } : { ...next, children };
    }
    if (next.type === 'text') {
      let fill = next.props.fill;
      // Words on a backing read on whatever colour the backing now is.
      const backing = (key === null ? undefined : under.get(key)) ?? (layer.follows === undefined ? undefined : parts.get(layer.follows));
      // Only words drawn *on* the backing (in what reads on the accent); a footer beside its rule keeps its colour.
      if (backing !== undefined && fill.kind === 'role' && fill.role === 'onAccent') {
        fill = backing === 'bare' ? roleFill('ink') : { kind: 'on', of: backing };
      }
      // The slot's own colour, chosen in Text, always wins.
      const style = next.props.styleOf;
      const colour = style === undefined ? undefined : colours.get(style);
      if (colour !== undefined) fill = colorFill(colour);
      if (fill !== next.props.fill) next = { ...next, props: { ...next.props, fill } };
    }
    if (next !== layer) changed = true;
    out.push(next);
  }
  return changed ? out : layers;
}

/**
 * A part in a new colour: every paint of its own role takes it, keeping its
 * transparency; lettering drawn on the accent reads on the new colour; the
 * outline, when there is one of another colour, takes `outline`.
 */
function recolour(layer: Layer, tint: PaletteRole, color: Paint | null, outline: Paint | null, fixed = !usesRole(layer, tint)): Layer {
  const paint = (p: Paint): Paint => {
    // A part drawn in fixed colours — a LIVE badge's red — takes the new one on its shapes (D-159).
    if (color !== null && fixed && p.kind === 'color' && layer.type !== 'text') return color;
    if (color === null || p.kind !== 'role') return p;
    if (p.role === tint) return withOpacity(color, p.alpha);
    if (p.role === 'onAccent' && tint === 'accent') return p.alpha === undefined ? { kind: 'on', of: color } : { kind: 'on', of: color, alpha: p.alpha };
    return p;
  };
  const stroke = (s: Stroke): Stroke => {
    const own = s.paint.kind === 'role' && s.paint.role === tint;
    if (!own && outline !== null) return { ...s, paint: outline };
    return { ...s, paint: paint(s.paint) };
  };
  switch (layer.type) {
    case 'shape':
      return {
        ...layer,
        props: { ...layer.props, fill: paint(layer.props.fill), ...(layer.props.stroke ? { stroke: stroke(layer.props.stroke) } : {}) },
      };
    case 'gradient':
      return { ...layer, props: { ...layer.props, stops: layer.props.stops.map((s) => ({ ...s, paint: paint(s.paint) })) } };
    case 'text':
      return { ...layer, props: { ...layer.props, fill: paint(layer.props.fill) } };
    case 'group':
      return { ...layer, children: layer.children.map((child) => recolour(child, tint, color, outline, fixed)) };
    case 'mask':
      return { ...layer, children: layer.children.map((child) => recolour(child, tint, color, outline, fixed)) };
    default:
      return layer;
  }
}

/** Whether any paint of a part is its colour's palette role. */
function usesRole(layer: Layer, tint: PaletteRole): boolean {
  for (const paint of paintsIn(layer)) if (paint.kind === 'role' && paint.role === tint) return true;
  return false;
}

function withOpacity(color: Paint, alpha: number | undefined): Paint {
  if (alpha === undefined) return color;
  if (color.kind === 'role') return roleFill(color.role, (color.alpha ?? 1) * alpha);
  if (color.kind === 'color') return colorFill(withAlpha(color.value, alpha));
  return { ...color, alpha: (color.alpha ?? 1) * alpha };
}

/** A design's part, as the inspector lists it. */
export type PartInfo = {
  readonly key: SlotKey;
  readonly label: string;
  readonly tint: PaletteRole;
  readonly hasOutline: boolean;
  /** The palette role its outline is drawn in, for "As designed". */
  readonly outlineRole?: PaletteRole;
  readonly text?: Extract<SlotRef, { kind: 'shape' }>['text'];
  readonly pick: boolean;
};

/** Every part in a scene's layers, once each, in drawing order. */
export function partsIn(layers: readonly Layer[]): readonly PartInfo[] {
  const seen = new Set<string>();
  const out: PartInfo[] = [];
  const visit = (list: readonly Layer[]): void => {
    for (const layer of list) {
      const slot = slotOf(layer);
      if (slot?.kind === 'shape') {
        const key = slotKey(slot);
        if (!seen.has(key)) {
          seen.add(key);
          const tint = tintOf(layer);
          out.push({
            key,
            label: slot.label,
            tint,
            hasOutline: hasOutline(layer, tint),
            ...outlineRoleOf(layer, tint),
            ...(slot.text ? { text: slot.text } : {}),
            pick: slot.pick !== false,
          });
        }
      }
      if (layer.type === 'group' || layer.type === 'mask') visit(layer.children);
    }
  };
  visit(layers);
  return out;
}

/** Every slot in a scene's layers, nested ones included. */
function* slotsIn(layers: readonly Layer[]): Generator<SlotRef> {
  for (const layer of layers) {
    const slot = slotOf(layer);
    if (slot) yield slot;
    if (layer.type === 'group' || layer.type === 'mask') yield* slotsIn(layer.children);
  }
}

/** How many entries of a list text a scene draws, as words or as a part's numbers (D-159). */
export function entriesDrawn(layers: readonly Layer[], slotId: string): number {
  let count = 0;
  for (const slot of slotsIn(layers)) {
    const item = slot.kind === 'text' && slot.key === slotId ? slot.item
      : slot.kind === 'shape' && slot.text?.slot === slotId ? slot.text.item
      : undefined;
    if (item !== undefined) count = Math.max(count, item + 1);
  }
  return count;
}

/** What a scene's layers call the element with this key — a part's name, a list entry's — if they name it. */
export function labelIn(layers: readonly Layer[], key: SlotKey): string | null {
  for (const slot of slotsIn(layers)) {
    if (slotKey(slot) !== key) continue;
    if (slot.kind === 'shape') return slot.label;
    if (slot.kind === 'text' && slot.label !== undefined) return slot.label;
  }
  return null;
}
