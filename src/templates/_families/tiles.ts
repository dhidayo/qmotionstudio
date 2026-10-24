import type { Layer } from '@/core/types';
import type { SceneInputs } from '@/document/types';
import type { BuildContext } from '../buildContext';
import { flag, num, pick, text, type SceneVariant } from '../catalog';
import type { SceneTemplate } from '../schema';
import { backgroundLayer } from '../_shared/chrome';
import { fillSlots, untagged, type FilledSlot } from '../_shared/photo';
import { cardCount, cardProps, clamp01, defineScene, depthGroup, easeInOut, easeOutBack, focusCurve, headlineAndStage, headlineSlot, lerp, linger, sampled, serpentine, wrapSteps, type Pose, type Stage } from './kit';
import { focusIn, heldTurns, loopTurns, scaled, smoother, type Box } from './emphasis';

/**
 * Tile Field (D-119): photographs in a lattice that comes alive — tiles that
 * pop in, pulse, flip over to the next picture, tip like dominoes, spin like
 * slot reels, or light up as a radar arm passes.
 *
 * One photo is in focus at every moment (D-157): the lattice takes turns,
 * visiting its tiles in an order that never jumps across the sheet (a snake
 * through the rows, the sweep of the radar arm, out from the centre of the
 * spiral), and the tile whose turn it is grows, steps inward if it sits at
 * the edge, and comes forward while the rest darken. Lattices that come and
 * go hand the focus on so that one tile always carries it: the first to
 * arrive takes it, the last to leave keeps it.
 */

type Shape =
  | 'stagger' | 'pulse' | 'flipWave' | 'spotlight' | 'checker' | 'domino' | 'spiral'
  | 'columnFall' | 'reels' | 'masonry' | 'radar' | 'honeycomb';

const SHAPES: readonly Shape[] = ['stagger', 'pulse', 'flipWave', 'spotlight', 'checker', 'domino', 'spiral', 'columnFall', 'reels', 'masonry', 'radar', 'honeycomb'];

type Cell = { readonly x: number; readonly y: number; readonly col: number; readonly row: number; readonly index: number };

/** How the focus moves through the lattice: a turn per tile, in `visit` order. */
type Lattice = {
  readonly cells: readonly Cell[];
  /** Each cell's place in the visiting order. */
  readonly visit: readonly number[];
  /** The cell at each place in the visiting order. */
  readonly byVisit: readonly number[];
  readonly stage: Stage;
  readonly box: Box;
  readonly peak: number;
};

