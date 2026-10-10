import { describe, expect, it } from 'vitest';
import { ALL_PALETTES, LOOK_PRESETS, PALETTES, withLookPreset } from './look';
import { DEFAULT_LOOK } from '@/document/defaults';

/** WCAG relative luminance and contrast ratio. */
function luminance(hex: string): number {
  const channel = (i: number): number => {
    const c = Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe('palettes (D-121)', () => {
  it.each(ALL_PALETTES.map((p) => [p.id, p.palette] as const))('%s keeps its words readable', (_id, palette) => {
    expect(contrast(palette.ink, palette.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(palette.ink, palette.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(palette.inkMuted, palette.bg)).toBeGreaterThanOrEqual(3.5);
    // Accent carries numbers and badges, and bg-coloured words sit on it.
    expect(contrast(palette.accent, palette.bg)).toBeGreaterThanOrEqual(3.5);
  });

  it('offers a look for every palette, each once', () => {
    const ids = LOOK_PRESETS.map((look) => look.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(Object.keys(PALETTES).sort());
  });

  it('has light, colour and dark looks, and no vignette on light ground', () => {
    for (const tone of ['light', 'colour', 'dark'] as const) {
      expect(LOOK_PRESETS.filter((look) => look.tone === tone).length).toBeGreaterThanOrEqual(5);
    }
    for (const look of LOOK_PRESETS.filter((l) => l.tone !== 'dark')) expect(look.vignette).toBe(0);
  });

  it('restyles a look but keeps the person\'s own picture, speed and corners', () => {
    const cream = LOOK_PRESETS.find((look) => look.id === 'cream');
    if (!cream) throw new Error('no cream look');
    const mine = { ...DEFAULT_LOOK, background: 'picture' as const, backgroundMediaId: 'm1', speed: 1.5, cornerRadius: 4 };
    const next = withLookPreset(mine, cream);
    expect(next.palette).toEqual(cream.palette);
    expect(next.background).toBe('picture');
    expect(next.backgroundMediaId).toBe('m1');
    expect(next.speed).toBe(1.5);
    expect(next.cornerRadius).toBe(4);
    expect(withLookPreset(DEFAULT_LOOK, cream).background).toBe(cream.background);
  });
});
