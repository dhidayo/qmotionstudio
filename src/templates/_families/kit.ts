import { colorFill, roleFill, type Aspect, type ImageProps, type Keyframe, type Layer, type Paint, type PaletteRole, type Rect, type Reveal, type SlotRef, type TextProps, type Tracks } from '@/core/types';
import { fontString } from '@/fonts/registry';
import type { SceneInputs, TextStyle } from '@/document/types';
import type { BuildContext } from '../buildContext';
import type { SceneVariant } from '../catalog';
import type { LookDef, SceneTemplate, TextSlotDef } from '../schema';
import { BODY_STYLE, FULL_LOOK, HEADLINE_STYLE } from '../_shared/look';
import { photoProps, type FilledSlot } from '../_shared/photo';
import { specFor, textFor } from '../_shared/text';
import { contentFloor } from '../_shared/chrome';

/**
 * What every family shares (D-119): turning a catalogue entry into a
 * template, sampling a motion into keyframes, and the common pieces — a
 * headline, a photo card, a stage to put things on.
 */

export const ALL_ASPECTS: readonly Aspect[] = ['9:16', '4:5', '1:1', '4:3', '16:9'];

export const kf = (t: number, v: number, ease: Keyframe['ease'] = 'outCubic'): Keyframe => ({ t, v, ease });

/** A catalogue variant as a scene template, with the defaults the families share. */
export function defineScene(
  variant: SceneVariant,
  parts: {
    readonly textSlots: readonly TextSlotDef[];
    readonly build: (inputs: SceneInputs, ctx: BuildContext) => Layer[];
    readonly look?: LookDef;
    readonly supportsLogo?: boolean;
  },
): SceneTemplate {
  return {
    kind: 'scene',
    id: variant.id,
    name: variant.name,
    category: variant.category,
    mode: 'both',
    tier: variant.tier ?? 'free',
    ...(variant.isNew === true ? { isNew: true } : {}),
    designSize: { w: 1080, h: 1080 },
    supportedAspects: ALL_ASPECTS,
    defaultDurationMs: variant.durationMs,
    minDurationMs: 2_000,
    maxDurationMs: 60_000,
    photoSlots: variant.photos,
    textSlots: parts.textSlots,
    supportsLogo: parts.supportsLogo ?? true,
    look: parts.look ?? FULL_LOOK,
    build: parts.build,
  };
}

// ── Text slots ──────────────────────────────────────────────────────────────

export function headlineSlot(placeholder: string, style: Partial<TextStyle> = {}, maxChars = 80): TextSlotDef {
  return { id: 'headline', label: 'Headline', placeholder, maxChars, defaultStyle: { ...HEADLINE_STYLE, ...style } };
}

export function sublineSlot(placeholder: string, style: Partial<TextStyle> = {}, id = 'subline', label = 'Line under it'): TextSlotDef {
  return { id, label, placeholder, maxChars: 90, defaultStyle: { ...BODY_STYLE, ...style } };
}

export function labelSlot(id: string, label: string, placeholder: string, style: Partial<TextStyle> = {}, maxChars = 40): TextSlotDef {
  return { id, label, placeholder, maxChars, defaultStyle: { ...BODY_STYLE, weight: 600, ...style } };
}

/** A text layer with its top-left (or top-centre) at a point, measured. */
export type PlacedText = { readonly layer: Layer; readonly width: number; readonly height: number };

