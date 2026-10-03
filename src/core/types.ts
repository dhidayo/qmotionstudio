/**
 * Render-core types.
 *
 * Nothing in src/core may import React, Zustand, or anything under src/ui.
 * The eslint boundary in eslint.config.js enforces it. This is what lets the
 * export worker import the renderer without pulling the editor in with it.
 */

/**
 * D-001. The export path renders into an OffscreenCanvas inside a worker, whose
 * context is OffscreenCanvasRenderingContext2D — a different interface from the
 * main thread's. Every drawing function in the core takes this union, never the
 * bare CanvasRenderingContext2D the spec originally named.
 */
export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export type Aspect = '16:9' | '4:3' | '1:1' | '4:5' | '9:16';

export const ASPECTS: readonly Aspect[] = ['16:9', '4:3', '1:1', '4:5', '9:16'] as const;

/** Numerator/denominator, kept exact so ratios never drift through float maths. */
export const ASPECT_RATIO: Record<Aspect, readonly [number, number]> = {
  '16:9': [16, 9],
  '4:3': [4, 3],
  '1:1': [1, 1],
  '4:5': [4, 5],
  '9:16': [9, 16],
};

// ── Colour ──────────────────────────────────────────────────────────────────

export type PaletteRole = 'bg' | 'surface' | 'ink' | 'inkMuted' | 'accent';

export const PALETTE_ROLES: readonly PaletteRole[] = ['bg', 'surface', 'ink', 'inkMuted', 'accent'] as const;

export type Palette = Record<PaletteRole, string>;

/**
 * D-006. Layers reference palette *roles*, not baked hex. The renderer resolves
 * a role to a colour per frame, so dragging a colour picker repaints without
 * re-running the template's build() — which the spec forbids inside the render
 * loop (§16) but would otherwise happen sixty times a second.
 */
export type Paint =
  | { readonly kind: 'color'; readonly value: string }
  | { readonly kind: 'role'; readonly role: PaletteRole; readonly alpha?: number };

export const roleFill = (role: PaletteRole, alpha?: number): Paint =>
  alpha === undefined ? { kind: 'role', role } : { kind: 'role', role, alpha };

export const colorFill = (value: string): Paint => ({ kind: 'color', value });

// ── Animation ───────────────────────────────────────────────────────────────

export type EaseName =
  | 'linear'
  | 'inQuad' | 'outQuad' | 'inOutQuad'
  | 'inCubic' | 'outCubic' | 'inOutCubic'
  | 'outExpo' | 'outBack' | 'inOutSine';

/** A spring is sampled to a lookup table at build time, never solved per frame. */
export type SpringSpec = {
  readonly kind: 'spring';
  readonly stiffness: number;
  readonly damping: number;
  readonly mass: number;
};

export type Ease = EaseName | SpringSpec;

export type AnimatedProp =
  | 'x' | 'y' | 'scaleX' | 'scaleY' | 'rotation' | 'opacity'
  | 'blur' | 'letterSpacing' | 'clipProgress' | 'cornerRadius';

/**
 * Resolved animated values at an instant. Named PropValues rather than
 * `AnimatedProps` deliberately: a type one character away from AnimatedProp is
 * a bug waiting to happen (flagged in the M0 spec review, 1.14).
 */
export type PropValues = Partial<Record<AnimatedProp, number>>;

/**
 * D-005. `t` is milliseconds relative to the owning layer's `startMs` — not
 * normalised, not global. Relative-to-layer composes correctly with the
 * staggered repeaters in §6.1, which shift a layer's start without needing to
 * rewrite its keyframes.
 *
 * Interpolation uses the ease on the *later* keyframe (§6.1). Values hold
 * before the first keyframe and after the last.
 */
export type Keyframe = {
  readonly t: number;
  readonly v: number;
  readonly ease: Ease;
};

export type Tracks = Partial<Record<AnimatedProp, readonly Keyframe[]>>;

// ── Layers ──────────────────────────────────────────────────────────────────

export type LayerType = 'image' | 'text' | 'shape' | 'gradient' | 'group' | 'mask' | 'video';

export type Direction = 'left' | 'right' | 'up' | 'down';

export type Stroke = { readonly paint: Paint; readonly width: number };

export type Shadow = {
  readonly blur: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly paint: Paint;
};

