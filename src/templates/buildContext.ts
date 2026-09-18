import type { Layer, Palette, Rect, Size } from '@/core/types';
import type { GlyphRun, TextMeasureContext, TextSpec } from '@/core/text/layout';
import { layoutText } from '@/core/text/layout';

/**
 * The build context handed to a template's `build()` (§3B, §6.1).
 *
 * The helpers here exist so that a template arranging N photos writes one
 * repeater rather than N hand-written layers — that is what lets a single
 * template serve three photos or eight without the renderer knowing anything
 * about it.
 *
 * Everything is deterministic. `build()` is memoised on its inputs, so the same
 * inputs must produce byte-identical output; that includes layer ids, which is
 * why they come from a counter here rather than from randomUUID.
 */

export type StaggerFrom = 'start' | 'end' | 'center' | 'edges';

export type GridOptions = {
  readonly cols?: number;
  readonly cellW: number;
  readonly cellH: number;
  readonly gapX?: number;
  readonly gapY?: number;
  /** Centre the whole grid on the origin rather than growing right and down. */
  readonly center?: boolean;
};

export type ArcOptions = {
  readonly radius: number;
  /** Degrees, clockwise, 0 pointing right. */
  readonly startAngle: number;
  readonly endAngle: number;
  readonly cx?: number;
  readonly cy?: number;
  /** Rotate each item to face along the arc. */
  readonly faceOutward?: boolean;
};

export type ArcPlacement = { readonly x: number; readonly y: number; readonly rotation: number };

export type BuildContext = {
  /** The canvas in design units, and the content-safe box inside it. */
  readonly design: Size;
  readonly safe: Rect;
  readonly palette: Palette;
  readonly durationMs: number;

  /** Deterministic layer id. Same call order gives the same ids every build. */
  id(prefix: string): string;

  /** Text measurement, for templates that need to size a box around a string. */
  measure(spec: TextSpec): GlyphRun;

  repeat<T, R>(items: readonly T[], fn: (item: T, index: number, count: number) => R): R[];
  stagger(index: number, count: number, stepMs: number, from?: StaggerFrom): number;
  grid(count: number, options: GridOptions): Rect[];
  arc(count: number, options: ArcOptions): ArcPlacement[];
  depthSort<T>(items: readonly T[], z: (item: T) => number): T[];
};

export function createBuildContext(options: {
  design: Size;
  safe: Rect;
  palette: Palette;
  durationMs: number;
  measureContext: TextMeasureContext;
}): BuildContext {
  let counter = 0;

  return {
    design: options.design,
    safe: options.safe,
    palette: options.palette,
    durationMs: options.durationMs,

    id: (prefix) => `${prefix}-${counter++}`,

    measure: (spec) => layoutText(options.measureContext, spec),

    repeat: (items, fn) => items.map((item, index) => fn(item, index, items.length)),

    stagger: (index, count, stepMs, from = 'start') => staggerDelay(index, count, stepMs, from),

    grid: (count, gridOptions) => gridCells(count, gridOptions),

    arc: (count, arcOptions) => arcPlacements(count, arcOptions),

    // Painter's algorithm: the renderer has no z-buffer, so "behind" means
    // "drawn first". Sorting ascending puts the lowest z at the back.
    depthSort: (items, z) => [...items].sort((a, b) => z(a) - z(b)),
  };
}

export function staggerDelay(index: number, count: number, stepMs: number, from: StaggerFrom): number {
  if (count <= 1) return 0;
  const last = count - 1;

  switch (from) {
    case 'start':
      return index * stepMs;
    case 'end':
      return (last - index) * stepMs;
    case 'center': {
      // Distance from the middle, in whole steps, so an even count still gives
      // the two central items the same delay.
      const middle = last / 2;
      return Math.abs(index - middle) * stepMs;
    }
    case 'edges': {
      const middle = last / 2;
      return (middle - Math.abs(index - middle)) * stepMs;
    }
  }
}

export function gridCells(count: number, options: GridOptions): Rect[] {
  if (count <= 0) return [];

  const cols = Math.max(1, options.cols ?? Math.ceil(Math.sqrt(count)));
  const rows = Math.ceil(count / cols);
  const gapX = options.gapX ?? 0;
  const gapY = options.gapY ?? gapX;

  const totalW = cols * options.cellW + (cols - 1) * gapX;
  const totalH = rows * options.cellH + (rows - 1) * gapY;
  const originX = options.center === true ? -totalW / 2 : 0;
  const originY = options.center === true ? -totalH / 2 : 0;

  const cells: Rect[] = [];
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    cells.push({
      x: originX + col * (options.cellW + gapX),
      y: originY + row * (options.cellH + gapY),
      w: options.cellW,
      h: options.cellH,
    });
  }
  return cells;
}

export function arcPlacements(count: number, options: ArcOptions): ArcPlacement[] {
  if (count <= 0) return [];

  const cx = options.cx ?? 0;
  const cy = options.cy ?? 0;
  const span = options.endAngle - options.startAngle;

  // A full turn would put the first and last item on top of each other, so the
  // step divides by the count rather than by count - 1 in that case.
  const isFullTurn = Math.abs(Math.abs(span) - 360) < 0.001;
  const divisor = count === 1 ? 1 : isFullTurn ? count : count - 1;

  return Array.from({ length: count }, (_, i) => {
    const degrees = options.startAngle + (span * i) / divisor;
    const radians = (degrees * Math.PI) / 180;
    return {
      x: cx + Math.cos(radians) * options.radius,
      y: cy + Math.sin(radians) * options.radius,
      rotation: options.faceOutward === true ? degrees + 90 : 0,
    };
  });
}

/** Convenience for templates that build a flat list and want it depth-ordered. */
export function byDepth(layers: readonly Layer[], z: (layer: Layer) => number): Layer[] {
  return [...layers].sort((a, b) => z(a) - z(b));
}
