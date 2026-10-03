import { colorFill, roleFill, type FxInstance, type Keyframe, type Layer, type Rect, type Size } from '@/core/types';
import type { LockupPosition, LogoSettings } from '@/document/types';
import { fontString } from '@/fonts/registry';
import type { TextSpec } from '@/core/text/layout';
import { contentFloor } from '@/templates/_shared/chrome';

/**
 * §8.3's logo and its lockup, drawn by the renderer itself (D-101).
 *
 * The logo used to be one more layer in every template's `build()`. That made
 * it part of the build key, and the key carried the logo's placement *mode* but
 * not its position — so dragging a logo in "Free" moved its selection box and
 * left the logo where it was, which is exactly what was reported. Putting the
 * position in the key would have re-run the whole template on every pointer
 * move. So the logo is built here instead, from its own settings, cheaply, and
 * the template never knows it exists.
 *
 * The lockup is laid out against the logo as it actually appears. A wide
 * wordmark drawn "contain" into a square box used to leave the text hanging a
 * third of a box below the mark; now the text sits a fixed gap from the
 * visible edge, wherever it has been put, and moves with the logo as one.
 */

export const LOCKUP_SIZE_DEFAULT = 26;

/** The lockup's face: the scene's body font, as it always was. */
export const LOCKUP_FONT = 'body';
const LOCKUP_WEIGHT = 600;
const LOCKUP_TRACKING_PCT = 6;
const LOCKUP_LINE_HEIGHT = 1.2;

/**
 * How the lockup is measured — by the renderer to lay it out, and by the
 * editor to put a selection box round it. One spec, so the two cannot drift.
 */
export function lockupSpec(text: string, fontSizePx: number): TextSpec {
  return {
    text,
    font: fontString(LOCKUP_FONT, fontSizePx, LOCKUP_WEIGHT),
    fontSizePx,
    letterSpacingPx: (LOCKUP_TRACKING_PCT / 100) * fontSizePx,
    lineHeight: LOCKUP_LINE_HEIGHT,
    align: 'left',
    maxWidthPx: null,
  };
}

export type LogoGeometry = {
  /** The visible logo image, centre and size. */
  readonly image: { readonly cx: number; readonly cy: number; readonly w: number; readonly h: number };
  /** The lockup's text block, top-left and size, or null when there is none. */
  readonly lockup: {
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
    readonly fontSizePx: number;
    readonly align: 'left' | 'center' | 'right';
  } | null;
  /** Everything together: what moves when the logo is dragged. */
  readonly unit: Rect;
};

/** Measures the lockup text at a font size. Null when it cannot be measured. */
export type LockupMeasure = (text: string, fontSizePx: number) => { w: number; h: number } | null;

export function lockupPosition(logo: LogoSettings): LockupPosition {
  return logo.lockupPosition ?? 'below';
}

export function hasLockup(logo: LogoSettings): boolean {
  return logo.lockup && logo.lockupText.trim().length > 0;
}

/**
 * Where the logo and its lockup go.
 *
 * In "Free", `x`/`y` place the logo image's centre within the safe box — the
 * same meaning they always had, so saved projects keep their logos where they
 * were. Pinned to a corner, the *whole unit* is pinned, so a lockup below a
 * bottom-left logo stays inside the frame instead of hanging off it.
 */
export function logoGeometry(
  logo: LogoSettings,
  design: Size,
  safe: Rect,
  /** The logo image's width over its height; 1 until it has decoded. */
  imageAspect: number,
  measure: LockupMeasure,
): LogoGeometry {
  const unitLength = Math.min(design.w, design.h);
  const size = unitLength * (logo.sizePct / 100);
  const aspect = Number.isFinite(imageAspect) && imageAspect > 0 ? imageAspect : 1;
  const iw = aspect >= 1 ? size : size * aspect;
  const ih = aspect >= 1 ? size / aspect : size;

  // The unit laid out about the image's centre.
  let minX = -iw / 2;
  let maxX = iw / 2;
  let minY = -ih / 2;
  let maxY = ih / 2;
  const text = lockupBlock(logo, size, iw, ih, measure);
  if (text) {
    minX = Math.min(minX, text.x);
    maxX = Math.max(maxX, text.x + text.w);
    minY = Math.min(minY, text.y);
    maxY = Math.max(maxY, text.y + text.h);
  }

  const [cx, cy] = ((): [number, number] => {
    const right = safe.x + safe.w;
    // Pinned to the bottom, it stops above the band the free-tier watermark
    // uses, as every template's own content does — a logo and its lockup
    // printed over "Made with…" read as two marks fighting.
    const bottom = contentFloor(design, safe);
    switch (logo.placement) {
      case 'topLeft': return [safe.x - minX, safe.y - minY];
      case 'topRight': return [right - maxX, safe.y - minY];
      case 'bottomLeft': return [safe.x - minX, bottom - maxY];
      case 'bottomRight': return [right - maxX, bottom - maxY];
      case 'center': return [safe.x + safe.w / 2 - (minX + maxX) / 2, safe.y + safe.h / 2 - (minY + maxY) / 2];
      case 'free': return [safe.x + safe.w * logo.x, safe.y + safe.h * logo.y];
    }
  })();

  return {
    image: { cx, cy, w: iw, h: ih },
    lockup: text ? { ...text, x: cx + text.x, y: cy + text.y } : null,
    unit: { x: cx + minX, y: cy + minY, w: maxX - minX, h: maxY - minY },
  };
}