export function create(variant: SceneVariant): SceneTemplate {
  const p = variant.params;
  const shape = pick<Shape>(p, 'shape', SHAPES, 'stagger');
  const headline = headlineSlot(text(p, 'headline', 'Our work'), {}, 50);

  const build = (inputs: SceneInputs, ctx: BuildContext): Layer[] => {
    const { durationMs, design } = ctx;
    const n = cardCount(inputs, variant, shape === 'checker' ? 4 : 4);
    const photos = fillSlots(inputs.photos, n);
    const { headline: head, stage } = headlineAndStage(ctx, inputs, headline, { bottom: flag(p, 'textBelow') });
    const u = Math.min(design.w, design.h);

    // The lattice: as square as the stage allows.
    const cellsWanted = shape === 'checker' ? 4 : n;
    // Cells are the shape of a photo card (3:4 by default), not squares, or a
    // tall lattice of portrait cards overlaps itself.
    const cardW = 0.866;
    const cardH = 1.155;
    const ratio = (stage.w / stage.h) * (cardH / cardW);
    const cols = Math.max(1, Math.round(Math.sqrt(cellsWanted * ratio)));
    const rows = Math.ceil(cellsWanted / cols);
    const size = Math.min(stage.w / cols / cardW, stage.h / rows / cardH) * num(p, 'fill', 0.9);
    const pitch = size * cardW / num(p, 'fill', 0.9);
    const pitchY = size * cardH / num(p, 'fill', 0.9);
    const cells: Cell[] = [];
    for (let i = 0; i < cellsWanted; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const inRow = Math.min(cols, cellsWanted - row * cols);
      const hex = shape === 'honeycomb' && row % 2 === 1 ? pitch * 0.5 : 0;
      cells.push({
        x: stage.cx + (col - (inRow - 1) / 2) * pitch + hex,
        y: stage.cy + (row - (rows - 1) / 2) * pitchY * (shape === 'honeycomb' ? 0.92 : 1),
        col,
        row,
        index: i,
      });
    }

    const photoAt = (k: number): FilledSlot | undefined => photos[((k % n) + n) % n];
    const card = (photo: FilledSlot, tag: boolean): ReturnType<typeof cardProps> => {
      const props = cardProps(photo, size, inputs, u, false);
      return tag ? props : untagged(props);
    };
    const layers: Layer[] = [];
    const turnMs = durationMs / Math.max(1, num(p, 'beats', 4));
    const lattice = latticeOf(shape, cells, cols, rows, stage, { w: size * cardW, h: size * cardH });
    const focusAt = focusFor(shape, lattice, durationMs, turnMs);

    for (const cell of cells) {
      const photo = photoAt(cell.index);
      if (!photo) continue;
      const f = (ms: number): number => focusAt(cell, ms);
      /** The cell's own place, emphasised: its centre, size and shade. */
      const emphasisAt = (ms: number, extra: Partial<Pose> = {}): Pose => focusIn({ x: cell.x, y: cell.y, ...extra }, f(ms), stage, lattice.box, lattice.peak, { keepTurn: true });
      if (shape === 'flipWave' || shape === 'checker') {
        // Two faces: this photo, then the next one on the back, turning over in a wave.
        const back = photoAt(cell.index + cells.length) ?? photo;
        const delay = shape === 'checker' ? ((cell.col + cell.row) % 2) * 220 : (cell.col + cell.row) * 90;
        const flipAt = (ms: number): number => {
          const local = ((ms - delay) % (turnMs * 2) + turnMs * 2) % (turnMs * 2);
          const rise = easeInOut((local - turnMs * 0.55) / (turnMs * 0.35));
          const fall = easeInOut((local - turnMs * 1.55) / (turnMs * 0.35));
          return (rise - fall) * 180;
        };
        layers.push({ id: ctx.id('front'), type: 'image', startMs: 0, endMs: durationMs, tracks: sampled(0, durationMs, 60, (ms) => { const turn = flipAt(ms); return { ...emphasisAt(ms, { turnY: turn }), opacity: turn < 90 ? 1 : 0 }; }), props: card(photo, true) });
        layers.push({ id: ctx.id('back'), type: 'image', startMs: 0, endMs: durationMs, tracks: sampled(0, durationMs, 60, (ms) => { const turn = flipAt(ms); return { ...emphasisAt(ms, { turnY: turn - 180 }), opacity: turn >= 90 ? 1 : 0 }; }), props: card(back, false) });
        continue;
      }
      if (shape === 'reels' || shape === 'columnFall') {
        // A column of photos sliding past the cell, settling on a new one each beat.
        const window = 3;
        for (let k = 0; k < window; k++) {
          const face = photoAt(cell.index + k * cells.length) ?? photo;
          layers.push({
            id: ctx.id('reel'), type: 'image', startMs: 0, endMs: durationMs,
            tracks: sampled(0, durationMs, 50, (ms) => {
              const delay = reelDelay(shape, cell);
              const b = Math.max(0, ms - delay) / turnMs;
              const beatIndex = Math.floor(b);
              const u2 = b - beatIndex;
              const spin = shape === 'reels' ? easeOutBack(u2 / 0.6) : easeInOut(u2 / 0.4);
              const position = (k - (beatIndex + Math.min(1, spin)) % window + window) % window;
              const offset = (position > window / 2 ? position - window : position) * pitch;
              // The whole reel grows about the cell's centre when it is in focus.
              const e = emphasisAt(ms);
              return { ...e, y: e.y + offset * (e.scaleY ?? 1), opacity: Math.abs(offset) < pitch * 0.98 ? 1 - Math.abs(offset) / pitch : 0 };
            }, pitch * 1.5),
            props: card(face, k === 0),
          });
        }
        continue;
      }
      const pose = cellPose(shape, cell, cells.length, durationMs, turnMs, pitch, stage.cx, stage.cy);
      layers.push({
        id: ctx.id('tile'), type: 'image', startMs: 0, endMs: durationMs,
        tracks: sampled(0, durationMs, 70, (ms) => {
          const at = pose(ms, f(ms));
          // Arrivals and departures scale the tile on top of its emphasis.
          const shown = focusIn({ x: at.x, y: at.y, rotation: at.rotation ?? 0, z: at.z ?? 0, turnX: at.turnX ?? 0, scale: at.scale ?? 1 }, f(ms), stage, lattice.box, lattice.peak, { keepTurn: true });
          return { ...scaled(shown, at.presence), opacity: at.opacity ?? 1, shade: Math.max(shown.shade ?? 0, at.shade ?? 0) };
        }, pitch * 3),
        props: card(photo, true),
      });
    }

    return [backgroundLayer(inputs, ctx), depthGroup(ctx, 'lattice', layers), head];
  };

  return defineScene(variant, { textSlots: [headline], build });
}