export function placeText(
  ctx: BuildContext,
  slot: TextSlotDef,
  inputs: SceneInputs,
  options: {
    readonly sizePx: number;
    readonly maxWidthPx: number;
    readonly reveal: Reveal;
    readonly x: number;
    readonly y: number;
    /** Where `x` and `y` sit on the block: 0 is its left/top, 0.5 its centre. */
    readonly anchorX?: number;
    readonly anchorY?: number;
    readonly fill?: Paint;
    readonly lineHeight?: number;
    readonly tracks?: Tracks;
    readonly startMs?: number;
    readonly endMs?: number;
    readonly pill?: { readonly x: number; readonly y: number; readonly radius: number };
    /** One entry of a list text, typed into on its own (D-159), and what the selection calls it. */
    readonly item?: number;
    readonly label?: string;
    /** The slot key of a sibling it moves with (D-159): a chip's number with the chip's words. */
    readonly follows?: string;
  },
): PlacedText {
  const props: TextProps = textFor(slot, inputs, {
    baseSizePx: options.sizePx,
    maxWidthPx: options.maxWidthPx,
    reveal: options.reveal,
    lineHeight: options.lineHeight ?? 1.08,
    ...(options.fill ? { fallbackFill: options.fill } : {}),
    ...(options.pill ? { pillPadding: options.pill } : {}),
  });
  const run = ctx.measure(specFor(props, fontString(props.fontId, props.fontSizePx, props.weight)));
  const anchorX = options.anchorX ?? 0.5;
  const anchorY = options.anchorY ?? 0;
  const entry = options.item === undefined
    ? {}
    : { slot: { kind: 'text' as const, key: slot.id, item: options.item, ...(options.label === undefined ? {} : { label: options.label }) } };
  return {
    width: run.width,
    height: run.height,
    layer: {
      id: ctx.id(slot.id),
      type: 'text',
      startMs: options.startMs ?? 0,
      endMs: options.endMs ?? ctx.durationMs,
      anchorX,
      anchorY,
      tracks: { x: [kf(0, options.x)], y: [kf(0, options.y)], ...options.tracks },
      props: { ...props, ...entry },
      ...(options.follows === undefined ? {} : { follows: options.follows }),
    },
  };
}

/** Measures a slot's text as it would be laid out, without placing it. */
export function measureSlot(
  ctx: BuildContext,
  slot: TextSlotDef,
  inputs: SceneInputs,
  sizePx: number,
  maxWidthPx: number,
  lineHeight = 1.08,
): { width: number; height: number } {
  const props = textFor(slot, inputs, { baseSizePx: sizePx, maxWidthPx, reveal: { kind: 'none' }, lineHeight });
  const run = ctx.measure(specFor(props, fontString(props.fontId, props.fontSizePx, props.weight)));
  return { width: run.width, height: run.height };
}

// ── Shapes ──────────────────────────────────────────────────────────────────

export function rect(
  ctx: BuildContext,
  prefix: string,
  options: {
    readonly w: number;
    readonly h: number;
    readonly fill: Paint;
    readonly x: number;
    readonly y: number;
    readonly anchorX?: number;
    readonly anchorY?: number;
    readonly radius?: number;
    readonly stroke?: { readonly paint: Paint; readonly width: number };
    readonly tracks?: Tracks;
    readonly startMs?: number;
    readonly endMs?: number;
    readonly ellipse?: boolean;
    /** A part the person can pick, recolour, move and delete (D-159): see `shapeSlot`. */
    readonly slot?: SlotRef;
    /** The slot key of the sibling it sits behind and moves with (D-159). */
    readonly follows?: string;
  },
): Layer {
  return {
    id: ctx.id(prefix),
    type: 'shape',
    ...(options.follows === undefined ? {} : { follows: options.follows }),
    startMs: options.startMs ?? 0,
    endMs: options.endMs ?? ctx.durationMs,
    anchorX: options.anchorX ?? 0.5,
    anchorY: options.anchorY ?? 0.5,
    tracks: { x: [kf(0, options.x)], y: [kf(0, options.y)], ...options.tracks },
    props: {
      shape: options.ellipse === true ? 'ellipse' : 'rect',
      w: options.w,
      h: options.h,
      fill: options.fill,
      ...(options.radius === undefined ? {} : { cornerRadius: options.radius }),
      ...(options.stroke ? { stroke: options.stroke } : {}),
      ...(options.slot ? { slot: options.slot } : {}),
    },
  };
}

export const CLEAR: Paint = colorFill('rgba(0,0,0,0)');

