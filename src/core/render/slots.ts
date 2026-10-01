import type { Keyframe, Layer, Size, SlotRef, Tracks } from '@/core/types';
import {
  NO_SLOT_TRANSFORM, type SlotKey, type SlotPose, type SlotTransform,
} from '@/document/types';
import { easeOf } from '@/document/select/overlay';
import { sampleTrack } from '@/core/anim/interpolate';

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
  switch (layer.type) {
    case 'image':
    case 'text':
    case 'group':
    case 'mask':
      return layer.props.slot ?? null;
    default:
      return null;
  }
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
      if (!t) return '';
      const path = (t.poses ?? [])
        .map((pose) => `${pose.atMs}/${pose.offsetX}/${pose.offsetY}/${pose.scale}/${pose.rotation}`)
        .join(';');
      return `${key}:${t.offsetX},${t.offsetY},${t.scale},${t.rotation},${t.z}[${path}]`;
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
  /*
   * A container is a coordinate space, so a nudge applied to its tracks moves
   * everything in it together — which is exactly right when the container is
   * the element, and why a tagged one takes the nudge itself rather than
   * passing it down (D-090). Children are still walked, for the ordinary case
   * of an untagged group holding tagged drawables.
   */
  const walked = ((): Layer => {
    if (layer.type !== 'group' && layer.type !== 'mask') return layer;
    const children = applySlotTransforms(layer.children, transforms, design);
    return children === layer.children ? layer : { ...layer, children };
  })();

  const slot = slotOf(walked);
  if (!slot) return walked;

  const transform = transforms[slotKey(slot)];
  // `z` is handled by `restack`, not here — a layer that has only been
  // restacked needs no new tracks.
  if (!transform || isIdentity(transform)) return walked;

  return { ...walked, tracks: nudgeTracks(walked.tracks, transform, design) };
}

function isIdentity(t: SlotTransform): boolean {
  if (animatedNudge(t)) return false;
  // Through `nudgeAt` for the same reason `constantNudge` does: with a single
  // pose the values that matter are the pose's, and reading the resting ones
  // declared a keyframed element untouched and skipped it entirely.
  const n = nudgeAt(t, 0);
  return (
    n.offsetX === NO_SLOT_TRANSFORM.offsetX &&
    n.offsetY === NO_SLOT_TRANSFORM.offsetY &&
    n.scale === NO_SLOT_TRANSFORM.scale &&
    n.rotation === NO_SLOT_TRANSFORM.rotation
  );
}

/**
 * Whether the user has turned keyframes on for this element.
 *
 * Distinct from `movingNudge` below, and the distinction matters: one pose is
 * keyframes *on* — the editor must say so, and a drag must write to that pose
 * rather than to the resting values — while being a constant as far as the
 * renderer is concerned. Conflating the two made the switch appear to do
 * nothing, because seeding the first pose left it reading "off".
 */
export function hasNudgePoses(t: SlotTransform): boolean {
  return (t.poses?.length ?? 0) > 0;
}

/** More than one pose is the only thing that makes a nudge time-varying. */
export function animatedNudge(t: SlotTransform): boolean {
  return (t.poses?.length ?? 0) > 1;
}

/** The poses, or the single implied one for a nudge that does not move. */
export function nudgePoses(t: SlotTransform): readonly SlotPose[] {
  const { poses } = t;
  if (poses && poses.length > 0) return poses;
  return [{ atMs: 0, offsetX: t.offsetX, offsetY: t.offsetY, scale: t.scale, rotation: t.rotation }];
}