/** The order the focus visits a lattice in, and how large a tile may grow. */
function latticeOf(shape: Shape, cells: readonly Cell[], cols: number, rows: number, stage: Stage, box: Box): Lattice {
  const cx = stage.cx;
  const cy = stage.cy;
  const key = (cell: Cell): number => {
    switch (shape) {
      // Brickwork columns: down one column and up the next.
      case 'masonry':
        return serpentine(cell.row, cell.col, rows);
      // Round the lattice in the direction the arm sweeps; the hub last.
      case 'radar':
        return Math.hypot(cell.x - cx, cell.y - cy) < box.w * 0.3 ? 99 : (Math.atan2(cell.y - cy, cell.x - cx) + Math.PI * 2) % (Math.PI * 2);
      // Out from the centre and round, the way the spiral opens.
      case 'spiral':
        return Math.hypot(cell.x - cx, cell.y - cy) < box.w * 0.3 ? -1 : (Math.atan2(cell.y - cy, cell.x - cx) + Math.PI * 2.5) % (Math.PI * 2);
      default:
        return serpentine(cell.col, cell.row, cols);
    }
  };
  const byVisit = cells.map((c, i) => ({ i, k: key(c) })).sort((a, b) => a.k - b.k).map((e) => e.i);
  const visit: number[] = [];
  byVisit.forEach((cellIndex, place) => { visit[cellIndex] = place; });
  return { cells, visit, byVisit, stage, box, peak: shape === 'checker' ? 1.12 : shape === 'spotlight' ? 1 : 1.25 };
}

/** When the reel in this cell starts each spin, for reels and falling columns. */
function reelDelay(shape: Shape, cell: Cell): number {
  return shape === 'reels' ? cell.col * 260 : cell.col * 140 + cell.row * 60;
}

/** How in focus each cell is at a moment, 0 to 1. */
function focusFor(shape: Shape, lattice: Lattice, durationMs: number, turnMs: number): (cell: Cell, ms: number) => number {
  const count = lattice.cells.length;
  const place = (cell: Cell): number => lattice.visit[cell.index] ?? cell.index;
  const at = (k: number): number => ((k % count) + count) % count;
  switch (shape) {
    case 'pulse':
    case 'honeycomb':
    case 'masonry':
    case 'flipWave':
    case 'checker':
      return (cell, ms) => loopTurns(ms, place(cell), count, durationMs);

    case 'spotlight':
      return () => 0;

    case 'radar': {
      // The arm sweeps twice round, lingering on each tile it lights.
      const swept = lattice.cells.filter((c) => place(c) < count - 1 || Math.hypot(c.x - lattice.stage.cx, c.y - lattice.stage.cy) >= lattice.box.w * 0.3);
      const m = Math.max(1, swept.length);
      return (cell, ms) => (place(cell) >= m ? 0 : focusCurve(wrapSteps(place(cell) - linger((ms / durationMs) * m * 2), m)));
    }

    case 'stagger':
    case 'spiral': {
      // Two arrivals per loop; in each, a few tiles take turns while the
      // lattice is whole. The first held from the start, the last kept as the
      // lattice leaves (it is the last to go).
      const cycle = durationMs / 2;
      const turns = Math.min(4, count);
      const sequence = (c: number): number[] => shape === 'spiral'
        ? [0, ...Array.from({ length: Math.min(3, count - 1) }, (_, j) => 1 + ((c * 3 + j) % Math.max(1, count - 1))), 0]
        : Array.from({ length: turns }, (_, j) => at(c * turns + j));
      return (cell, ms) => {
        const c = Math.floor(ms / cycle);
        const local = ms - c * cycle;
        const seq = sequence(c);
        let f = 0;
        seq.forEach((v, j) => {
          if (v === place(cell)) f = Math.max(f, heldTurns(local, j, seq.length, 0, cycle * 0.82, {}));
        });
        return f;
      };
    }

    case 'domino': {
      // One tile stays standing while the others tip: the keeper. While all
      // stand again, it hands the focus to the next keeper.
      const cycle = turnMs * 2;
      const maxOrder = Math.max(...lattice.cells.map((c) => c.col + c.row));
      const settled = turnMs + 450 + maxOrder * 110;
      const handAt = (settled + cycle) / 2;
      const keeper = (c: number): number => at(c * 3);
      return (cell, ms) => {
        const c = Math.floor(ms / cycle);
        const local = ms - c * cycle;
        const next = smoother((local - handAt) / 500 + 0.5);
        return (place(cell) === keeper(c) ? 1 - next : 0) + (place(cell) === keeper(c + 1) ? next : 0);
      };
    }

    case 'reels':
    case 'columnFall': {
      // Each beat, once every reel has settled, one window lights up as the
      // winner and holds the light through the next spin.
      const spinShare = shape === 'reels' ? 0.6 : 0.4;
      const lastDelay = Math.max(...lattice.cells.map((c) => reelDelay(shape, c)));
      const settleAt = (b: number): number => b * turnMs + lastDelay + spinShare * turnMs;
      return (cell, ms) => {
        let f = 0;
        const b = Math.floor((ms - lastDelay - spinShare * turnMs) / turnMs);
        for (const k of [b, b + 1]) {
          // Winner k takes over at settleAt(k) from winner k - 1.
          const rise = smoother((ms - settleAt(k)) / 400 + 0.5);
          const fall = smoother((ms - settleAt(k + 1)) / 400 + 0.5);
          if (place(cell) === at(k + 1)) f = Math.max(f, rise * (1 - fall));
        }
        return f;
      };
    }
  }
}