// ── Parts (D-159) ───────────────────────────────────────────────────────────
//
// "When you select some templates, they have some elements that are fixed and
// cannot be selected or moved, or deleted." A design's own decoration becomes
// a part by carrying a shape slot: a name the template chooses (never a layer
// id, which shifts as the inputs change), what the selection calls it, and the
// palette role that is its colour. A part made of several pieces — a tile and
// its letter, a button and its sheen — is one group (`part`), so it is picked,
// moved and recoloured whole. A part that sits behind words `follows` them.

/** A part's slot: its name, its label and the role that is its colour (accent unless said). */
export function shapeSlot(
  name: string,
  label: string,
  extra: { readonly tint?: PaletteRole; readonly text?: { readonly slot: string; readonly item?: number }; readonly pick?: false } = {},
): SlotRef {
  return { kind: 'shape', key: name, label, tint: extra.tint ?? 'accent', ...(extra.text ? { text: extra.text } : {}), ...(extra.pick === false ? { pick: false as const } : {}) };
}

/**
 * Several pieces as one part: a group at `centre`, the pieces re-based round
 * it so they draw exactly where they did, and a `box` round them at rest so
 * the part is picked by all of it rather than its first piece. The group
 * stands still — the pieces keep their own motion — so a nudge scales and
 * turns the part about its centre. Nothing inside may carry a slot (D-090).
 */
export function part(
  ctx: BuildContext,
  prefix: string,
  ref: SlotRef,
  centre: { readonly x: number; readonly y: number },
  children: readonly Layer[],
  options: { readonly follows?: string } = {},
): Layer {
  const rebased = children.map((child) => rebase(child, centre));
  return {
    id: ctx.id(prefix),
    type: 'group',
    startMs: 0,
    endMs: ctx.durationMs,
    tracks: { x: [kf(0, centre.x)], y: [kf(0, centre.y)] },
    ...(options.follows === undefined ? {} : { follows: options.follows }),
    props: { slot: ref, ...boxAround(rebased) },
    children: rebased,
  };
}

function rebase(layer: Layer, by: { readonly x: number; readonly y: number }): Layer {
  const move = (track: readonly Keyframe[] | undefined, d: number): readonly Keyframe[] =>
    track && track.length > 0 ? track.map((key) => ({ ...key, v: key.v - d })) : [kf(0, -d, 'linear')];
  return { ...layer, tracks: { ...layer.tracks, x: move(layer.tracks.x, by.x), y: move(layer.tracks.y, by.y) } };
}

/** The pieces' rectangles where they come to rest, together. Words and glows are inside them. */
function boxAround(layers: readonly Layer[]): { box?: Rect } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const last = (track: readonly Keyframe[] | undefined, fallback: number): number => track?.[track.length - 1]?.v ?? fallback;
  for (const layer of layers) {
    if (layer.type !== 'shape' && layer.type !== 'mask' && layer.type !== 'image') continue;
    const sx = Math.abs(last(layer.tracks.scaleX, 1));
    const sy = Math.abs(last(layer.tracks.scaleY, 1));
    const w = layer.props.w * sx;
    const h = layer.props.h * sy;
    // Its corners, turned about its anchor as it rests: a line drawn at an angle is boxed where it lies.
    const ax = last(layer.tracks.x, 0);
    const ay = last(layer.tracks.y, 0);
    const radians = (last(layer.tracks.rotation, 0) * Math.PI) / 180;
    const left = -w * (layer.anchorX ?? 0.5);
    const top = -h * (layer.anchorY ?? 0.5);
    for (const [cx, cy] of [[left, top], [left + w, top], [left, top + h], [left + w, top + h]] as const) {
      const px = ax + cx * Math.cos(radians) - cy * Math.sin(radians);
      const py = ay + cx * Math.sin(radians) + cy * Math.cos(radians);
      x0 = Math.min(x0, px);
      y0 = Math.min(y0, py);
      x1 = Math.max(x1, px);
      y1 = Math.max(y1, py);
    }
  }
  return Number.isFinite(x0) ? { box: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } } : {};
}

// ── Photo cards ─────────────────────────────────────────────────────────────

