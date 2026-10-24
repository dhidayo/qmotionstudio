import {
  colorFill, roleFill,
  type EaseName, type Paint, type ShapeGeometry, type ShapeProps, type StickerProps, type TextProps,
} from '@/core/types';
import type { CounterContent, CounterEase, ElementColor, ShapeContent, ShapeKind, StickerContent, TextStyle } from '@/document/types';
import { stickerDef } from '@/core/stickers/catalog';
import { widestCounterText } from '@/core/text/counter';

/**
 * The elements people add (D-158) — shapes, stickers and numbers — as the
 * props of the layers that draw them.
 *
 * One translation, used by the overlay builder, the selection box (through
 * it) and the picker's previews, so a shape in the picker is the shape that
 * lands on the picture. Sizes are fractions of the frame's short edge, the
 * `unit` (D-044), so an element keeps its size against the frame in every
 * frame shape.
 */

/** A text overlay at 100% is this much of the short edge. */
export const TEXT_BASE = 0.062;
/** A sticker's longer side, unless its own definition says otherwise. */
export const STICKER_BASE = 0.3;

/** A colour on an element as a paint: a role restyles with the look; null is none. */
export function elementPaint(color: ElementColor): Paint | null {
  if (color === null) return null;
  return 'role' in color ? roleFill(color.role) : colorFill(color.hex);
}

/**
 * The props of a text overlay's words, in a given style. Shared by text and
 * by numbers, which are words that count.
 */
export function overlayTextProps(text: string, style: TextStyle, unit: number): Omit<TextProps, 'reveal'> {
  const fontSizePx = unit * TEXT_BASE * (style.sizePct / 100);
  const fill: Paint = style.color.length > 0 ? colorFill(style.color) : style.pill ? roleFill('onAccent') : roleFill('ink');
  const maxWidthPx = style.wrap ? unit * 0.8 * (style.wrapWidthPct / 100) : null;
  return {
    text,
    fontId: style.fontId,
    fontSizePx,
    weight: style.weight,
    letterSpacingPct: style.letterSpacingPct,
    lineHeight: 1.16,
    align: style.align,
    fill,
    maxWidthPx,
    ...(style.shadow
      ? { shadow: { blur: fontSizePx * 0.3, offsetX: 0, offsetY: fontSizePx * 0.07, paint: colorFill('rgba(0,0,0,0.55)') } }
      : {}),
    ...(style.outline ? { outline: { paint: roleFill('bg'), width: Math.max(1, fontSizePx * 0.055) } } : {}),
    ...(style.pill
      ? { pill: { paint: roleFill('accent'), paddingX: fontSizePx * 0.55, paddingY: fontSizePx * 0.3, radius: fontSizePx * 0.6 } }
      : {}),
  };
}

// ── Shapes ──────────────────────────────────────────────────────────────────

/** What each shape people choose is drawn as. Rounded boxes and pills are rectangles with corners. */
const GEOMETRY: Record<ShapeKind, ShapeGeometry> = {
  rect: 'rect',
  roundedRect: 'rect',
  pill: 'rect',
  circle: 'ellipse',
  line: 'line',
  arrow: 'arrow',
  triangle: 'triangle',
  diamond: 'diamond',
  hexagon: 'hexagon',
  star: 'star',
  badge: 'badge',
  heart: 'heart',
  bubble: 'bubble',
};

/** A line's box is at least this many times its thickness, so there is always something to grab. */
const LINE_BAND = 3;