/**
 * Text reveals (§6.3).
 *
 * Driven by the layer's own local time rather than by clipProgress: staggered
 * modes need a per-item time offset, and expressing that as a fraction of a
 * normalised progress value means the template has to do the conversion
 * backwards. Times are relative to the layer's startMs, like keyframes (D-005).
 */
export type Reveal =
  | { readonly kind: 'none' }
  | { readonly kind: 'fade'; readonly startMs: number; readonly durationMs: number }
  | { readonly kind: 'maskWipe'; readonly dir: Direction; readonly startMs: number; readonly durationMs: number }
  | { readonly kind: 'perWord'; readonly startMs: number; readonly durationMs: number; readonly staggerMs: number }
  | { readonly kind: 'perChar'; readonly startMs: number; readonly durationMs: number; readonly staggerMs: number }
  | { readonly kind: 'swap'; readonly altText: string; readonly atMs: number; readonly durationMs: number };

export type ObjectFit = 'cover' | 'contain';

/**
 * A decoded video frame, as the renderer needs it (§9's custom media).
 *
 * Structural on purpose. The decoder hands back Mediabunny's `VideoSample`,
 * but `src/core` describes what it needs rather than importing the library to
 * say it — the render core has exactly one job and no business knowing which
 * demuxer filled the buffer.
 *
 * The nine-argument `draw` is the source-rect form, which is what keeps the
 * crop and object-fit arithmetic in image.ts and video.ts identical.
 */
export interface DecodedFrame {
  readonly displayWidth: number;
  readonly displayHeight: number;
  draw(
    ctx: Ctx2D,
    sx: number, sy: number, sWidth: number, sHeight: number,
    dx: number, dy: number, dWidth?: number, dHeight?: number,
  ): void;
}

// Per-type static props. The spec names this StaticProps (§6.1); modelling it
// as a discriminated union on `type` is the same idea with the compiler
// checking that a text layer never carries an image's fields.

export type ShapeProps = {
  readonly shape: 'rect' | 'ellipse';
  readonly w: number;
  readonly h: number;
  readonly fill: Paint;
  readonly cornerRadius?: number;
  readonly stroke?: Stroke;
  readonly shadow?: Shadow;
};

export type GradientStop = { readonly at: number; readonly paint: Paint };

export type GradientProps = {
  readonly w: number;
  readonly h: number;
  readonly gradient: 'linear' | 'radial';
  readonly stops: readonly GradientStop[];
  /** Degrees, clockwise from left-to-right. Linear only. */
  readonly angle?: number;
};

/**
 * Which document slot a drawable came from.
 *
 * Carried on the props rather than on the layer because `photoProps` and
 * `textFor` are the two funnels every template's photos and text already pass
 * through, and both are handed the slot's identity anyway. Tagging there means
 * no template has to remember to do it — including templates not written yet.
 *
 * The renderer ignores it entirely. It exists so the editor can find the
 * drawable that belongs to a slot, and so a user's nudge can be applied to it.
 */
export type SlotRef =
  | { readonly kind: 'photo'; readonly index: number }
  | { readonly kind: 'text'; readonly key: string };

export type ImageProps = {
  readonly slot?: SlotRef;
  readonly mediaId: string;
  readonly w: number;
  readonly h: number;
  readonly fit: ObjectFit;
  /** Normalised against the source image. */
  readonly crop?: Rect;
  readonly cornerRadius?: number;
  readonly shadow?: Shadow;
  readonly border?: { readonly inset: number; readonly paint: Paint; readonly width: number };
  readonly reflection?: { readonly heightPct: number; readonly opacity: number; readonly gapPx: number };
};

export type TextProps = {
  readonly slot?: SlotRef;
  readonly text: string;
  readonly fontId: string;
  readonly fontSizePx: number;
  readonly weight: number;
  /** Percent of font size (§8.2); resolved to px at layout. */
  readonly letterSpacingPct: number;
  readonly lineHeight: number;
  readonly align: 'left' | 'center' | 'right';
  readonly fill: Paint;
  /** null disables wrapping. */
  readonly maxWidthPx: number | null;
  readonly shadow?: Shadow;
  readonly outline?: Stroke;
  readonly pill?: { readonly paint: Paint; readonly paddingX: number; readonly paddingY: number; readonly radius: number };
  readonly reveal: Reveal;
};

