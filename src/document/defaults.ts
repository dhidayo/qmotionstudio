import type { Aspect, Palette } from '@/core/types';
import { SCHEMA_VERSION, type LookSettings, type Project, type Scene, type SceneInputs } from './types';

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

export const DEFAULT_SCENE_MS = 10_000;

/** crypto.randomUUID needs a secure context; localhost qualifies, so does https. */
function id(prefix: string): string {
  const uuid = globalThis.crypto.randomUUID();
  return `${prefix}_${uuid.slice(0, 8)}`;
}

export function emptySceneInputs(): SceneInputs {
  return {
    photos: [],
    texts: {},
    logo: null,
    look: DEFAULT_LOOK,
    styleOverrides: { texts: {} },
  };
}

export function createScene(templateId: string, durationMs = DEFAULT_SCENE_MS): Scene {
  return {
    id: id('scn'),
    templateId,
    durationMs,
    transitionIn: null,
    inputs: emptySceneInputs(),
  };
}

/**
 * '__demo__' renders the hand-written M1 scene; '__placeholder__' renders the
 * M0 test card. Both are replaced by real template ids at M2 — they exist so
 * the render core has something to draw before the registry does.
 */
export const DEMO_TEMPLATE_ID = '__demo__';
export const PLACEHOLDER_TEMPLATE_ID = '__placeholder__';

export function createProject(options?: {
  name?: string;
  aspect?: Aspect;
  templateId?: string;
}): Project {
  const timestamp = Date.now();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: id('prj'),
    name: options?.name ?? 'Untitled project',
    mode: 'showcase',
    aspect: options?.aspect ?? '9:16',
    scenes: [createScene(options?.templateId ?? DEMO_TEMPLATE_ID)],
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