/** The nudge at one moment, in scene time. */
export function nudgeAt(t: SlotTransform, atMs: number): SlotPose {
  const poses = nudgePoses(t);
  const only = poses[0];
  if (poses.length === 1 && only) return { ...only, atMs };

  const track = (pick: (pose: SlotPose) => number): readonly Keyframe[] =>
    poses.map((pose) => ({ t: pose.atMs, v: pick(pose), ease: easeOf(t.easing) }));

  return {
    atMs,
    offsetX: sampleTrack(track((pose) => pose.offsetX), atMs) ?? 0,
    offsetY: sampleTrack(track((pose) => pose.offsetY), atMs) ?? 0,
    scale: sampleTrack(track((pose) => pose.scale), atMs) ?? 1,
    rotation: sampleTrack(track((pose) => pose.rotation), atMs) ?? 0,
  };
}

function nudgeTracks(tracks: Tracks, t: SlotTransform, design: Size): Tracks {
  if (!animatedNudge(t)) return constantNudge(tracks, t, design);
  return movingNudge(tracks, t, design);
}

/**
 * A nudge that does not move: the template's motion, displaced.
 *
 * Every keyframe shifts by the same amount, so the shape of the motion is
 * preserved exactly — a photo that drifts across the scene keeps drifting, it
 * just drifts somewhere else. This is the common case and it is worth keeping
 * exact rather than routing it through the resampling below.
 */
function constantNudge(tracks: Tracks, t: SlotTransform, design: Size): Tracks {
  const next: Tracks = { ...tracks };

  /*
   * Through `nudgeAt`, not off the resting fields.
   *
   * With keyframes on but only one pose the nudge is still a constant — and
   * the constant is that pose, not the resting values it was seeded from. The
   * first version read the resting values and so ignored everything a single
   * keyframe said, which looked exactly like keyframes not working.
   */
  const n = nudgeAt(t, 0);
  const dx = n.offsetX * design.w;
  const dy = n.offsetY * design.h;

  if (dx !== 0) next.x = shift(tracks.x, dx, 0);
  if (dy !== 0) next.y = shift(tracks.y, dy, 0);
  if (n.scale !== 1) {
    next.scaleX = multiply(tracks.scaleX, n.scale);
    next.scaleY = multiply(tracks.scaleY, n.scale);
  }
  if (n.rotation !== 0) next.rotation = shift(tracks.rotation, n.rotation, 0);

  return next;
}

/**
 * A nudge with keyframes of its own, composed over the template's.
 *
 * Two motions have to become one track, and they do not share keyframe times.
 * So the result is sampled at the union of both sets: at every moment either
 * side has something to say, the composite records what the two say together.
 * Between those moments it interpolates, which is an approximation of
 * "template easing plus user easing" — and the right one, because both curves
 * are pinned at every point where either actually changes direction.
 *
 * Deliberately not used when the nudge is constant: there the exact answer is
 * cheap, and approximating something that needs no approximation would be a
 * quiet loss of fidelity for every project that never asked for this.
 */
function movingNudge(tracks: Tracks, t: SlotTransform, design: Size): Tracks {
  const poses = nudgePoses(t);
  const next: Tracks = { ...tracks };

  const times = (track: readonly Keyframe[] | undefined): readonly number[] => {
    const set = new Set<number>(poses.map((pose) => pose.atMs));
    for (const key of track ?? []) set.add(key.t);
    set.add(0);
    return [...set].sort((a, b) => a - b);
  };

  const compose = (
    track: readonly Keyframe[] | undefined,
    fallback: number,
    combine: (base: number, pose: SlotPose) => number,
  ): readonly Keyframe[] =>
    times(track).map((at) => ({
      t: at,
      v: combine(sampleTrack(track ?? [], at) ?? fallback, nudgeAt(t, at)),
      ease: easeOf(t.easing),
    }));

  next.x = compose(tracks.x, 0, (base, pose) => base + pose.offsetX * design.w);
  next.y = compose(tracks.y, 0, (base, pose) => base + pose.offsetY * design.h);
  next.scaleX = compose(tracks.scaleX, 1, (base, pose) => base * pose.scale);
  next.scaleY = compose(tracks.scaleY, 1, (base, pose) => base * pose.scale);
  next.rotation = compose(tracks.rotation, 0, (base, pose) => base + pose.rotation);

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
