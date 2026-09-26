import type { Keyframe, Layer, Size, SlotRef, Tracks } from '@/core/types';
import { NO_SLOT_TRANSFORM, type SlotKey, type SlotTransform } from '@/document/types';

/**
 * Applying a user's nudge to a template's own elements (B).
 *
 * §7 makes a template a pure `build(inputs, ctx) => Layer[]`, and that stays
 * true: this runs *after* the build, over the layers it produced. The template
 * still decides the layout and still owns the animation; a nudge is composed
 * on top of it.
 *
 * Composed into the layer's own tracks rather than wrapped in a group, because
 * a group scales and rotates about its origin while `drawLayer` scales and
 * rotates a layer about its own anchor. Only the second is what "make this
 * photo bigger" means — the first would send the photo sliding across the
 * frame as it grew.
 */

export function slotKey(slot: SlotRef): SlotKey {
  return slot.kind === 'photo' ? `photo:${slot.index}` : `text:${slot.key}`;
}

/** The slot a drawable belongs to, or null if the template did not tag it. */
export function slotOf(layer: Layer): SlotRef | null {
  if (layer.type === 'image' || layer.type === 'text') return layer.props.slot ?? null;
  return null;
}

/**
 * A cache key for a set of nudges.
 *
 * Empty when nothing has been touched, which is the case for every project
 * that never uses this feature — and `applySlotTransforms` is skipped
 * entirely on an empty key, so B costs those projects nothing at all.
 */
export function slotTransformKey(transforms: Readonly<Record<SlotKey, SlotTransform>>): string {
  const keys = Object.keys(transforms).sort();
  if (keys.length === 0) return '';
  return keys
    .map((key) => {
      const t = transforms[key];
      return t ? `${key}:${t.offsetX},${t.offsetY},${t.scale},${t.rotation},${t.z}` : '';
    })
    .join('|');
}

export function hasSlotTransforms(transforms: Readonly<Record<SlotKey, SlotTransform>>): boolean {
  return Object.keys(transforms).length > 0;
}

/**
 * Returns `layers` with every tagged drawable nudged.
 *
 * Recurses into groups and masks: a template is free to wrap a photo in
 * either, and a nudge that stopped at the first level would silently do
 * nothing for those templates.
 */
export function applySlotTransforms(
  layers: readonly Layer[],
  transforms: Readonly<Record<SlotKey, SlotTransform>>,
  design: Size,
): readonly Layer[] {
  if (!hasSlotTransforms(transforms)) return layers;

  const moved = layers.map((layer) => applyToLayer(layer, transforms, design));
  const next = restack(moved, transforms);

  // Identity when nothing matched, so the caller's cache can keep the original
  // array and callers comparing by reference are not fooled into redrawing.
  return next.some((layer, i) => layer !== layers[i]) ? next : layers;
}

/**
 * Reorders the scene's own elements by the user's stacking.
 *
 * Only the tagged drawables move, and they move *among the positions they
 * already occupied* — so the background, and any decoration the template drew
 * between them, stay exactly where they were. Sorting the whole array instead
 * made "send to back" mean behind the background, which simply erased the
 * photo: literally correct, and not what anybody means by sending something
 * back.
 *
 * A stable sort on (z, original position), so anything nobody has lifted keeps
 * the order the template chose.
 */
function restack(
  layers: readonly Layer[],
  transforms: Readonly<Record<SlotKey, SlotTransform>>,
): readonly Layer[] {
  const slots: { layer: Layer; index: number; z: number }[] = [];
  layers.forEach((layer, index) => {
    const slot = slotOf(layer);
    if (slot) slots.push({ layer, index, z: transforms[slotKey(slot)]?.z ?? 0 });
  });

  if (slots.length < 2 || slots.every((entry) => entry.z === 0)) return layers;

  const order = [...slots].sort((a, b) => a.z - b.z || a.index - b.index);
  const next = layers.slice();
  slots.forEach((entry, position) => {
    const moved = order[position];
    if (moved) next[entry.index] = moved.layer;
  });
  return next;
}

function applyToLayer(
  layer: Layer,
  transforms: Readonly<Record<SlotKey, SlotTransform>>,
  design: Size,
): Layer {
  if (layer.type === 'group' || layer.type === 'mask') {
    const children = applySlotTransforms(layer.children, transforms, design);
    return children === layer.children ? layer : { ...layer, children };
  }

  const slot = slotOf(layer);
  if (!slot) return layer;

  const transform = transforms[slotKey(slot)];
  // `z` is handled by `restack`, not here — a layer that has only been
  // restacked needs no new tracks.
  if (!transform || isIdentity(transform)) return layer;

  return { ...layer, tracks: nudgeTracks(layer.tracks, transform, design) };
}

function isIdentity(t: SlotTransform): boolean {
  return (
    t.offsetX === NO_SLOT_TRANSFORM.offsetX &&
    t.offsetY === NO_SLOT_TRANSFORM.offsetY &&
    t.scale === NO_SLOT_TRANSFORM.scale &&
    t.rotation === NO_SLOT_TRANSFORM.rotation
  );
}

/**
 * Offsets add, scale multiplies, rotation adds — across every keyframe.
 *
 * Doing it per keyframe rather than to a single value is what preserves the
 * template's motion: a photo that drifts across the scene keeps drifting, it
 * just drifts somewhere else. Replacing the track with one constant would
 * throw the animation away, which is the one thing a "nudge" must not do.
 */
function nudgeTracks(tracks: Tracks, t: SlotTransform, design: Size): Tracks {
  const next: Tracks = { ...tracks };

  const dx = t.offsetX * design.w;
  const dy = t.offsetY * design.h;

  if (dx !== 0) next.x = shift(tracks.x, dx, 0);
  if (dy !== 0) next.y = shift(tracks.y, dy, 0);
  if (t.scale !== 1) {
    next.scaleX = multiply(tracks.scaleX, t.scale);
    next.scaleY = multiply(tracks.scaleY, t.scale);
  }
  if (t.rotation !== 0) next.rotation = shift(tracks.rotation, t.rotation, 0);

  return next;
}

/**
 * A missing track means the prop sits at its default for the whole layer, so
 * an absent track becomes a single keyframe at the default plus the delta —
 * otherwise nudging a layer the template never animated would do nothing.
 */
function shift(
  track: readonly Keyframe[] | undefined,
  delta: number,
  fallback: number,
): readonly Keyframe[] {
  if (!track || track.length === 0) return [{ t: 0, v: fallback + delta, ease: 'linear' }];
  return track.map((kf) => ({ ...kf, v: kf.v + delta }));
}

function multiply(track: readonly Keyframe[] | undefined, factor: number): readonly Keyframe[] {
  if (!track || track.length === 0) return [{ t: 0, v: factor, ease: 'linear' }];
  return track.map((kf) => ({ ...kf, v: kf.v * factor }));
}