/** A photo as a card: rounded by the look's corner radius, with a soft shadow and a hairline edge. */
export function cardProps(photo: FilledSlot, size: number, inputs: SceneInputs, unit: number, shadow = true): ImageProps {
  return photoProps(photo, size, {
    cornerRadius: inputs.look.cornerRadius,
    ...(shadow ? { shadow: { blur: unit * 0.045, offsetX: 0, offsetY: unit * 0.014, paint: colorFill('rgba(0,0,0,0.45)') } } : {}),
    border: { inset: 0, paint: roleFill('ink', 0.1), width: Math.max(1, unit * 0.002) },
  });
}

/** A pose a card can take at a moment. Lengths in design units, angles in degrees. */
export type Pose = {
  readonly x: number;
  readonly y: number;
  readonly scale?: number;
  readonly scaleX?: number;
  readonly scaleY?: number;
  readonly rotation?: number;
  readonly opacity?: number;
  readonly z?: number;
  readonly turnY?: number;
  readonly turnX?: number;
  readonly blur?: number;
  /** How dark the card is drawn, 0 to 1 (D-157): out of focus, it steps back. */
  readonly shade?: number;
};

/**
 * A motion sampled into keyframes, every `stepMs` across `[fromMs, toMs]`.
 *
 * The families describe motion as a function of time — where card 3 is on
 * the ring at any moment — which is the natural way to write a path, and the
 * renderer wants keyframes. Linear keyframes a twelfth of a second apart are
 * indistinguishable from the curve; the easing lives in the function.
 * Properties that never leave their rest value are left out entirely.
 */
export function sampled(
  fromMs: number,
  toMs: number,
  stepMs: number,
  at: (ms: number) => Pose,
  /**
   * A move further than this between two samples is a wrap — a card leaving
   * one edge and coming back at the other — and becomes an instant cut.
   * Interpolated, it streaks across the frame for one sample step.
   */
  jump = Number.POSITIVE_INFINITY,
): Tracks {
  const steps = Math.max(1, Math.ceil((toMs - fromMs) / stepMs));
  let previous: { x: number; y: number } | null = null;
  const keys = { x: [] as Keyframe[], y: [] as Keyframe[], scaleX: [] as Keyframe[], scaleY: [] as Keyframe[], rotation: [] as Keyframe[], opacity: [] as Keyframe[], z: [] as Keyframe[], turnY: [] as Keyframe[], turnX: [] as Keyframe[], blur: [] as Keyframe[], shade: [] as Keyframe[] };
  const used = { scaleX: false, scaleY: false, rotation: false, opacity: false, z: false, turnY: false, turnX: false, blur: false, shade: false };
  for (let i = 0; i <= steps; i++) {
    const ms = Math.min(toMs, fromMs + i * stepMs);
    const t = ms - fromMs;
    const pose = at(ms);
    if (previous && Math.hypot(pose.x - previous.x, pose.y - previous.y) > jump) {
      // Hold every property where it was until this moment, then cut.
      for (const key of Object.keys(keys) as (keyof typeof keys)[]) {
        const track = keys[key];
        const last = track[track.length - 1];
        if (last) track.push(kf(t, last.v, 'linear'));
      }
    }
    previous = { x: pose.x, y: pose.y };
    const sx = pose.scaleX ?? pose.scale ?? 1;
    const sy = pose.scaleY ?? pose.scale ?? 1;
    keys.x.push(kf(t, pose.x, 'linear'));
    keys.y.push(kf(t, pose.y, 'linear'));
    keys.scaleX.push(kf(t, sx, 'linear'));
    keys.scaleY.push(kf(t, sy, 'linear'));
    keys.rotation.push(kf(t, pose.rotation ?? 0, 'linear'));
    keys.opacity.push(kf(t, pose.opacity ?? 1, 'linear'));
    keys.z.push(kf(t, pose.z ?? 0, 'linear'));
    keys.turnY.push(kf(t, pose.turnY ?? 0, 'linear'));
    keys.turnX.push(kf(t, pose.turnX ?? 0, 'linear'));
    keys.blur.push(kf(t, pose.blur ?? 0, 'linear'));
    keys.shade.push(kf(t, pose.shade ?? 0, 'linear'));
    if (sx !== 1) used.scaleX = true;
    if (sy !== 1) used.scaleY = true;
    if ((pose.rotation ?? 0) !== 0) used.rotation = true;
    if ((pose.opacity ?? 1) !== 1) used.opacity = true;
    if ((pose.z ?? 0) !== 0) used.z = true;
    if ((pose.turnY ?? 0) !== 0) used.turnY = true;
    if ((pose.turnX ?? 0) !== 0) used.turnX = true;
    if ((pose.blur ?? 0) > 0.01) used.blur = true;
    if ((pose.shade ?? 0) > 0.005) used.shade = true;
  }
  return {
    x: keys.x,
    y: keys.y,
    ...(used.scaleX ? { scaleX: keys.scaleX } : {}),
    ...(used.scaleY ? { scaleY: keys.scaleY } : {}),
    ...(used.rotation ? { rotation: keys.rotation } : {}),
    ...(used.opacity ? { opacity: keys.opacity } : {}),
    ...(used.z ? { z: keys.z } : {}),
    ...(used.turnY ? { turnY: keys.turnY } : {}),
    ...(used.turnX ? { turnX: keys.turnX } : {}),
    ...(used.blur ? { blur: keys.blur } : {}),
    ...(used.shade ? { shade: keys.shade } : {}),
  };
}

