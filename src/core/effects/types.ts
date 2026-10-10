import type { Ctx2D, FxParamValue, Palette, Size } from '@/core/types';
import { type AnyCanvas } from '@/core/render/surface';

/**
 * The effect library's vocabulary (D-100).
 *
 * Two kinds of effect, because people asked for two different things:
 *
 *   frame    over the whole picture — snow, light leaks, a camera shake, a
 *            film look. Placed on a scene ("this scene has snow") or on the
 *            timeline at a moment ("lightning, here, for a second").
 *   element  on one thing — how a photo arrives or leaves, a pulse on a
 *            price, a shine across a logo.
 *
 * Every effect is a pure function of its sample: given the same time, seed and
 * settings it draws the same thing. Nothing is simulated frame to frame.
 */

// ── Settings ────────────────────────────────────────────────────────────────

export type ParamOption = { readonly value: string; readonly label: string };

export type ParamSpec =
  | {
      readonly kind: 'number';
      readonly key: string;
      readonly label: string;
      readonly min: number;
      readonly max: number;
      readonly step?: number;
      readonly default: number;
      readonly suffix?: string;
    }
  | { readonly kind: 'color'; readonly key: string; readonly label: string; readonly default: string }
  | {
      readonly kind: 'choice';
      readonly key: string;
      readonly label: string;
      readonly options: readonly ParamOption[];
      readonly default: string;
    };

/** Settings as an effect reads them: every key present, with its default filled in. */
export type Params = {
  num(key: string): number;
  str(key: string): string;
  /** A colour, with 'brand' resolved to the palette's accent. */
  color(key: string): string;
};

