import type { Aspect, Direction, Palette, PropValues, Rect } from '@/core/types';

/**
 * The document model (§5).
 *
 * The document holds ids, never pixels: decoded bitmaps and audio buffers live
 * in the media store, keyed by mediaId. That is what keeps undo snapshots cheap
 * and the autosave payload small.
 */

/** Bumped whenever this shape changes; migrate.ts upgrades older saves. */
export const SCHEMA_VERSION = 2;

export type MediaRef = { readonly mediaId: string };

export type FontId = string;

export type { Direction };

export type TransitionKind =
  | 'cut' | 'crossFade' | 'push' | 'wipe' | 'zoomBlur' | 'whiteFlash' | 'scale';

/**
 * D-004. A transition *overlaps* its two neighbours: it consumes `durationMs`
 * from the end of the outgoing scene and the start of the incoming one, so
 * total project duration is sum(scene durations) − sum(transition durations).
 * Both scenes therefore stay inside their own valid time range for the whole
 * overlap, which the "insert extra time" alternative cannot guarantee.
 */
export type Transition = {
  readonly kind: TransitionKind;
  readonly durationMs: number;
  readonly direction?: Direction;
};

export type PhotoFrame = '1:1' | '4:3' | '3:4' | '16:9' | '9:16';
export type PhotoSizeMode = 'template' | 'larger' | 'fillFrame' | 'overflow';
export type PhotoCropMode = 'template' | 'original';

export type PhotoInput = {
  readonly mediaId: string;
  readonly frame: PhotoFrame;
  readonly sizeMode: PhotoSizeMode;
  /** 100–400. Ignored when sizeMode is 'template' (spec review, 1.15). */
  readonly sizePct: number;
  readonly cropMode: PhotoCropMode;
  /** Normalised 0–1 against the source image. */
  readonly cropRect?: Rect;
};

export type BackgroundTreatment = 'solid' | 'gradient' | 'blurredPhoto' | 'pattern';

export type LookSettings = {
  readonly palette: Palette;
  readonly background: BackgroundTreatment;
  readonly grain: number;
  readonly vignette: number;
  /** Multiplies time before layers are evaluated — never baked into keyframes. */
  readonly speed: number;
  readonly cornerRadius: number;
};

export type TextStyle = {
  readonly fontId: FontId;
  readonly weight: 400 | 500 | 600 | 700 | 800;
  readonly align: 'left' | 'center' | 'right';
  readonly sizePct: number;
  readonly color: string;
  readonly wrap: boolean;
  readonly shadow: boolean;
  readonly outline: boolean;
  readonly pill: boolean;
  readonly wrapWidthPct: number;
  /** Percent of font size — resolved to px at layout (spec review, 2.4). */
  readonly letterSpacingPct: number;
};

export type StyleOverrides = {
  readonly texts: Readonly<Record<string, Partial<TextStyle>>>;
};

export type LogoPlacement =
  | 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight' | 'center' | 'free';

/**
 * §5 types the logo as `MediaRef | null`, but §8.3 gives the inspector size,
 * placement, opacity and a lockup option — none of which fit in a bare ref.
 * Extended here rather than smuggled into styleOverrides (D-035).
 */
export type LogoSettings = {
  readonly mediaId: string | null;
  /** Percent of the artboard's short edge. */
  readonly sizePct: number;
  readonly placement: LogoPlacement;
  /** Normalised 0–1, used only when placement is 'free'. */
  readonly x: number;
  readonly y: number;
  readonly opacity: number;
  /** Pairs the logo with a text mark (§8.3). */
  readonly lockup: boolean;
  readonly lockupText: string;
};

/**
 * A user's nudge to one of the template's own elements (B).
 *
 * Stored as an *offset* from wherever the template put the element, never as
 * an absolute position. That is the whole difference between "you may adjust
 * this layout" and "you have taken this layout over": the template still
 * decides where things go, so switching aspect still re-lays-out (§1.3),
 * switching template still works, and a photo that moves because its
 * neighbours changed takes its nudge with it. Resetting is clearing the entry.
 *
 * `offsetX`/`offsetY` are fractions of the frame; `scale` multiplies whatever
 * the template chose; `rotation` is degrees added to it.
 */
export type SlotTransform = {
  readonly offsetX: number;
  readonly offsetY: number;
  readonly scale: number;
  readonly rotation: number;
  /**
   * Draw order against the rest of the scene. 0 is wherever the template put
   * it; positive is in front, negative is behind.
   *
   * A nudge like the others — the template's stacking is the starting point
   * and this says how far the user has lifted something out of it — so
   * "Reset to template" puts the stacking back too.
   */
  readonly z: number;
  /**
   * The nudge over time, when the user has keyframed it.
   *
   * Absent means the nudge is a constant, which is both the common case and
   * the one that has to stay exactly as it was: a template's own motion is
   * then shifted by a fixed amount and is otherwise untouched.
   *
   * `offsetX`/`offsetY`/`scale`/`rotation` above are the resting values and
   * the seed for the first pose. `z` is deliberately not animatable — draw
   * order changing mid-scene is a different kind of effect and not one anyone
   * has asked for.
   */
  readonly poses?: readonly SlotPose[];
  /** How the motion moves between poses. Same vocabulary as an overlay's. */
  readonly easing?: OverlayEasing;
};