/** A group whose children draw nearest-last, re-sorted each frame (D-117). Never transformed itself. */
export function depthGroup(ctx: BuildContext, prefix: string, children: Layer[]): Layer {
  return {
    id: ctx.id(prefix),
    type: 'group',
    startMs: 0,
    endMs: ctx.durationMs,
    tracks: {},
    props: { depthSort: true },
    children,
  };
}

// ── Easing helpers for motion functions ─────────────────────────────────────

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const easeOut = (u: number): number => 1 - (1 - clamp01(u)) ** 3;
export const easeInOut = (u: number): number => {
  const x = clamp01(u);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
};
export const easeOutBack = (u: number): number => {
  const x = clamp01(u);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2;
};
export const lerp = (a: number, b: number, u: number): number => a + (b - a) * u;

/**
 * A beat timer: which of `n` turns a moment is in, how far through it, and a
 * settle curve that holds still for the last part of each turn — the "move,
 * then rest" rhythm most card motions want.
 */
export function beat(ms: number, durationMs: number, n: number, moveShare = 0.35): { index: number; u: number; eased: number } {
  const turnMs = durationMs / Math.max(1, n);
  const index = Math.floor(ms / turnMs) % Math.max(1, n);
  const u = (ms % turnMs) / turnMs;
  return { index, u, eased: easeInOut(u / moveShare) };
}

/** The area under a headline, where a family puts its cards. */
export type Stage = { readonly cx: number; readonly cy: number; readonly w: number; readonly h: number };

/**
 * A headline at the top of the safe area and the stage below it. With
 * `bottom`, the headline sits above the content floor instead and the stage
 * takes the space above it.
 */
export function headlineAndStage(
  ctx: BuildContext,
  inputs: SceneInputs,
  slot: TextSlotDef,
  options: { readonly bottom?: boolean; readonly sizeShare?: number; readonly reveal?: Reveal } = {},
): { headline: Layer; stage: Stage } {
  const { design, safe } = ctx;
  const unit = Math.min(design.w, design.h);
  const size = unit * (options.sizeShare ?? 0.06);
  const reveal: Reveal = options.reveal ?? { kind: 'kinetic', unit: 'word', motion: 'rise', startMs: 250, durationMs: 650, staggerMs: 70 };
  const measured = measureSlot(ctx, slot, inputs, size, safe.w * 0.86);
  const gap = unit * 0.045;
  if (options.bottom === true) {
    const top = contentFloor(design, safe) - measured.height;
    const headline = placeText(ctx, slot, inputs, { sizePx: size, maxWidthPx: safe.w * 0.86, reveal, x: design.w / 2, y: top });
    const stageTop = safe.y;
    const stageBottom = top - gap;
    return { headline: headline.layer, stage: { cx: design.w / 2, cy: (stageTop + stageBottom) / 2, w: safe.w, h: Math.max(unit * 0.3, stageBottom - stageTop) } };
  }
  const headline = placeText(ctx, slot, inputs, { sizePx: size, maxWidthPx: safe.w * 0.86, reveal, x: design.w / 2, y: safe.y });
  const stageTop = safe.y + measured.height + gap;
  const stageBottom = contentFloor(design, safe);
  return { headline: headline.layer, stage: { cx: design.w / 2, cy: (stageTop + stageBottom) / 2, w: safe.w, h: Math.max(unit * 0.3, stageBottom - stageTop) } };
}

