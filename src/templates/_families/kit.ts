import { colorFill, roleFill, type Aspect, type ImageProps, type Keyframe, type Layer, type Paint, type Reveal, type TextProps, type Tracks } from '@/core/types';
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
      props,
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
  },
): Layer {
  return {
    id: ctx.id(prefix),
    type: 'shape',
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
    },
  };
}

export const CLEAR: Paint = colorFill('rgba(0,0,0,0)');

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
  const keys = { x: [] as Keyframe[], y: [] as Keyframe[], scaleX: [] as Keyframe[], scaleY: [] as Keyframe[], rotation: [] as Keyframe[], opacity: [] as Keyframe[], z: [] as Keyframe[], turnY: [] as Keyframe[], turnX: [] as Keyframe[], blur: [] as Keyframe[] };
  const used = { scaleX: false, scaleY: false, rotation: false, opacity: false, z: false, turnY: false, turnX: false, blur: false };
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
    if (sx !== 1) used.scaleX = true;
    if (sy !== 1) used.scaleY = true;
    if ((pose.rotation ?? 0) !== 0) used.rotation = true;
    if ((pose.opacity ?? 1) !== 1) used.opacity = true;
    if ((pose.z ?? 0) !== 0) used.z = true;
    if ((pose.turnY ?? 0) !== 0) used.turnY = true;
    if ((pose.turnX ?? 0) !== 0) used.turnX = true;
    if ((pose.blur ?? 0) > 0.01) used.blur = true;
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
