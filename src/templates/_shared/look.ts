import type { Palette } from '@/core/types';
import type { TextStyle } from '@/document/types';
import type { LookDef, NamedPalette } from '../schema';

/**
 * Shared palettes and look defaults.
 *
 * Templates pick from this set rather than inventing colours, so the one-click
 * preset palettes in §8.4 mean the same thing everywhere and a project keeps
 * looking deliberate when the user switches template.
 *
 * Roles, per §5: bg, surface, ink, inkMuted, accent.
 */

export const PALETTES = {
  midnight: {
    id: 'midnight',
    label: 'Midnight',
    palette: { bg: '#0c0c11', surface: '#1b1b27', ink: '#f5f5f7', inkMuted: '#9a9aab', accent: '#7c6cf5' },
  },
  paper: {
    id: 'paper',
    label: 'Paper',
    palette: { bg: '#f4f2ed', surface: '#ffffff', ink: '#16161a', inkMuted: '#6d6d78', accent: '#1f4fd8' },
  },
  ember: {
    id: 'ember',
    label: 'Ember',
    palette: { bg: '#140c0a', surface: '#2a1713', ink: '#fdf3ee', inkMuted: '#b79a8e', accent: '#f4612b' },
  },
  forest: {
    id: 'forest',
    label: 'Forest',
    palette: { bg: '#07130f', surface: '#122720', ink: '#eef7f2', inkMuted: '#8fae9f', accent: '#34c07a' },
  },
  bone: {
    id: 'bone',
    label: 'Bone',
    palette: { bg: '#1a1917', surface: '#2b2925', ink: '#f6f1e7', inkMuted: '#a79f8f', accent: '#d8b45c' },
  },
  tide: {
    id: 'tide',
    label: 'Tide',
    palette: { bg: '#061018', surface: '#0f2431', ink: '#eaf6fb', inkMuted: '#8aa9b8', accent: '#25b6d6' },
  },
} as const satisfies Record<string, NamedPalette>;

export const ALL_PALETTES: readonly NamedPalette[] = Object.values(PALETTES);

export function paletteById(id: string): Palette {
  const found = ALL_PALETTES.find((p) => p.id === id);
  return found?.palette ?? PALETTES.midnight.palette;
}

/** The look most photo templates want: every palette, every background, all modifiers. */
export const FULL_LOOK: LookDef = {
  palettes: ALL_PALETTES,
  backgrounds: ['solid', 'gradient', 'blurredPhoto', 'pattern'],
  supportsCornerRadius: true,
  supportsGrain: true,
  supportsVignette: true,
};

/** For templates where the photo is the background and a treatment makes no sense. */
export const FULL_BLEED_LOOK: LookDef = {
  palettes: ALL_PALETTES,
  backgrounds: ['solid'],
  supportsCornerRadius: false,
  supportsGrain: true,
  supportsVignette: true,
};

export const HEADLINE_STYLE: Partial<TextStyle> = {
  fontId: 'headline',
  weight: 800,
  align: 'center',
  sizePct: 100,
  wrap: true,
  letterSpacingPct: -1.5,
};

export const BODY_STYLE: Partial<TextStyle> = {
  fontId: 'body',
  weight: 500,
  align: 'center',
  sizePct: 100,
  wrap: true,
  letterSpacingPct: 2,
};
