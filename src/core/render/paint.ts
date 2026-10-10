import type { Paint, Palette } from '@/core/types';

/**
 * D-006. Resolves a Paint to a canvas fill string at draw time.
 *
 * Because role references are resolved here and not baked into layers by
 * build(), changing a palette colour repaints the next frame without
 * invalidating the template's memoised output.
 */
export function resolvePaint(paint: Paint, palette: Palette): string {
  if (paint.kind === 'color') return paint.value;
  const base = paint.role === 'onAccent' ? onAccent(palette.accent) : palette[paint.role];
  return paint.alpha === undefined ? base : withAlpha(base, paint.alpha);
}

const ON_LIGHT = '#141418';
const ON_DARK = '#ffffff';
const onAccentCache = new Map<string, string>();

/**
 * What reads on the accent (D-126): near-black or white, whichever has the
 * higher contrast with it. Per accent colour, remembered — it is asked for on
 * every frame by every button.
 */
export function onAccent(accent: string): string {
  const known = onAccentCache.get(accent);
  if (known !== undefined) return known;
  const l = luminance(accent);
  // Contrast against white and against near-black (luminance ~0.007).
  const withWhite = 1.05 / (l + 0.05);
  const withBlack = (l + 0.05) / (0.007 + 0.05);
  const chosen = withBlack > withWhite ? ON_LIGHT : ON_DARK;
  if (onAccentCache.size > 64) onAccentCache.clear();
  onAccentCache.set(accent, chosen);
  return chosen;
}

/** WCAG relative luminance of #rgb / #rrggbb; mid-grey for anything else. */
function luminance(color: string): number {
  const hex = color.trim().replace(/^#/, '');
  const full = hex.length === 3 ? hex.replace(/./g, (c) => c + c) : hex.slice(0, 6);
  if (!/^[0-9a-f]{6}$/i.test(full)) return 0.2;
  const channel = (i: number): number => {
    const c = Number.parseInt(full.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

/** Accepts #rgb, #rrggbb and #rrggbbaa; multiplies any existing alpha. */
export function withAlpha(color: string, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha));
  const hex = color.trim();

  if (hex.startsWith('#')) {
    const body = hex.slice(1);
    const expand = (s: string): number => parseInt(s.length === 1 ? s + s : s, 16);

    if (body.length === 3 || body.length === 4) {
      const r = expand(body[0] ?? '0');
      const g = expand(body[1] ?? '0');
      const b = expand(body[2] ?? '0');
      const existing = body.length === 4 ? expand(body[3] ?? 'f') / 255 : 1;
      return `rgba(${r}, ${g}, ${b}, ${a * existing})`;
    }
    if (body.length === 6 || body.length === 8) {
      const r = expand(body.slice(0, 2));
      const g = expand(body.slice(2, 4));
      const b = expand(body.slice(4, 6));
      const existing = body.length === 8 ? expand(body.slice(6, 8)) / 255 : 1;
      return `rgba(${r}, ${g}, ${b}, ${a * existing})`;
    }
  }

  // Non-hex (named, rgb(), oklch()) — fall back to compositing at the call site.
  return color;
}
