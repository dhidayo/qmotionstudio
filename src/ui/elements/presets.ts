import type { AnimPreset, CounterContent, ShapeContent, StickerContent } from '@/document/types';
import {
  makeCounterContent, makeShapeContent, makeStickerContent, SHAPE_KINDS, SHAPE_NAMES,
} from '@/document/elements';
import { STICKER_CATEGORIES, STICKERS } from '@/core/stickers/catalog';
import type { StickerCategory } from '@/core/stickers/types';

/**
 * What the elements picker offers (D-158): every shape, a few ready-made
 * outlines and lines, every sticker in the library — whatever STICKERS holds
 * — and numbers set up for the jobs people use them for.
 *
 * Presets use ASCII and Latin-1 only: the app loads the Latin subsets of its
 * fonts, so a "€" or "₦" would draw in a fallback face (people can still type
 * their own).
 */

export type ElementTile = {
  /** Permanent within the picker: "shape:star", "sticker:check", "counter:followers". */
  readonly id: string;
  readonly name: string;
  readonly group: 'Shapes' | 'Stickers' | 'Numbers';
  /** The sticker's own category, for the sub-chips and headings. */
  readonly stickerCategory?: StickerCategory;
  /** Words a search matches as well as the name. */
  readonly keywords: string;
  readonly content: ShapeContent | StickerContent | CounterContent;
  /** How it arrives when added. */
  readonly enterAnim: AnimPreset;
};

/** Extra words people search shapes by. */
const KEYWORDS: Partial<Record<(typeof SHAPE_KINDS)[number], string>> = {
  rect: 'rectangle square block banner',
  roundedRect: 'rectangle card button panel',
  circle: 'round dot ellipse oval',
  pill: 'capsule button tag label',
  triangle: 'play pointer',
  diamond: 'rhombus',
  hexagon: 'honeycomb',
  star: 'rating favourite favorite',
  badge: 'seal stamp burst sticker sale',
  heart: 'love like',
  bubble: 'speech comment quote chat callout',
  arrow: 'direction next pointer',
  line: 'divider rule stroke',
};

const shapeTile = (id: string, name: string, content: ShapeContent, keywords = ''): ElementTile => ({
  id: `shape:${id}`,
  name,
  group: 'Shapes',
  keywords: `shape ${keywords}`,
  content,
  enterAnim: 'fade',
});

const SHAPES: readonly ElementTile[] = [
  ...SHAPE_KINDS.map((kind) => shapeTile(kind, SHAPE_NAMES[kind], makeShapeContent(kind), KEYWORDS[kind] ?? '')),
  shapeTile('outline-box', 'Outline box', makeShapeContent('roundedRect', { fill: null, stroke: { role: 'accent' }, strokeWidth: 0.01, corner: 0.2 }), 'frame border outline'),
  shapeTile('outline-circle', 'Outline circle', makeShapeContent('circle', { fill: null, stroke: { role: 'accent' }, strokeWidth: 0.01 }), 'ring frame outline'),
  shapeTile('arrow-line', 'Pointing line', makeShapeContent('line', { heads: 'end' }), 'arrow pointer'),
  shapeTile('dashed-line', 'Dashed line', makeShapeContent('line', { dash: true }), 'dotted divider'),
];

function stickerTiles(): readonly ElementTile[] {
  return STICKERS.map((def) => ({
    id: `sticker:${def.id}`,
    name: def.name,
    group: 'Stickers',
    stickerCategory: def.category,
    keywords: `sticker animated ${def.category} ${def.keywords.join(' ')}`,
    content: makeStickerContent(def.id),
    enterAnim: 'popIn',
  }));
}

const counterTile = (id: string, name: string, content: CounterContent, keywords: string, enterAnim: AnimPreset = 'fade'): ElementTile => ({
  id: `counter:${id}`,
  name,
  group: 'Numbers',
  keywords: `number figure count ${keywords}`,
  content,
  enterAnim,
});

const NUMBERS: readonly ElementTile[] = [
  counterTile('count-up', 'Count up', makeCounterContent(), 'counter total'),
  counterTile('percent', 'Percentage', makeCounterContent({ to: 98, format: { suffix: '%' } }), 'percent rate growth'),
  counterTile('money', 'Money', makeCounterContent({ to: 25_000, format: { prefix: '$', compact: true } }), 'price revenue sales dollars'),
  counterTile('followers', 'Followers', makeCounterContent({ to: 10_000, format: { compact: true, suffix: '+' } }), 'subscribers fans views likes social'),
  counterTile('big-stat', 'Big figure', makeCounterContent({ to: 2_000_000, countMs: 2400, format: { compact: true, decimals: 1, suffix: '+' } }), 'million customers stat result'),
  counterTile('rating', 'Rating', makeCounterContent({ to: 4.9, format: { decimals: 1, suffix: '/5' } }), 'stars review score'),
  counterTile('year', 'Year', makeCounterContent({ from: 1990, to: 2026, countMs: 2400, format: { grouping: 'none' } }), 'since founded anniversary date'),
  counterTile('price-drop', 'Price drop', makeCounterContent({ from: 99, to: 49, ease: 'snappy', format: { prefix: '$' } }), 'sale offer discount'),
  // Still numbers: the same at both ends, so nothing counts (owner point 9).
  counterTile('step', 'Step', makeCounterContent({ from: 1, to: 1, delayMs: 0, countMs: 0, style: { sizePct: 150, pill: true } }), 'step numbered list badge circle one', 'popIn'),
  counterTile('rank', 'Rank', makeCounterContent({ from: 1, to: 1, delayMs: 0, countMs: 0, format: { prefix: '#' } }), 'top number one position list', 'popIn'),
];

/** Every tile, in picker order. Stickers are read each time: the library grows. */
export function elementTiles(): readonly ElementTile[] {
  return [...SHAPES, ...stickerTiles(), ...NUMBERS];
}

/** The sticker categories that have stickers in them, in library order. */
export function stickerCategories(): readonly StickerCategory[] {
  return STICKER_CATEGORIES.filter((category) => STICKERS.some((def) => def.category === category));
}

/**
 * Does the tile match what was typed? Every word typed has to begin a word
 * of the tile's — "tick" finds the tick, not every "sticker".
 */
export function tileMatches(tile: ElementTile, query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return true;
  const own = `${tile.name} ${tile.group} ${tile.stickerCategory ?? ''} ${tile.keywords}`.toLowerCase().split(/[^a-z0-9%$#+]+/);
  return words.every((word) => own.some((w) => w.startsWith(word)));
}
