import { ASPECT_RATIO, type Aspect, type Rect, type Size } from '@/core/types';

/** Width ÷ height. 16:9 → 1.777…, 9:16 → 0.5625. */
export function aspectValue(aspect: Aspect): number {
  const [w, h] = ASPECT_RATIO[aspect];
  return w / h;
}

export function isPortrait(aspect: Aspect): boolean {
  return aspectValue(aspect) < 1;
}

/** H.264 4:2:0 requires even dimensions; rounding up keeps the short edge honest. */
function even(n: number): number {
  const r = Math.round(n);
  return r % 2 === 0 ? r : r + 1;
}

/**
 * Canonical render size for an aspect at a quality tier.
 *
 * The tier names the *short* edge, which is the social-video convention: 1080p
 * is 1920×1080 landscape but 1080×1920 portrait, and 4:5 is 1080×1350. Sizing
 * off the long edge instead would make a 9:16 export 608px wide, which is not
 * what anyone means by "1080p".
 */
export function renderSizeFor(aspect: Aspect, shortEdge: number): Size {
  const ratio = aspectValue(aspect);
  // Round the short edge to even FIRST, then derive the long edge from the
  // rounded value. Deriving it from the raw input instead leaves the two edges
  // describing slightly different rectangles — 702×1246 rather than 702×1248.
  const short = even(shortEdge);
  return ratio >= 1
    ? { w: even(short * ratio), h: short }
    : { w: short, h: even(short / ratio) };
}

/**
 * The bridge between a template's coordinate system and real pixels.
 *
 * §6.5 requires *one uniform scale* — so a circle stays a circle at every
 * aspect. We anchor that scale to the short edge and let the long edge grow,
 * which means the template sees a wider or taller canvas in its own units and
 * lays out into it, rather than being letterboxed or stretched.
 */
export type Viewport = {
  readonly aspect: Aspect;
  /** Canvas backing-store pixels. */
  readonly px: Size;
  /** The same canvas expressed in the template's design units. */
  readonly design: Size;
  /** Pixels per design unit. Uniform on both axes, by construction. */
  readonly scale: number;
  /** Content-safe rectangle, in design units. */
  readonly safe: Rect;
};

export const DEFAULT_SAFE_INSET = 0.055;

export function makeViewport(
  aspect: Aspect,
  px: Size,
  designSize: Size,
  safeInset: number = DEFAULT_SAFE_INSET,
): Viewport {
  const designShort = Math.min(designSize.w, designSize.h);
  const pxShort = Math.min(px.w, px.h);
  const scale = pxShort / designShort;

  const design: Size = { w: px.w / scale, h: px.h / scale };

  const inset = designShort * safeInset;
  const safe: Rect = {
    x: inset,
    y: inset,
    w: Math.max(0, design.w - inset * 2),
    h: Math.max(0, design.h - inset * 2),
  };

  return { aspect, px, design, scale, safe };
}

/** Largest box of the given ratio that fits inside `bounds`, centred. */
export function fitContain(bounds: Size, ratio: number): Rect {
  const boundsRatio = bounds.w / bounds.h;
  const w = boundsRatio > ratio ? bounds.h * ratio : bounds.w;
  const h = boundsRatio > ratio ? bounds.h : bounds.w / ratio;
  return { x: (bounds.w - w) / 2, y: (bounds.h - h) / 2, w, h };
}