/** A soft radial light behind the stage, in the accent colour. */
export function glow(ctx: BuildContext, at: { x: number; y: number }, size: number, alpha = 0.22): Layer {
  return {
    id: ctx.id('glow'),
    type: 'gradient',
    startMs: 0,
    endMs: ctx.durationMs,
    tracks: { x: [kf(0, at.x)], y: [kf(0, at.y)] },
    props: {
      w: size,
      h: size,
      gradient: 'radial',
      stops: [
        { at: 0, paint: roleFill('accent', alpha) },
        { at: 1, paint: roleFill('accent', 0) },
      ],
    },
  };
}

/**
 * How many cards an arrangement shows: the person's photos, but never fewer
 * than the arrangement is designed around — a wheel built for eight with four
 * on it is a wheel with gaps. Short sets repeat in order (§8.1), as every
 * multi-photo design already does.
 */
export function cardCount(inputs: SceneInputs, variant: SceneVariant, floor = 3): number {
  return Math.max(floor, Math.min(Math.max(inputs.photos.length, variant.photos.default), variant.photos.max));
}

/** A stage much taller than it is wide — a story frame — where arrangements grow to use the height. */
export function isTall(stage: Stage): boolean {
  return stage.h > stage.w * 1.3;
}

// ── Emphasis (D-157) ────────────────────────────────────────────────────────
//
// Every design has a subject. Where several photos share the frame, one is in
// focus at every moment: as a photo reaches the focus point — the front of a
// ring, the middle of a coverflow, its turn in a grid — it grows to fill it,
// turns to face you and comes in front, while the others step back and
// darken. It lingers there, then gives way to the next. One curve, one size
// and one darkening, shared by every family, so the library speaks one
// emphasis language.

/**
 * The shared numbers. `peak` is the focused card's size against its own base
 * size (always clamped with `roomFor`, so it never leaves the stage); `rest`
 * is what the others shrink to; `dim` how dark they are drawn; `lift` how far
 * forward the focused card comes in a depth group; `reach` how many card
 * spacings either side of the focus point a card still feels it; `hold` how
 * much a moving arrangement slows at each focus (0 never, 1 stops).
 */
export const FOCUS = { peak: 1.45, rest: 0.86, dim: 0.4, lift: 4, reach: 0.75, hold: 0.65 } as const;

/** Ken Perlin's smootherstep: flat at both ends, so a card arrives at full focus without a kink. */
const smoother = (x: number): number => {
  const u = clamp01(x);
  return u * u * u * (u * (u * 6 - 15) + 10);
};

/** How in focus a card is, `distance` card spacings from the focus point: 1 there, 0 at `reach` and beyond. */
export function focusCurve(distance: number, reach: number = FOCUS.reach): number {
  return smoother(1 - Math.min(1, Math.abs(distance) / reach));
}

/**
 * A clock in card steps that glides but lingers at every whole step:
 * `linger(k) === k` for whole k, `linger(p + 1) === linger(p) + 1`, and at a
 * whole step it moves at `1 - hold` of its average speed. Never runs
 * backwards for `hold <= 1`.
 */
export function linger(position: number, hold: number = FOCUS.hold): number {
  return position - (hold * Math.sin(2 * Math.PI * position)) / (2 * Math.PI);
}

/** A step offset wrapped into [-n/2, n/2): how far card `i` is from the focus on a loop of `n`. */
export function wrapSteps(d: number, n: number): number {
  if (n <= 0) return d;
  let x = d % n;
  if (x < -n / 2) x += n;
  if (x >= n / 2) x -= n;
  return x;
}