/**
 * A group's only prop is optional: the slot it stands for.
 *
 * A container carries a slot when the *whole* container is the user's element
 * — a photograph that breaks into pieces as it leaves, say, where the pieces
 * are the photo and have to follow it when someone has dragged it. The pieces
 * themselves are then untagged, or the nudge would be applied twice (D-090).
 */
export type GroupProps = {
  readonly slot?: SlotRef;
  /**
   * The extent an element effect works in, in the group's own coordinates
   * (D-100). A group has no box of its own; without this, an effect on it uses
   * its first child's — which for the logo would leave the lockup out.
   */
  readonly box?: Rect;
};

export type MaskProps = {
  readonly shape: 'rect' | 'ellipse';
  readonly w: number;
  readonly h: number;
  readonly cornerRadius?: number;
  /**
   * The edge the mask opens from when `clipProgress` is animated.
   *
   * With no direction the mask is a fixed window and `clipProgress` does
   * nothing; with one, the clip grows from that edge across the box — which is
   * what §6.1 named `clipProgress` for, and what M5's `wipeIn` overlay preset
   * is built on. Rect masks only: a partially-revealed ellipse is a shape
   * nobody has asked for.
   */
  readonly clipFrom?: Direction;
  /** As on a group: set when the masked window *is* the user's element (D-090). */
  readonly slot?: SlotRef;
};

export type VideoProps = {
  readonly mediaId: string;
  readonly w: number;
  readonly h: number;
  readonly fit: ObjectFit;
  readonly cornerRadius?: number;
};

/** One knob on an effect: a number, a colour, or a named choice. */
export type FxParamValue = number | string | boolean;

/**
 * One effect, placed in time (D-100).
 *
 * The same shape serves an effect over the whole frame (snow, a camera shake, a
 * film look) and an effect on one element (a spin in, a shine across a logo):
 * what it is, when it runs, how strongly, and its own settings. `seed` makes
 * every random-looking thing about it — where the flakes fall, when the
 * lightning strikes — the same on every frame of every render, so an export is
 * the preview, pixel for pixel.
 *
 * Times are the owner's: a layer's local clock for an element effect, a
 * scene's or the project's for a frame effect.
 */
export type FxInstance = {
  readonly effectId: string;
  readonly startMs: number;
  readonly endMs: number;
  /** 0–1. How much of the effect; 0 is none. */
  readonly intensity: number;
  readonly params: Readonly<Record<string, FxParamValue>>;
  readonly seed: number;
};

type LayerBase = {
  readonly id: string;
  /** Milliseconds relative to the layer's scene (or its overlay). */
  readonly startMs: number;
  readonly endMs: number;
  readonly tracks: Tracks;
  /** Origin for rotation and scale, normalised within the layer's own box. */
  readonly anchorX?: number;
  readonly anchorY?: number;
  readonly blendMode?: GlobalCompositeOperation;
  /**
   * Element effects on this layer, in its own local time (D-100).
   *
   * Added after the template has built — by the editor for a template's own
   * element, by the overlay builder for a layer, by the logo builder for the
   * logo — so no template ever has to know effects exist.
   */
  readonly fx?: readonly FxInstance[];
};

export type ShapeLayer = LayerBase & { readonly type: 'shape'; readonly props: ShapeProps };
export type GradientLayer = LayerBase & { readonly type: 'gradient'; readonly props: GradientProps };
export type ImageLayer = LayerBase & { readonly type: 'image'; readonly props: ImageProps };
export type TextLayer = LayerBase & { readonly type: 'text'; readonly props: TextProps };
export type VideoLayer = LayerBase & { readonly type: 'video'; readonly props: VideoProps };
export type GroupLayer = LayerBase & {
  readonly type: 'group';
  readonly props: GroupProps;
  readonly children: readonly Layer[];
};
export type MaskLayer = LayerBase & {
  readonly type: 'mask';
  readonly props: MaskProps;
  readonly children: readonly Layer[];
};

export type Layer =
  | ShapeLayer | GradientLayer | ImageLayer | TextLayer | VideoLayer | GroupLayer | MaskLayer;

/** Retained for the spec's naming; the union above is the real shape. */
export type StaticProps = Layer['props'];

// ── Geometry ────────────────────────────────────────────────────────────────

export type Rect = { readonly x: number; readonly y: number; readonly w: number; readonly h: number };

export type Size = { readonly w: number; readonly h: number };