/** One moment in a slot's nudge. Mirrors `OverlayPose`, in slot terms. */
export type SlotPose = {
  /** Milliseconds from the start of the scene the slot belongs to. */
  readonly atMs: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly scale: number;
  readonly rotation: number;
};

export const NO_SLOT_TRANSFORM: SlotTransform = {
  offsetX: 0, offsetY: 0, scale: 1, rotation: 0, z: 0,
};

/**
 * Keyed by slot rather than held on `PhotoInput`, because §8.1 lets the photo
 * count exceed the supplied photos — slot 4 of a six-slot template may have no
 * document entry of its own to hang anything off.
 */
export type SlotKey = string;

export type SceneInputs = {
  readonly photos: readonly PhotoInput[];
  readonly texts: Readonly<Record<string, string>>;
  readonly logo: LogoSettings;
  readonly look: LookSettings;
  readonly styleOverrides: StyleOverrides;
  /** Per-slot nudges, keyed by `slotKey()`. Absent means untouched. */
  readonly slotTransforms: Readonly<Record<SlotKey, SlotTransform>>;
};

export type Scene = {
  readonly id: string;
  readonly templateId: string;
  readonly durationMs: number;
  /** Always null on the first scene; validated, not typed. */
  readonly transitionIn: Transition | null;
  readonly inputs: SceneInputs;
};

export type AnimPreset = 'none' | 'fade' | 'riseIn' | 'popIn' | 'slideIn' | 'wipeIn';

export type OverlayContent =
  | { readonly kind: 'photo'; readonly mediaId: string }
  | { readonly kind: 'text'; readonly text: string; readonly style: TextStyle }
  | { readonly kind: 'customMedia'; readonly mediaId: string };

/**
 * One moment in an overlay's motion: where it is, how big, how turned.
 *
 * A whole pose rather than a track per property. Five separate lanes for x, y,
 * scale, rotation and opacity is how a compositor works and is exactly the
 * thing that makes compositors need explaining; people think "it is here at
 * the start and there by the end", and a pose is that thought written down.
 */
export type OverlayPose = {
  /** Milliseconds from the overlay's own start, like every other layer time. */
  readonly atMs: number;
  readonly transform: PropValues;
};

/** One choice for the whole overlay. Deliberately not per keyframe. */
export type OverlayEasing = 'smooth' | 'linear' | 'springy';

export type Overlay = {
  readonly id: string;
  /** 0 = L1, 1 = L2, … */
  readonly track: number;
  readonly startMs: number;
  readonly endMs: number;
  readonly kind: OverlayContent['kind'];
  readonly content: OverlayContent;
  /** Where it sits when it is not animated, and the seed for its first pose. */
  readonly transform: PropValues;
  /**
   * The motion path, when there is one.
   *
   * Absent for every overlay until someone turns animation on, which keeps the
   * feature entirely out of the way of anyone who does not want it.
   */
  readonly poses?: readonly OverlayPose[];
  readonly easing?: OverlayEasing;
  readonly enterAnim: AnimPreset;
  readonly exitAnim: AnimPreset;
};

export type AudioClip = {
  readonly id: string;
  readonly mediaId: string;
  readonly startMs: number;
  readonly trimStartMs: number;
  readonly trimEndMs: number;
  readonly gainDb: number;
  readonly fadeInMs: number;
  readonly fadeOutMs: number;
};

export type Brand = {
  readonly logo: MediaRef | null;
  readonly palette: Palette;
  readonly fontHeadline: FontId;
  readonly fontBody: FontId;
};

export type ProjectMode = 'showcase' | 'motionAd';

export type Project = {
  readonly schemaVersion: number;
  readonly id: string;
  readonly name: string;
  readonly mode: ProjectMode;
  readonly aspect: Aspect;
  /** Showcase has exactly one. */
  readonly scenes: readonly Scene[];
  /** motionAd only. */
  readonly overlays: readonly Overlay[];
  /** motionAd only, one track for now. */
  readonly audio: readonly AudioClip[];
  readonly brand: Brand;
  /**
   * D-013. Set when the project was expanded from a multi-scene ad template.
   * Provenance only — scenes stay a flat array, exactly as §5 specifies.
   */
  readonly sourceAdTemplateId?: string;
  readonly createdAt: number;
  readonly updatedAt: number;
};