/**
 * Focus by turns, for arrangements that hold still: card `index` of `count`
 * owns turn `index` of `[fromMs, toMs)`, with smooth shoulders `edge` turns
 * wide that cross at 0.5, so exactly one card is in focus at every moment
 * inside the window. Outside it nobody is (an entrance or an exit is its own
 * show), unless `wrap`, when the window is the whole loop and the last turn
 * hands back to the first.
 */
export function turnFocus(
  ms: number,
  index: number,
  count: number,
  fromMs: number,
  toMs: number,
  edge = 0.22,
  wrap = false,
): number {
  if (count <= 1) return 1;
  const span = toMs - fromMs;
  if (span <= 0) return 0;
  if (!wrap && (ms < fromMs || ms > toMs)) return 0;
  const local = ((ms - fromMs) / span) * count;
  let d = local - (index + 0.5);
  if (wrap) d = wrapSteps(d, count);
  return smoother((0.5 + edge / 2 - Math.abs(d)) / edge);
}

/**
 * The largest size, up to `wanted`, a card of `box` (its own unscaled w/h)
 * can take centred at `at` and still lie inside `stage` — so the focused card
 * never crosses the headline or the content floor. Never below 1.
 */
export function roomFor(stage: Stage, at: { x: number; y: number }, box: { w: number; h: number }, wanted: number = FOCUS.peak): number {
  const fx = box.w > 0 ? Math.min(at.x - (stage.cx - stage.w / 2), stage.cx + stage.w / 2 - at.x) / (box.w / 2) : wanted;
  const fy = box.h > 0 ? Math.min(at.y - (stage.cy - stage.h / 2), stage.cy + stage.h / 2 - at.y) / (box.h / 2) : wanted;
  return Math.max(1, Math.min(wanted, fx, fy));
}

/**
 * A pose with emphasis applied. In focus (`f` = 1): `peak` size, facing the
 * viewer, unblurred, unshaded and lifted forward. Out of focus (`f` = 0): its
 * own size × `FOCUS.rest`, darkened by `FOCUS.dim`. `straighten` (0 to 1)
 * also turns a tilted card upright as it comes into focus.
 */
export function emphasise(pose: Pose, f: number, peak: number = FOCUS.peak, options: { readonly straighten?: number } = {}): Pose {
  const k = clamp01(f);
  const sx = pose.scaleX ?? pose.scale ?? 1;
  const sy = pose.scaleY ?? pose.scale ?? 1;
  return {
    x: pose.x,
    y: pose.y,
    scaleX: lerp(sx * FOCUS.rest, peak * (sx / Math.max(sx, sy)), k),
    scaleY: lerp(sy * FOCUS.rest, peak * (sy / Math.max(sx, sy)), k),
    rotation: lerp(pose.rotation ?? 0, 0, k * (options.straighten ?? 0)),
    opacity: lerp(pose.opacity ?? 1, 1, k),
    z: (pose.z ?? 0) + k * FOCUS.lift,
    turnY: lerp(pose.turnY ?? 0, 0, k),
    turnX: lerp(pose.turnX ?? 0, 0, k),
    blur: lerp(pose.blur ?? 0, 0, k),
    shade: Math.max(pose.shade ?? 0, (1 - k) * FOCUS.dim),
  };
}

/** A grid visited in reading order that snakes — left to right, then right to left — so a moving focus never jumps across the sheet. */
export function serpentine(col: number, row: number, cols: number): number {
  return row * cols + (row % 2 === 0 ? col : cols - 1 - col);
}

/**
 * For hand-keyframed templates: a track kept as written up to `afterMs` (an
 * entrance), held there, then continued with `keys` — the focus beats.
 */
export function appendAfter(track: readonly Keyframe[], afterMs: number, keys: readonly Keyframe[]): Keyframe[] {
  const kept = track.filter((k) => k.t <= afterMs);
  const last = kept[kept.length - 1];
  if (last && last.t < afterMs) kept.push(kf(afterMs, last.v, 'linear'));
  return [...kept, ...keys.filter((k) => k.t > afterMs)];
}
