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
  const base = palette[paint.role];
  return paint.alpha === undefined ? base : withAlpha(base, paint.alpha);
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
