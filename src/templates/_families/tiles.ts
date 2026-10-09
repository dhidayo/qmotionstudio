import type { Layer } from '@/core/types';
import type { SceneInputs } from '@/document/types';
import type { BuildContext } from '../buildContext';
import { flag, num, pick, text, type SceneVariant } from '../catalog';
import type { SceneTemplate } from '../schema';
import { backgroundLayer } from '../_shared/chrome';
import { fillSlots, untagged, type FilledSlot } from '../_shared/photo';
import { cardCount, cardProps, clamp01, defineScene, depthGroup, easeInOut, easeOutBack, headlineAndStage, headlineSlot, lerp, sampled, type Pose } from './kit';

/**
 * Tile Field (D-119): photographs in a lattice that comes alive — tiles that
 * pop in, pulse, flip over to the next picture, tip like dominoes, spin like
 * slot reels, or light up as a radar arm passes.
 */

type Shape =
  | 'stagger' | 'pulse' | 'flipWave' | 'spotlight' | 'checker' | 'domino' | 'spiral'
  | 'columnFall' | 'reels' | 'masonry' | 'radar' | 'honeycomb';

const SHAPES: readonly Shape[] = ['stagger', 'pulse', 'flipWave', 'spotlight', 'checker', 'domino', 'spiral', 'columnFall', 'reels', 'masonry', 'radar', 'honeycomb'];

type Cell = { readonly x: number; readonly y: number; readonly col: number; readonly row: number; readonly index: number };

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

    for (const cell of cells) {
      const photo = photoAt(cell.index);
      if (!photo) continue;
      const pose = cellPose(shape, cell, cells.length, cols, rows, durationMs, turnMs, pitch, stage.cx, stage.cy);
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
        layers.push({ id: ctx.id('front'), type: 'image', startMs: 0, endMs: durationMs, tracks: sampled(0, durationMs, 60, (ms) => { const turn = flipAt(ms); return { x: cell.x, y: cell.y, turnY: turn, opacity: turn < 90 ? 1 : 0 }; }), props: card(photo, true) });
        layers.push({ id: ctx.id('back'), type: 'image', startMs: 0, endMs: durationMs, tracks: sampled(0, durationMs, 60, (ms) => { const turn = flipAt(ms); return { x: cell.x, y: cell.y, turnY: turn - 180, opacity: turn >= 90 ? 1 : 0 }; }), props: card(back, false) });
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
              const delay = shape === 'reels' ? cell.col * 260 : cell.col * 140 + cell.row * 60;
              const b = Math.max(0, ms - delay) / turnMs;
              const beatIndex = Math.floor(b);
              const u2 = b - beatIndex;
              const spin = shape === 'reels' ? easeOutBack(u2 / 0.6) : easeInOut(u2 / 0.4);
              const position = (k - (beatIndex + Math.min(1, spin)) % window + window) % window;
              const y = cell.y + (position > window / 2 ? position - window : position) * pitch;
              return { x: cell.x, y, opacity: Math.abs(y - cell.y) < pitch * 0.98 ? 1 - Math.abs(y - cell.y) / pitch : 0 };
            }, pitch * 1.5),
            props: card(face, k === 0),
          });
        }
        continue;
      }
      layers.push({ id: ctx.id('tile'), type: 'image', startMs: 0, endMs: durationMs, tracks: sampled(0, durationMs, 70, pose, pitch * 3), props: card(photo, true) });
    }

    return [backgroundLayer(inputs, ctx), depthGroup(ctx, 'lattice', layers), head];
  };

  return defineScene(variant, { textSlots: [headline], build });
}

