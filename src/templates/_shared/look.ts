import type { Palette } from '@/core/types';
import type { BackgroundTreatment, LookSettings, TextStyle } from '@/document/types';
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
  // Light, warm and coloured grounds (D-121): "an offwhite background, creamy
  // background, different colors, may create diversity that users can relate to".
  linen: {
    id: 'linen',
    label: 'Linen',
    palette: { bg: '#f5f1ea', surface: '#ffffff', ink: '#1c1b1f', inkMuted: '#66626c', accent: '#d9481f' },
  },
  cream: {
    id: 'cream',
    label: 'Cream',
    palette: { bg: '#f2e6d0', surface: '#fbf5ea', ink: '#2a1f16', inkMuted: '#6f5d48', accent: '#a5441b' },
  },
  blush: {
    id: 'blush',
    label: 'Blush',
    palette: { bg: '#f8e4de', surface: '#fff4f1', ink: '#3b1c22', inkMuted: '#82555c', accent: '#c22f4c' },
  },
  sky: {
    id: 'sky',
    label: 'Sky',
    palette: { bg: '#e1edf9', surface: '#f6fafe', ink: '#0e223a', inkMuted: '#51667f', accent: '#1d5bd0' },
  },
  mint: {
    id: 'mint',
    label: 'Mint',
    palette: { bg: '#dff2e8', surface: '#f4fbf7', ink: '#0e2b1f', inkMuted: '#4b6f5f', accent: '#08804f' },
  },
  lilac: {
    id: 'lilac',
    label: 'Lilac',
    palette: { bg: '#e9e3fb', surface: '#f7f5ff', ink: '#211747', inkMuted: '#625988', accent: '#6441d6' },
  },
  sunshine: {
    id: 'sunshine',
    label: 'Sunshine',
    palette: { bg: '#ffd23f', surface: '#ffe383', ink: '#1a1710', inkMuted: '#4f4520', accent: '#b8261d' },
  },
  coral: {
    id: 'coral',
    label: 'Coral',
    palette: { bg: '#ff6f5e', surface: '#ff8f80', ink: '#1d1426', inkMuted: '#45262b', accent: '#2b1d6b' },
  },
  terracotta: {
    id: 'terracotta',
    label: 'Terracotta',
    palette: { bg: '#a94a28', surface: '#bd5f3b', ink: '#fff7f0', inkMuted: '#f6d6c4', accent: '#ffd59a' },
  },
  cobalt: {
    id: 'cobalt',
    label: 'Cobalt',
    palette: { bg: '#1d3fcf', surface: '#2c50e0', ink: '#ffffff', inkMuted: '#c9d2fb', accent: '#ffd23f' },
  },
  emerald: {
    id: 'emerald',
    label: 'Emerald',
    palette: { bg: '#0d5e45', surface: '#137556', ink: '#f2fff9', inkMuted: '#b3e0cf', accent: '#ffcf5a' },
  },
  navy: {
    id: 'navy',
    label: 'Navy',
    palette: { bg: '#0e1b3d', surface: '#1a2b57', ink: '#f4f6fb', inkMuted: '#9aa7c7', accent: '#f3b23f' },
  },
  orchid: {
    id: 'orchid',
    label: 'Orchid',
    palette: { bg: '#33124a', surface: '#4b1d68', ink: '#fdf3ff', inkMuted: '#c5a5d8', accent: '#ff6fcf' },
  },
} as const satisfies Record<string, NamedPalette>;

export type PaletteId = keyof typeof PALETTES;

/**
 * A look (D-121): a palette and the ground it sits on, applied in one tap —
 * the same design, restyled. Light grounds carry no vignette: darkened
 * corners read as dirt on cream, not as atmosphere.
 */
export type LookPreset = {
  readonly id: PaletteId;
  readonly label: string;
  readonly palette: Palette;
  readonly background: BackgroundTreatment;
  readonly vignette: number;
  readonly tone: 'light' | 'colour' | 'dark';
};

const preset = (id: PaletteId, background: BackgroundTreatment, tone: LookPreset['tone']): LookPreset => ({
  id,
  label: PALETTES[id].label,
  palette: PALETTES[id].palette,
  background,
  vignette: tone === 'dark' ? 0.15 : 0,
  tone,
});

/** In the order the Style tab shows them: light, then colour, then dark. */
export const LOOK_PRESETS: readonly LookPreset[] = [
  preset('linen', 'solid', 'light'),
  preset('paper', 'gradient', 'light'),
  preset('cream', 'gradient', 'light'),
  preset('blush', 'solid', 'light'),
  preset('sky', 'gradient', 'light'),
  preset('mint', 'solid', 'light'),
  preset('lilac', 'gradient', 'light'),
  preset('sunshine', 'solid', 'colour'),
  preset('coral', 'solid', 'colour'),
  preset('terracotta', 'gradient', 'colour'),
  preset('cobalt', 'gradient', 'colour'),
  preset('emerald', 'gradient', 'colour'),
  preset('midnight', 'gradient', 'dark'),
  preset('navy', 'gradient', 'dark'),
  preset('orchid', 'gradient', 'dark'),
  preset('ember', 'gradient', 'dark'),
  preset('forest', 'gradient', 'dark'),
  preset('tide', 'gradient', 'dark'),
  preset('bone', 'pattern', 'dark'),
];

export function lookPreset(id: string): LookPreset | undefined {
  return LOOK_PRESETS.find((look) => look.id === id);
}

/**
 * A scene's look restyled by a preset. Speed, corner radius and grain are the
 * person's and stay; so does a background picture of their own, which the
 * preset's colour then dims (D-120).
 */
export function withLookPreset(look: LookSettings, preset: LookPreset): LookSettings {
  return {
    ...look,
    palette: preset.palette,
    background: look.background === 'picture' ? 'picture' : preset.background,
    vignette: preset.vignette,
  };
}

export const ALL_PALETTES: readonly NamedPalette[] = Object.values(PALETTES);

export function paletteById(id: string): Palette {
  const found = ALL_PALETTES.find((p) => p.id === id);
  return found?.palette ?? PALETTES.midnight.palette;
}

/** The look most photo templates want: every palette, every background, all modifiers. */
export const FULL_LOOK: LookDef = {
  palettes: ALL_PALETTES,
  backgrounds: ['solid', 'gradient', 'pattern', 'blurredPhoto', 'picture'],
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
