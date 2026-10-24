import { DEFAULT_OVERLAY_TEXT_STYLE } from './defaults';
import type {
  CounterContent, CounterFormat, ShapeContent, ShapeKind, StickerContent, TextStyle,
} from './types';

/**
 * The elements people add (D-158): what a new shape, sticker or number is
 * before anyone changes it. Pure, so the picker, the inspector's "Shape"
 * buttons and the tests agree on every default.
 *
 * Sizes are fractions of the frame's short edge (D-044), like everything an
 * overlay is made of, so an element added to a square post and one added to
 * a landscape thumbnail look the same size against the picture.
 */

/** The shapes, in the order the picker and the inspector show them. */
export const SHAPE_KINDS: readonly ShapeKind[] = [
  'rect', 'roundedRect', 'circle', 'pill', 'triangle', 'diamond', 'hexagon',
  'star', 'badge', 'heart', 'bubble', 'arrow', 'line',
];

/** What people call each shape. */
export const SHAPE_NAMES: Readonly<Record<ShapeKind, string>> = {
  rect: 'Box',
  roundedRect: 'Rounded box',
  circle: 'Circle',
  pill: 'Pill',
  triangle: 'Triangle',
  diamond: 'Diamond',
  hexagon: 'Hexagon',
  star: 'Star',
  badge: 'Seal',
  heart: 'Heart',
  bubble: 'Speech bubble',
  arrow: 'Arrow',
  line: 'Line',
};

type ShapeDefaults = Omit<ShapeContent, 'kind' | 'shape'>;

const SOLID: Pick<ShapeContent, 'fill' | 'stroke' | 'strokeWidth' | 'corner' | 'shadow'> = {
  fill: { role: 'accent' },
  stroke: null,
  strokeWidth: 0.008,
  corner: 0,
  shadow: false,
};

export const SHAPE_DEFAULTS: Readonly<Record<ShapeKind, ShapeDefaults>> = {
  rect: { ...SOLID, w: 0.4, h: 0.25 },
  roundedRect: { ...SOLID, w: 0.4, h: 0.25, corner: 0.35 },
  circle: { ...SOLID, w: 0.3, h: 0.3 },
  pill: { ...SOLID, w: 0.42, h: 0.14 },
  triangle: { ...SOLID, w: 0.3, h: 0.27 },
  diamond: { ...SOLID, w: 0.28, h: 0.32 },
  hexagon: { ...SOLID, w: 0.32, h: 0.28 },
  // A five-point star is a little wider than it is tall; this box keeps it true.
  star: { ...SOLID, w: 0.3, h: 0.285, points: 5, inner: 0.45 },
  badge: { ...SOLID, w: 0.3, h: 0.3, points: 18, inner: 0.86 },
  heart: { ...SOLID, w: 0.3, h: 0.27 },
  bubble: { ...SOLID, w: 0.42, h: 0.3, corner: 0.35, tail: 'left' },
  arrow: { ...SOLID, w: 0.4, h: 0.16 },
  // A line is its outline: no fill, the look's ink, a band to grab.
  line: { ...SOLID, w: 0.45, h: 0.06, fill: null, stroke: { role: 'ink' }, strokeWidth: 0.012, heads: 'none' },
};

/** A new shape of this kind, with any of its settings changed. */
export function makeShapeContent(shape: ShapeKind, patch: Partial<ShapeDefaults> = {}): ShapeContent {
  return { kind: 'shape', shape, ...SHAPE_DEFAULTS[shape], ...patch };
}

/**
 * The same shape as another kind — a box turned into a star from the
 * inspector. It keeps its size and colours; what only the new kind has
 * (points, a tail, arrowheads) starts from that kind's defaults. A line is
 * all outline, so a shape becoming one takes its fill as the line's colour,
 * and a line becoming a shape takes its colour as the fill.
 */
export function switchShape(c: ShapeContent, shape: ShapeKind): ShapeContent {
  if (c.shape === shape) return c;
  const defaults = SHAPE_DEFAULTS[shape];
  const { points: _p, inner: _i, heads: _h, tail: _t, ...common } = c;
  const next: ShapeContent = {
    ...common,
    shape,
    corner: defaults.corner,
    ...(defaults.points === undefined ? {} : { points: defaults.points }),
    ...(defaults.inner === undefined ? {} : { inner: defaults.inner }),
    ...(defaults.heads === undefined ? {} : { heads: defaults.heads }),
    ...(defaults.tail === undefined ? {} : { tail: defaults.tail }),
  };
  if (shape === 'line') {
    return { ...next, h: defaults.h, fill: null, stroke: c.stroke ?? c.fill ?? defaults.stroke, strokeWidth: Math.max(c.strokeWidth, defaults.strokeWidth) };
  }
  if (c.shape === 'line') {
    return { ...next, h: defaults.h, fill: c.stroke ?? SOLID.fill, stroke: null, strokeWidth: SOLID.strokeWidth };
  }
  return next;
}

/** A new sticker: playing, at its own pace, in its own colours and words. */
export function makeStickerContent(sticker: string): StickerContent {
  return { kind: 'sticker', sticker, play: 'loop', speed: 1 };
}

/** A number is set big and heavy, and never wraps. */
export const DEFAULT_COUNTER_STYLE: TextStyle = {
  ...DEFAULT_OVERLAY_TEXT_STYLE,
  weight: 800,
  sizePct: 220,
  wrap: false,
  shadow: false,
};

export const DEFAULT_COUNTER_FORMAT: CounterFormat = {
  decimals: 0,
  grouping: 'comma',
  compact: false,
  prefix: '',
  suffix: '',
};

/** The most characters before or after a number. */
export const COUNTER_AFFIX_MAX = 12;
/** The largest figure a number can show, either way. */
export const COUNTER_LIMIT = 1e12;

/** A new number: counting from 0 to 1,000 over two seconds, just after it appears. */
export function makeCounterContent(
  patch: Partial<Omit<CounterContent, 'kind' | 'format' | 'style'>> & {
    readonly format?: Partial<CounterFormat>;
    readonly style?: Partial<TextStyle>;
  } = {},
): CounterContent {
  const { format, style, ...rest } = patch;
  return {
    kind: 'counter',
    from: 0,
    to: 1000,
    delayMs: 200,
    countMs: 2000,
    ease: 'smooth',
    ...rest,
    format: { ...DEFAULT_COUNTER_FORMAT, ...format },
    style: { ...DEFAULT_COUNTER_STYLE, ...style },
  };
}