function cellPose(
  shape: Shape,
  cell: Cell,
  count: number,
  cols: number,
  rows: number,
  durationMs: number,
  turnMs: number,
  pitch: number,
  cx: number,
  cy: number,
): (ms: number) => Pose {
  const order = cell.col + cell.row;
  const fromCentre = Math.hypot(cell.x - cx, cell.y - cy) / pitch;
  switch (shape) {
    case 'stagger':
      return (ms) => {
        // Pop in diagonally, hold, fall away, come back: a loop of arrivals.
        const cycle = durationMs / 2;
        const local = ms % cycle;
        const arrive = easeOutBack((local - order * 90) / 500);
        const leave = clamp01((local - cycle * 0.82 - order * 40) / 300);
        return { x: cell.x, y: cell.y + leave * pitch * 0.3, scale: Math.max(0.001, arrive * (1 - leave)), opacity: clamp01(arrive * 2) * (1 - leave), z: 0 };
      };
    case 'pulse':
      return (ms) => {
        const wave = Math.sin(ms / 420 - order * 0.7);
        return { x: cell.x, y: cell.y, scale: 0.86 + Math.max(0, wave) * 0.12, z: wave };
      };
    case 'spotlight':
      return (ms) => {
        // Each beat one tile zooms to the middle, then goes back to its place.
        const beatIndex = Math.floor(ms / turnMs) % count;
        if (beatIndex !== cell.index) return { x: cell.x, y: cell.y, scale: 0.9, opacity: 0.55, z: 0 };
        const local = (ms % turnMs) / turnMs;
        const go = easeInOut(local / 0.3) * (1 - easeInOut((local - 0.75) / 0.25));
        return { x: lerp(cell.x, cx, go), y: lerp(cell.y, cy, go), scale: lerp(0.9, Math.min(cols, rows, 2.6) * 0.95, go), opacity: 1, z: 1 + go };
      };
    case 'domino':
      return (ms) => {
        // Tiles tip back one after another, then stand again.
        const local = (ms % (turnMs * 2)) - order * 110;
        const down = easeInOut(local / 450);
        const up = easeInOut((local - turnMs) / 450);
        const tip = (down - up) * 75;
        return { x: cell.x, y: cell.y + (tip / 75) * pitch * 0.18, turnX: tip, z: 0 };
      };
    case 'spiral':
      return (ms) => {
        // Unlocks from the centre outward, holds, then closes back in.
        const cycle = durationMs / 2;
        const local = ms % cycle;
        const open = easeOutBack((local - fromCentre * 220) / 520);
        const close = clamp01((local - cycle * 0.84 + fromCentre * 60) / 260);
        return { x: cell.x, y: cell.y, rotation: (1 - Math.min(1, open)) * 90, scale: Math.max(0.001, open * (1 - close)), opacity: clamp01(open * 2) * (1 - close), z: 0 };
      };
    case 'masonry':
      return (ms) => {
        // Columns rise at their own pace and settle, staggered like brickwork.
        const lift = Math.sin(ms / 1300 + cell.col * 1.3) * pitch * 0.12;
        return { x: cell.x, y: cell.y + (cell.col % 2) * pitch * 0.3 + lift, z: 0 };
      };
    case 'radar':
      return (ms) => {
        // An arm sweeps round the lattice, lifting each tile as it passes.
        const arm = (ms / durationMs) * Math.PI * 2 * 2;
        const angle = Math.atan2(cell.y - cy, cell.x - cx);
        const diff = Math.abs(((arm - angle) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
        const lit = Math.max(0, 1 - diff / 0.9);
        return { x: cell.x, y: cell.y, scale: 0.84 + lit * 0.14, opacity: 0.45 + lit * 0.55, z: lit };
      };
    case 'honeycomb':
      return (ms) => {
        const travel = (ms / durationMs) * (cols + rows) * 2;
        const lit = Math.max(0, 1 - Math.abs(((travel - order) % (cols + rows)) - 0.5));
        return { x: cell.x, y: cell.y, scale: 0.82 + lit * 0.12, opacity: 0.6 + lit * 0.4, rotation: 0, z: lit };
      };
    case 'flipWave':
    case 'checker':
    case 'reels':
    case 'columnFall':
      return () => ({ x: cell.x, y: cell.y });
  }
}