export function shapeProps(c: ShapeContent, unit: number): ShapeProps {
  const line = c.shape === 'line';
  const strokePx = Math.max(0, c.strokeWidth) * unit;
  const w = Math.max(1, c.w * unit);
  const h = line ? Math.max(c.h * unit, strokePx * LINE_BAND) : Math.max(1, c.h * unit);
  const fill = elementPaint(c.fill);
  // A line is drawn by its outline; one with no colour of its own takes the fill's, then the ink.
  const strokePaint = line ? elementPaint(c.stroke) ?? fill ?? roleFill('ink') : elementPaint(c.stroke);
  const radius = c.shape === 'pill' ? Math.min(w, h) / 2 : Math.max(0, Math.min(1, c.corner)) * (Math.min(w, h) / 2);

  return {
    shape: GEOMETRY[c.shape],
    w,
    h,
    // Hollow shapes keep a paint, as ShapeProps requires; it is never drawn.
    fill: fill ?? strokePaint ?? roleFill('accent'),
    ...(fill === null || line ? { hollow: true } : {}),
    ...(radius > 0 ? { cornerRadius: radius } : {}),
    ...(strokePaint !== null && strokePx > 0 ? { stroke: { paint: strokePaint, width: strokePx } } : {}),
    ...(c.shadow ? { shadow: { blur: unit * 0.03, offsetX: 0, offsetY: unit * 0.012, paint: colorFill('rgba(0,0,0,0.35)') } } : {}),
    ...(c.points === undefined ? {} : { points: c.points }),
    ...(c.inner === undefined ? {} : { inner: c.inner }),
    ...(c.heads === undefined ? {} : { heads: c.heads }),
    ...(c.tail === undefined ? {} : { tail: c.tail }),
    ...(c.dash === true ? { dash: true } : {}),
  };
}

// ── Stickers ────────────────────────────────────────────────────────────────

/** The sticker's box: its longer side as its definition says, the other from its aspect. */
export function stickerSize(id: string, unit: number): { w: number; h: number } {
  const def = stickerDef(id);
  const aspect = def && def.aspect > 0 ? def.aspect : 1;
  const longest = (def?.size ?? STICKER_BASE) * unit;
  return aspect >= 1 ? { w: longest, h: longest / aspect } : { w: longest * aspect, h: longest };
}

export function stickerProps(c: StickerContent, unit: number, seed: number): StickerProps {
  const def = stickerDef(c.sticker);
  const labels: Record<string, string> = {};
  for (const label of def?.labels ?? []) labels[label.key] = c.labels?.[label.key] ?? label.text;
  const own = (color: ElementColor | undefined, fallback: Paint): Paint =>
    color === undefined ? fallback : elementPaint(color) ?? fallback;
  return {
    sticker: c.sticker,
    ...stickerSize(c.sticker, unit),
    labels,
    primary: own(c.primary, def?.primary ?? roleFill('accent')),
    secondary: own(c.secondary, def?.secondary ?? roleFill('onAccent')),
    play: c.play,
    speed: Math.max(0.1, c.speed),
    flip: c.flip === true && def?.flippable === true,
    seed,
  };
}

// ── Numbers ─────────────────────────────────────────────────────────────────

/** What each feel of a count is, as an easing. */
export const COUNTER_EASE: Record<CounterEase, EaseName> = {
  smooth: 'outCubic',
  steady: 'linear',
  snappy: 'outExpo',
  gentle: 'inOutCubic',
};

/**
 * A number element: its words are the longest figure it writes, so the
 * selection box is the same size for the whole count, and the `counter`
 * reveal writes the figure of the moment.
 *
 * Numbers never wrap. Their block is given a width all the same — wider than
 * any figure of that many characters can be — because a text layer is
 * anchored on its block (drawLayer's boxOf), and without one a number would
 * hang from its top-left corner: added in the middle, it would sit below and
 * right of it, and grow from its corner when resized.
 */
export function counterTextProps(c: CounterContent, unit: number): TextProps {
  const widest = widestCounterText(c.from, c.to, c.format);
  const base = overlayTextProps(widest, { ...c.style, wrap: false }, unit);
  const perChar = base.fontSizePx * (1.1 + Math.max(0, base.letterSpacingPct) / 100);
  const lineHeightPx = base.fontSizePx * base.lineHeight;
  return {
    ...base,
    maxWidthPx: Math.max(1, Array.from(widest).length) * perChar,
    // Round ends: a single digit in a circle, a longer figure in a capsule.
    ...(base.pill ? { pill: { ...base.pill, paddingX: base.pill.paddingY, radius: lineHeightPx } } : {}),
    reveal: {
      kind: 'counter',
      from: c.from,
      to: c.to,
      startMs: Math.max(0, c.delayMs),
      durationMs: Math.max(0, c.countMs),
      ease: COUNTER_EASE[c.ease],
      format: c.format,
    },
  };
}