export function readParams(
  specs: readonly ParamSpec[],
  values: Readonly<Record<string, FxParamValue>>,
  palette: Palette,
): Params {
  const find = (key: string): ParamSpec | undefined => specs.find((s) => s.key === key);

  const str = (key: string): string => {
    const value = values[key];
    const spec = find(key);
    if (spec?.kind === 'choice') {
      return typeof value === 'string' && spec.options.some((o) => o.value === value) ? value : spec.default;
    }
    if (typeof value === 'string') return value;
    return spec?.kind === 'color' ? spec.default : '';
  };

  return {
    num(key) {
      const value = values[key];
      const spec = find(key);
      const fallback = spec?.kind === 'number' ? spec.default : 0;
      if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
      return spec?.kind === 'number' ? Math.max(spec.min, Math.min(spec.max, value)) : value;
    },
    str,
    color(key) {
      const value = str(key);
      if (value === 'brand') return palette.accent;
      if (value === 'ink') return palette.ink;
      if (/^#[0-9a-f]{3,8}$/i.test(value)) return value;
      const spec = find(key);
      return spec?.kind === 'color' ? spec.default : '#ffffff';
    },
  };
}

// ── Frame effects ───────────────────────────────────────────────────────────

export type FrameCategory = 'Atmosphere' | 'Light' | 'Camera' | 'Stylize';

export const FRAME_CATEGORIES: readonly FrameCategory[] = ['Atmosphere', 'Light', 'Camera', 'Stylize'];

/** Everything a frame effect knows at one instant. */
export type FrameSample = {
  /** Milliseconds since the effect began. */
  readonly t: number;
  /** How long it runs. */
  readonly dur: number;
  /** t / dur, 0–1. */
  readonly p: number;
  /** A soft rise and fall at the ends, 0–1, for effects that should not snap. */
  readonly env: number;
  readonly intensity: number;
  readonly seed: number;
  /** The frame in design units. */
  readonly design: Size;
  /** The frame's short edge — the unit sizes are expressed in. */
  readonly unit: number;
  readonly palette: Palette;
  readonly params: Params;
};

/** A camera move: added to whatever the frame was going to show. */
export type Camera = {
  readonly x: number;
  readonly y: number;
  /** Multiplies; 1 is none. */
  readonly scale: number;
  /** Degrees. */
  readonly rotation: number;
};

export const NO_CAMERA: Camera = { x: 0, y: 0, scale: 1, rotation: 0 };

/**
 * Access to the finished frame, for the effects that work on its pixels — a
 * glitch, a colour split, a bloom. Pixel space, not design space.
 */
export type FrameIO = {
  /** The surface being drawn to, as an image to read back from. */
  readonly source: CanvasImageSource;
  /** Its size in pixels. */
  readonly px: Size;
  /** Design units → pixels. */
  readonly scale: number;
  /** A scratch surface the size of the frame, cleared, by index (0–2). */
  scratch(index: number): { readonly canvas: AnyCanvas; readonly ctx: Ctx2D };
};

export type FrameEffectDef = {
  readonly id: string;
  readonly name: string;
  readonly category: FrameCategory;
  /** One line, for the library card. */
  readonly blurb: string;
  /**
   * How long it runs when dropped at the playhead. `null` means "the whole
   * scene" — weather and film looks are moods, not moments.
   */
  readonly defaultMs: number | null;
  readonly defaultIntensity: number;
  readonly params: readonly ParamSpec[];
  /** Moves the whole picture. Applied before anything is drawn. */
  camera?(s: FrameSample): Camera;
  /** Draws over the finished picture, in design units. */
  draw?(ctx: Ctx2D, s: FrameSample, io: FrameIO): void;
};

// ── Element effects ─────────────────────────────────────────────────────────

/**
 * When an element effect runs.
 *
 *   enter   the first moments the element is on screen
 *   exit    its last moments
 *   during  the whole time it is on screen
 */
export type ElementPhase = 'enter' | 'exit' | 'during';

export type ElementCategory = 'Entrance' | 'Exit' | 'Emphasis' | 'Light';

export const ELEMENT_CATEGORIES: readonly ElementCategory[] = ['Entrance', 'Exit', 'Emphasis', 'Light'];

export type ElementSample = {
  readonly t: number;
  readonly dur: number;
  readonly p: number;
  readonly intensity: number;
  readonly seed: number;
  /** The element's own box, in its own units. */
  readonly size: { readonly w: number; readonly h: number };
  readonly palette: Palette;
  readonly params: Params;
};

/**
 * How an element effect moves its element, added to what it was doing anyway.
 * Offsets are in the element's units; scale and opacity multiply.
 */
export type ElementOffset = {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  opacity: number;
  blur: number;
};

export const identityOffset = (): ElementOffset => ({
  x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, blur: 0,
});

/** Where the element sits in its own coordinates, for effects that draw on it. */
export type ElementBox = { readonly x: number; readonly y: number; readonly w: number; readonly h: number; readonly radius: number };

export type ElementEffectDef = {
  readonly id: string;
  readonly name: string;
  readonly category: ElementCategory;
  readonly blurb: string;
  /** The phase it is placed in by default, and the ones it may be moved to. */
  readonly phase: ElementPhase;
  readonly phases: readonly ElementPhase[];
  readonly defaultMs: number;
  readonly defaultIntensity: number;
  readonly params: readonly ParamSpec[];
  /**
   * Entrances hold their first state until they begin, exits their last state
   * once they end — so an element never flashes into view before its spin-in,
   * or reappears after it has blown away.
   */
  readonly hold?: 'before' | 'after';
  /** Adds to the element's own motion. */
  motion?(s: ElementSample, out: ElementOffset): void;
  /** Paints behind the element, in its coordinates. */
  under?(ctx: Ctx2D, s: ElementSample, box: ElementBox): void;
  /** Paints onto the element itself — clipped to its shape, so a shine never spills off a logo. */
  onto?(ctx: Ctx2D, s: ElementSample, box: ElementBox): void;
  /** Paints in front of it, unclipped — sparks that fly off its edges. */
  over?(ctx: Ctx2D, s: ElementSample, box: ElementBox): void;
  /** A soft glow of the element's own shape behind it. */
  glow?(s: ElementSample): { readonly color: string; readonly radius: number; readonly alpha: number } | null;
};

export type EffectDef = FrameEffectDef | ElementEffectDef;