type TextBlock = { x: number; y: number; w: number; h: number; fontSizePx: number; align: 'left' | 'center' | 'right' };

/** The lockup's block, about the image's centre, or null when there is none. */
function lockupBlock(logo: LogoSettings, size: number, iw: number, ih: number, measure: LockupMeasure): TextBlock | null {
  if (!hasLockup(logo)) return null;
  const fontSizePx = size * ((logo.lockupSizePct ?? LOCKUP_SIZE_DEFAULT) / 100);
  const block = measure(logo.lockupText, fontSizePx);
  if (!block) return null;
  const gap = fontSizePx * 0.45;
  switch (lockupPosition(logo)) {
    case 'above': return { x: -block.w / 2, y: -ih / 2 - gap - block.h, w: block.w, h: block.h, fontSizePx, align: 'center' };
    case 'right': return { x: iw / 2 + gap, y: -block.h / 2, w: block.w, h: block.h, fontSizePx, align: 'left' };
    case 'left': return { x: -iw / 2 - gap - block.w, y: -block.h / 2, w: block.w, h: block.h, fontSizePx, align: 'right' };
    case 'below': return { x: -block.w / 2, y: ih / 2 + gap, w: block.w, h: block.h, fontSizePx, align: 'center' };
  }
}

const kf = (t: number, v: number): Keyframe => ({ t, v, ease: 'outCubic' });

/**
 * The logo as one group layer: the image and its lockup together, so effects
 * and opacity apply to both and they can never drift apart.
 *
 * The group sits at the image's centre; its children are placed relative to
 * that. `fx` is the logo's element effects, already timed.
 */
export function logoLayer(
  logo: LogoSettings,
  geometry: LogoGeometry,
  durationMs: number,
  fx: readonly FxInstance[],
): Layer | null {
  if (logo.mediaId === null) return null;
  const { image, lockup } = geometry;

  const children: Layer[] = [
    {
      id: 'logo-image',
      type: 'image',
      startMs: 0,
      endMs: durationMs,
      tracks: {},
      props: { mediaId: logo.mediaId, w: image.w, h: image.h, fit: 'contain' },
    },
  ];

  if (lockup) {
    const fill = logo.lockupColor !== undefined && logo.lockupColor.length > 0 ? colorFill(logo.lockupColor) : roleFill('ink');
    children.push({
      id: 'logo-lockup',
      type: 'text',
      startMs: 0,
      endMs: durationMs,
      anchorX: 0,
      anchorY: 0,
      tracks: {
        x: [kf(0, lockup.x - image.cx)],
        y: [kf(0, lockup.y - image.cy)],
      },
      props: {
        text: logo.lockupText,
        fontId: LOCKUP_FONT,
        fontSizePx: lockup.fontSizePx,
        weight: LOCKUP_WEIGHT,
        letterSpacingPct: LOCKUP_TRACKING_PCT,
        lineHeight: LOCKUP_LINE_HEIGHT,
        align: lockup.align,
        fill,
        // Wrapping off: one line, laid out at its own measured width, so the
        // block the renderer paints is exactly the block the geometry placed.
        maxWidthPx: null,
        reveal: { kind: 'none' },
        shadow: { blur: lockup.fontSizePx * 0.5, offsetX: 0, offsetY: 0, paint: colorFill('rgba(0,0,0,0.45)') },
      },
    });
  }

  return {
    id: 'logo',
    type: 'group',
    startMs: 0,
    endMs: durationMs,
    tracks: {
      x: [kf(0, image.cx)],
      y: [kf(0, image.cy)],
      opacity: [kf(0, 0), kf(700, logo.opacity)],
    },
    // The whole unit, so a shine or a glow covers the lockup as well as the mark.
    props: {
      box: {
        x: geometry.unit.x - image.cx,
        y: geometry.unit.y - image.cy,
        w: geometry.unit.w,
        h: geometry.unit.h,
      },
    },
    ...(fx.length > 0 ? { fx } : {}),
    children,
  };
}
