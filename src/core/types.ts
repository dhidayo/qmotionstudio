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

/**
 * Per-type static props arrive with the layer implementations in M1. The base
 * shape is fixed now because the memo key and the compositor depend on it.
 */
export type StaticProps = {
  readonly anchorX?: number;
  readonly anchorY?: number;
  readonly fill?: Paint;
  readonly blendMode?: GlobalCompositeOperation;
};

export type Layer = {
  readonly id: string;
  readonly type: LayerType;
  /** Milliseconds relative to the layer's scene (or its overlay). */
  readonly startMs: number;
  readonly endMs: number;
  readonly props: StaticProps;
  readonly tracks: Tracks;
  readonly children?: readonly Layer[];
};

// ── Geometry ────────────────────────────────────────────────────────────────

export type Rect = { readonly x: number; readonly y: number; readonly w: number; readonly h: number };

export type Size = { readonly w: number; readonly h: number };
