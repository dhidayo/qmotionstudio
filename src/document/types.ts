import type { Aspect, Direction, Palette, PropValues, Rect } from '@/core/types';

/**
 * The document model (§5).
 *
 * The document holds ids, never pixels: decoded bitmaps and audio buffers live
 * in the media store, keyed by mediaId. That is what keeps undo snapshots cheap
 * and the autosave payload small.
 */

/** Bumped whenever this shape changes; migrate.ts upgrades older saves. */
export const SCHEMA_VERSION = 1;

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

export type SceneInputs = {
  readonly photos: readonly PhotoInput[];
  readonly texts: Readonly<Record<string, string>>;
  readonly logo: MediaRef | null;
  readonly look: LookSettings;
  readonly styleOverrides: StyleOverrides;
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

export type Overlay = {
  readonly id: string;
  /** 0 = L1, 1 = L2, … */
  readonly track: number;
  readonly startMs: number;
  readonly endMs: number;
  readonly kind: OverlayContent['kind'];
  readonly content: OverlayContent;
  readonly transform: PropValues;
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