/** A tile's pose before emphasis, with its presence (arrivals and departures) kept apart. */
type TilePose = Pose & { readonly presence: number };

function cellPose(
  shape: Shape,
  cell: Cell,
  count: number,
  durationMs: number,
  turnMs: number,
  pitch: number,
  cx: number,
  cy: number,
): (ms: number, f: number) => TilePose {
  const order = cell.col + cell.row;
  const fromCentre = Math.hypot(cell.x - cx, cell.y - cy) / pitch;
  switch (shape) {
    case 'stagger':
      return (ms, f) => {
        // Pop in diagonally, hold, fall away, come back: a loop of arrivals.
        // The tile in focus as the lattice leaves goes last.
        const cycle = durationMs / 2;
        const local = ms % cycle;
        const arrive = easeOutBack((local - order * 90) / 500);
        const leave = clamp01((local - cycle * 0.82 - lerp(order * 40, 360, f)) / 300);
        return { x: cell.x, y: cell.y + leave * pitch * 0.3, presence: Math.max(0.001, arrive * (1 - leave)), opacity: clamp01(arrive * 2) * (1 - leave), z: 0 };
      };
    case 'pulse':
      return (ms) => {
        // A gentle wave runs under the turns.
        const wave = Math.sin(ms / 420 - order * 0.7);
        return { x: cell.x, y: cell.y, presence: 1, scale: 1 + Math.max(0, wave) * 0.05, z: wave * 0.5 };
      };
    case 'spotlight':
      return (ms) => {
        // Each beat one tile zooms to the middle, then goes back to its place;
        // the rest wait darkened.
        const beatIndex = Math.floor(ms / turnMs) % count;
        if (beatIndex !== cell.index) return { x: cell.x, y: cell.y, presence: 0.9, shade: 0.4, z: 0 };
        const local = (ms % turnMs) / turnMs;
        const go = easeInOut(local / 0.3) * (1 - easeInOut((local - 0.75) / 0.25));
        return { x: lerp(cell.x, cx, go), y: lerp(cell.y, cy, go), presence: lerp(0.9, Math.min(Math.sqrt(count), 2.6) * 0.95, go), shade: 0.4 * (1 - go), z: 1 + go };
      };
    case 'domino':
      return (ms, f) => {
        // Tiles tip back one after another, then stand again; the keeper stands throughout.
        const local = (ms % (turnMs * 2)) - order * 110;
        const down = easeInOut(local / 450);
        const up = easeInOut((local - turnMs) / 450);
        const tip = (down - up) * 75 * (1 - f);
        return { x: cell.x, y: cell.y + (tip / 75) * pitch * 0.18, presence: 1, turnX: tip, z: 0 };
      };
    case 'spiral':
      return (ms, f) => {
        // Unlocks from the centre outward, holds, then closes back in.
        const cycle = durationMs / 2;
        const local = ms % cycle;
        const open = easeOutBack((local - fromCentre * 220) / 520);
        const close = clamp01((local - cycle * 0.84 + fromCentre * 60 - f * 120) / 260);
        return { x: cell.x, y: cell.y, rotation: (1 - Math.min(1, open)) * 90, presence: Math.max(0.001, open * (1 - close)), opacity: clamp01(open * 2) * (1 - close), z: 0 };
      };
    case 'masonry':
      return (ms) => {
        // Columns rise at their own pace and settle, staggered like brickwork.
        const lift = Math.sin(ms / 1300 + cell.col * 1.3) * pitch * 0.12;
        return { x: cell.x, y: cell.y + (cell.col % 2) * pitch * 0.3 + lift, presence: 1, z: 0 };
      };
    case 'radar':
      return () => ({ x: cell.x, y: cell.y, presence: 1, z: 0 });
    case 'honeycomb':
      return (ms) => {
        // A faint pulse still travels across the comb under the turns.
        const travel = (ms / durationMs) * 8;
        const lit = Math.max(0, 1 - Math.abs(((travel - order) % 8) - 0.5));
        return { x: cell.x, y: cell.y, presence: 1, scale: 1 + lit * 0.04, z: lit * 0.5 };
      };
    case 'flipWave':
    case 'checker':
    case 'reels':
    case 'columnFall':
      return () => ({ x: cell.x, y: cell.y, presence: 1 });
  }
}
