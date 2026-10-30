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
  switch (slot.kind) {
    case 'photo':
      return `photo:${slot.index}`;
    case 'text':
      // One entry of a list text has a key of its own (D-159): `text:steps#2`.
      return slot.item === undefined ? `text:${slot.key}` : `text:${slot.key}#${slot.item}`;
    case 'shape':
      return `shape:${slot.key}`;
  }
}

/** A slot key taken apart (D-159). */
export type ParsedSlotKey =
  | { readonly kind: 'photo'; readonly index: number }
  | { readonly kind: 'text'; readonly id: string; readonly item?: number }
  | { readonly kind: 'shape'; readonly name: string };

/**
 * The one place a slot key is read back (D-159). Callers used to slice
 * `text:` or match `photo:(\d+)` by hand, which a third kind of key — and a
 * list entry's `#2` — would have quietly broken. Null for anything else,
 * such as the logo's key.
 */
export function parseSlotKey(key: SlotKey): ParsedSlotKey | null {
  const photo = /^photo:(\d+)$/.exec(key);
  if (photo?.[1] !== undefined) return { kind: 'photo', index: Number(photo[1]) };
  const text = /^text:([^#]+)(?:#(\d+))?$/.exec(key);
  if (text?.[1] !== undefined) {
    return text[2] === undefined ? { kind: 'text', id: text[1] } : { kind: 'text', id: text[1], item: Number(text[2]) };
  }
  const shape = /^shape:(.+)$/.exec(key);
  if (shape?.[1] !== undefined) return { kind: 'shape', name: shape[1] };
  return null;
}

/** The slot a drawable belongs to, or null if the template did not tag it. */
export function slotOf(layer: Layer): SlotRef | null {
  switch (layer.type) {
    // With a design's own parts, shapes and gradients too (D-159).
    case 'image':
    case 'text':
    case 'group':
    case 'mask':
    case 'shape':
    case 'gradient':
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

  const moved = layers.map((layer) => applyToLayer(layer, transforms, design, layers));
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
    const own = slot ? transforms[slotKey(slot)]?.z ?? 0 : 0;
    /*
     * A part that follows another (D-159) is restacked with it: its own lift
     * plus its leader's. The sort is stable, so a pill brought to the front
     * with its words stays directly behind them.
     */
    if (layer.follows !== undefined) slots.push({ layer, index, z: own + (transforms[layer.follows]?.z ?? 0) });
    else if (slot) slots.push({ layer, index, z: own });
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
  siblings: readonly Layer[],
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

  // Carried by what it sits behind first (D-159), then moved on its own.
  const carried = carriedBy(walked, transforms, design, siblings);

  const slot = slotOf(carried);
  if (!slot) return carried;

  const transform = transforms[slotKey(slot)];
  // `z` is handled by `restack`, not here — a layer that has only been
  // restacked needs no new tracks.
  if (!transform || isIdentity(transform)) return carried;

  return { ...carried, tracks: nudgeTracks(carried.tracks, transform, design) };
}

/** The sibling a follower follows (D-159): the layer carrying that slot, which follows nothing itself. */
export function leaderOf(layer: Layer, siblings: readonly Layer[]): Layer | null {
  const key = layer.follows;
  if (key === undefined) return null;
  return siblings.find((sibling) => {
    const slot = slotOf(sibling);
    return slot !== null && sibling.follows === undefined && slotKey(slot) === key;
  }) ?? null;
}

/**
 * A follower moved with its leader (D-159): a pill with its words, a print's
 * white border with its photograph.
 *
 * The leader's nudge is a rigid move about the leader's own anchor A, which
 * is where `drawLayer` scales and turns it from: a point P of the follower
 * goes to A + o + R(r)·s·(P − A), and the follower's own scale and turn take
 * s and r too, so the pair moves as if it were one thing.
 */
function carriedBy(
  layer: Layer,
  transforms: Readonly<Record<SlotKey, SlotTransform>>,
  design: Size,
  siblings: readonly Layer[],
): Layer {
  const transform = layer.follows === undefined ? undefined : transforms[layer.follows];
  if (!transform || isIdentity(transform)) return layer;
  const leader = leaderOf(layer, siblings);
  if (!leader) return layer;
  return { ...layer, tracks: followTracks(layer, leader, transform, design) };
}

/** How often a carried path is sampled where it cannot be mapped exactly. */
const DENSE_MS = 33;

/**
 * The follower's tracks, carried. Kept exact where they can be — a move, or a
 * resize of a leader that stands still, maps every keyframe and keeps its
 * easing — and otherwise sampled every 33 ms and at every keyframe either
 * side has, so an overshooting entrance keeps its overshoot. (Resampling only
 * at the union of keyframes, as a moving nudge does, flattened it.)
 */
export function followTracks(layer: Layer, leader: Layer, t: SlotTransform, design: Size): Tracks {
  const { tracks } = layer;
  // The follower's local time, on the leader's clock.
  const shiftMs = layer.startMs - leader.startMs;
  const still = (track: readonly Keyframe[] | undefined): boolean =>
    !track || track.length === 0 || track.every((key) => key.v === track[0]?.v);
  const anchorStill = still(leader.tracks.x) && still(leader.tracks.y);
  const anchor = (ms: number): { x: number; y: number } => pointAt(leader.tracks, ms + shiftMs);

  if (!animatedNudge(t)) {
    const n = nudgeAt(t, 0);
    const sized: Tracks = n.scale === 1 ? {} : { scaleX: multiply(tracks.scaleX, n.scale), scaleY: multiply(tracks.scaleY, n.scale) };
    const turned: Tracks = n.rotation === 0 ? {} : { rotation: shift(tracks.rotation, n.rotation, 0) };
    if (n.rotation === 0 && (n.scale === 1 || anchorStill)) {
      // x' = (1 − s)·A + o + s·x, keyframe by keyframe.
      const a = anchor(0);
      const map = (track: readonly Keyframe[] | undefined, at: number, o: number): readonly Keyframe[] =>
        n.scale === 1
          ? shift(track, o, 0)
          : (track && track.length > 0 ? track : [{ t: 0, v: 0, ease: 'linear' as const }])
            .map((key) => ({ ...key, v: (1 - n.scale) * at + o + n.scale * key.v }));
      return { ...tracks, x: map(tracks.x, a.x, n.offsetX * design.w), y: map(tracks.y, a.y, n.offsetY * design.h), ...sized };
    }
    if (anchorStill && still(tracks.x) && still(tracks.y)) {
      const p = carry(pointAt(tracks, 0), anchor(0), n, design);
      return { ...tracks, x: [{ t: 0, v: p.x, ease: 'linear' }], y: [{ t: 0, v: p.y, ease: 'linear' }], ...sized, ...turned };
    }
    const at = denseTimes(layer, leader, t, shiftMs);
    const points = at.map((ms) => carry(pointAt(tracks, ms), anchor(ms), n, design));
    return {
      ...tracks,
      x: at.map((ms, i) => ({ t: ms, v: points[i]?.x ?? 0, ease: 'linear' })),
      y: at.map((ms, i) => ({ t: ms, v: points[i]?.y ?? 0, ease: 'linear' })),
      ...sized,
      ...turned,
    };
  }

  // A keyframed nudge: everything it changes, sampled.
  const at = denseTimes(layer, leader, t, shiftMs);
  const nudges = at.map((ms) => nudgeAt(t, ms + shiftMs));
  const points = at.map((ms, i) => carry(pointAt(tracks, ms), anchor(ms), nudges[i] ?? NO_SLOT_TRANSFORM, design));
  const keys = (pick: (ms: number, i: number) => number): Keyframe[] => at.map((ms, i) => ({ t: ms, v: pick(ms, i), ease: 'linear' }));
  return {
    ...tracks,
    x: keys((_, i) => points[i]?.x ?? 0),
    y: keys((_, i) => points[i]?.y ?? 0),
    scaleX: keys((ms, i) => (sampleTrack(tracks.scaleX ?? [], ms) ?? 1) * (nudges[i]?.scale ?? 1)),
    scaleY: keys((ms, i) => (sampleTrack(tracks.scaleY ?? [], ms) ?? 1) * (nudges[i]?.scale ?? 1)),
    rotation: keys((ms, i) => (sampleTrack(tracks.rotation ?? [], ms) ?? 0) + (nudges[i]?.rotation ?? 0)),
  };
}

function pointAt(tracks: Tracks, ms: number): { x: number; y: number } {
  return { x: sampleTrack(tracks.x ?? [], ms) ?? 0, y: sampleTrack(tracks.y ?? [], ms) ?? 0 };
}

/** Where a leader's nudge takes a point: A + o + R(r)·s·(P − A). */
export function carry(
  p: { readonly x: number; readonly y: number },
  a: { readonly x: number; readonly y: number },
  n: Omit<SlotPose, 'atMs'>,
  design: Size,
): { x: number; y: number } {
  const radians = (n.rotation * Math.PI) / 180;
  const dx = (p.x - a.x) * n.scale;
  const dy = (p.y - a.y) * n.scale;
  return {
    x: a.x + n.offsetX * design.w + dx * Math.cos(radians) - dy * Math.sin(radians),
    y: a.y + n.offsetY * design.h + dx * Math.sin(radians) + dy * Math.cos(radians),
  };
}

function denseTimes(layer: Layer, leader: Layer, t: SlotTransform, shiftMs: number): readonly number[] {
  const span = Math.max(0, layer.endMs - layer.startMs);
  const times = new Set<number>([0, span]);
  for (let ms = 0; ms <= span; ms += DENSE_MS) times.add(ms);
  for (const track of Object.values(layer.tracks)) for (const key of track) times.add(key.t);
  for (const key of [...(leader.tracks.x ?? []), ...(leader.tracks.y ?? [])]) times.add(key.t - shiftMs);
  for (const pose of t.poses ?? []) times.add(pose.atMs - shiftMs);
  return [...times].filter((ms) => ms >= 0 && ms <= span).sort((a, b) => a - b);
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
