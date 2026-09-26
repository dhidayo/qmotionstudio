import type { Aspect, Palette } from '@/core/types';
import {
  SCHEMA_VERSION,
  type LogoSettings,
  type LookSettings,
  type PhotoInput,
  type Project,
  type Scene,
  type SceneInputs,
  type TextStyle,
} from './types';

export const DEFAULT_PALETTE: Palette = {
  bg: '#101014',
  surface: '#1d1d26',
  ink: '#f4f4f6',
  inkMuted: '#a0a0ae',
  accent: '#7c6cf5',
};

export const DEFAULT_LOOK: LookSettings = {
  palette: DEFAULT_PALETTE,
  background: 'gradient',
  grain: 0,
  vignette: 0.15,
  speed: 1,
  cornerRadius: 24,
};

export const DEFAULT_LOGO: LogoSettings = {
  mediaId: null,
  sizePct: 12,
  placement: 'bottomRight',
  x: 0.88,
  y: 0.88,
  opacity: 1,
  lockup: false,
  lockupText: '',
};

export const DEFAULT_SCENE_MS = 10_000;

/** crypto.randomUUID needs a secure context; localhost qualifies, so does https. */
function id(prefix: string): string {
  const uuid = globalThis.crypto.randomUUID();
  return `${prefix}_${uuid.slice(0, 8)}`;
}

/** The same generator, for actions that mint scenes and overlays. */
export const newId = id;

export function emptySceneInputs(): SceneInputs {
  return {
    photos: [],
    texts: {},
    logo: DEFAULT_LOGO,
    look: DEFAULT_LOOK,
    styleOverrides: { texts: {} },
    slotTransforms: {},
  };
}

/**
 * Sample photos a new project starts with (§8.1's "Try sample photos" is the
 * same set). Ids only — the media store holds the pixels (§5).
 */
export const STARTER_PHOTO_IDS = [
  'sample:dune', 'sample:tide', 'sample:canopy', 'sample:ember',
  'sample:slate', 'sample:bloom', 'sample:dusk', 'sample:reef',
];

export function starterPhotos(count: number): PhotoInput[] {
  return STARTER_PHOTO_IDS.slice(0, count).map((mediaId) => ({
    mediaId,
    frame: '3:4' as const,
    sizeMode: 'template' as const,
    sizePct: 100,
    cropMode: 'template' as const,
  }));
}

/**
 * `photoCount` defaults to four, which suits most templates. Callers that know
 * the template's slots should pass them: a scene carrying four photographs
 * onto a one-slot template left the inspector's stepper reading "4 of 1" and
 * three unused images in the payload handed to the export worker.
 */
export const DEFAULT_PHOTO_COUNT = 4;

export function createScene(
  templateId: string,
  durationMs = DEFAULT_SCENE_MS,
  photoCount = DEFAULT_PHOTO_COUNT,
): Scene {
  return {
    id: id('scn'),
    templateId,
    durationMs,
    transitionIn: null,
    inputs: { ...emptySceneInputs(), photos: starterPhotos(photoCount) },
  };
}

/**
 * Two built-in scenes that are not templates: '__demo__' is the M1 render-core
 * fixture and '__placeholder__' is the M0 aspect test card. They are reachable
 * via ?scene= and exist so the renderer's own regressions stay visible
 * independently of whatever the template library happens to contain.
 */
export const DEFAULT_OVERLAY_TEXT_STYLE: TextStyle = {
  fontId: 'headline',
  weight: 700,
  align: 'center',
  sizePct: 100,
  color: '',
  wrap: true,
  shadow: true,
  outline: false,
  pill: false,
  wrapWidthPct: 100,
  letterSpacingPct: 0,
};

/** How long a freshly dropped overlay lasts before the user drags its edges. */
export const DEFAULT_OVERLAY_MS = 3_000;

export const DEMO_TEMPLATE_ID = '__demo__';
export const PLACEHOLDER_TEMPLATE_ID = '__placeholder__';

/** What a new project opens with. */
export const DEFAULT_TEMPLATE_ID = 'depth-parallax';

export function createProject(options?: {
  name?: string;
  aspect?: Aspect;
  templateId?: string;
  /** Sized to the template's own slot range by the caller that knows it. */
  photoCount?: number;
}): Project {
  const timestamp = Date.now();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: id('prj'),
    name: options?.name ?? 'Untitled project',
    mode: 'showcase',
    aspect: options?.aspect ?? '9:16',
    scenes: [createScene(options?.templateId ?? DEFAULT_TEMPLATE_ID, DEFAULT_SCENE_MS, options?.photoCount)],
    overlays: [],
    audio: [],
    brand: {
      logo: null,
      palette: DEFAULT_PALETTE,
      fontHeadline: 'headline',
      fontBody: 'body',
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
