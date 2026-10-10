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

/** `picture` is a photograph of the person's own behind the design (D-120). */
export type BackgroundTreatment = 'solid' | 'gradient' | 'blurredPhoto' | 'pattern' | 'picture';

export type LookSettings = {
  readonly palette: Palette;
  readonly background: BackgroundTreatment;
  /** The photograph a `picture` background shows (D-120). */
  readonly backgroundMediaId?: string;
  /** How far the background colour is laid over that photograph, 0–1, so words stay readable. Absent: 0.35. */
  readonly backgroundDim?: number;
  readonly grain: number;
  readonly vignette: number;
  /** Multiplies time before layers are evaluated — never baked into keyframes. */
  readonly speed: number;
  readonly cornerRadius: number;
};

/** A look's colours and ground, as one restyle (D-121). */
export type LookRestyle = Pick<LookSettings, 'palette' | 'background' | 'vignette'>;

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

/** Where the lockup's text sits against the logo (D-101). */
export type LockupPosition = 'below' | 'above' | 'right' | 'left';

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
  /**
   * The lockup's layout (D-101). Optional so that every project saved before
   * they existed opens unchanged: text centred below the logo, at about a
   * quarter of its size, in the scene's ink colour.
   */
  readonly lockupPosition?: LockupPosition;
  /** Text size as a percentage of the logo's size. */
  readonly lockupSizePct?: number;
  /** A hex colour; empty or absent means the scene's ink. */
  readonly lockupColor?: string;
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

// ── Effects and motion (D-100, D-102) ─────────────────────────────────────

export type EffectParams = Readonly<Record<string, number | string | boolean>>;

/**
 * A frame effect placed in time: snow over a scene, lightning at a moment.
 *
 * `effectId` names an entry in the effect library (src/core/effects); the
 * library's ids are permanent. Times belong to the owner — a scene's own
 * clock for a scene effect, the project's for a timeline effect.
 */
export type EffectClip = {
  readonly id: string;
  readonly effectId: string;
  readonly startMs: number;
  readonly endMs: number;
  /** 0–1. */
  readonly intensity: number;
  readonly params: EffectParams;
};

/** When an element effect runs: as it arrives, as it leaves, or throughout. */
export type ElementPhase = 'enter' | 'exit' | 'during';

/**
 * An effect on one element — a template photo, a caption, an overlay, the
 * logo. Timed by phase rather than by clock, so it follows the element: an
 * exit effect stays on the element's exit when the scene is made longer.
 */
export type ElementEffect = {
  readonly id: string;
  readonly effectId: string;
  readonly phase: ElementPhase;
  /** How long the effect lasts, for 'enter' and 'exit'. 'during' runs throughout. */
  readonly durationMs: number;
  readonly intensity: number;
  readonly params: EffectParams;
};

/**
 * How a template's own animation is played (D-102).
 *
 *   strength  how far things move, zoom and turn: 1 is the design as made,
 *             0 is still, 2 is twice as much.
 *   feel      the easing of every move: the template's own, or one character
 *             applied throughout.
 */
export type MotionFeel = 'template' | 'smooth' | 'gentle' | 'snappy' | 'bouncy' | 'linear';

export type MotionTuning = {
  readonly strength: number;
  readonly feel: MotionFeel;
};

export const NO_TUNING: MotionTuning = { strength: 1, feel: 'template' };

/** The key element effects use for the logo, alongside the slot keys. */
export const LOGO_KEY = 'logo';

export type SceneInputs = {
  readonly photos: readonly PhotoInput[];
  readonly texts: Readonly<Record<string, string>>;
  readonly logo: LogoSettings;
  readonly look: LookSettings;
  readonly styleOverrides: StyleOverrides;
  /** Per-slot nudges, keyed by `slotKey()`. Absent means untouched. */
  readonly slotTransforms: Readonly<Record<SlotKey, SlotTransform>>;
  /**
   * Effects over the whole scene, in the scene's own time (D-100). All of the
   * effect fields are optional: a project that never uses them is saved, and
   * opens, exactly as before.
   */
  readonly effects?: readonly EffectClip[];
  /** Effects on the scene's elements, by slot key or `LOGO_KEY`. */
  readonly elementEffects?: Readonly<Record<string, readonly ElementEffect[]>>;
  /** How the template's animation plays, for the whole scene (D-102). */
  readonly motion?: MotionTuning;
  /** …and for one element, overriding the scene's. */
  readonly slotMotion?: Readonly<Record<SlotKey, MotionTuning>>;
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
  /** Element effects on this overlay, on top of its entrance and exit (D-100). */
  readonly effects?: readonly ElementEffect[];
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
  /**
   * Effects on the timeline itself, in project time (D-100) — Corporate Ads
   * only. They cover everything, scenes and layers alike, and stay where they
   * were put when scenes move.
   */
  readonly effects?: readonly EffectClip[];
  readonly brand: Brand;
  /**
   * D-013. Set when the project was expanded from a multi-scene ad template.
   * Provenance only — scenes stay a flat array, exactly as §5 specifies.
   */
  readonly sourceAdTemplateId?: string;
  readonly createdAt: number;
  readonly updatedAt: number;
};
