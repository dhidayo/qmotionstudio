import { colorFill, roleFill, type Keyframe, type Layer } from '@/core/types';
import type { SceneInputs } from '@/document/types';
import type { BuildContext } from '../buildContext';
import { num, pick, text, type SceneVariant } from '../catalog';
import type { SceneTemplate } from '../schema';
import { backgroundLayer, contentFloor } from '../_shared/chrome';
import { fillSlots, photoProps, untagged } from '../_shared/photo';
import { cardCount, defineScene, headlineSlot, kf, measureSlot, placeText, rect, sampled } from './kit';
import { hash } from '@/core/render/layers/kinetic';

/**
 * Scene Cuts (D-119): full-frame photographs, one after another, each cut to
 * the next in its own way — an iris opening, barn doors, venetian blinds,
 * slices that shuffle in, a cross zoom, a whip pan, a flash, a glitch.
 *
 * Each photo is drawn whole during its turn. In the last moments of a turn the
 * next photo arrives through the transition — a copy of it, drawn through
 * masks — and when the cut completes the real one takes over. The last photo
 * cuts back to the first, so the scene loops.
 */

type Shape =
  | 'iris' | 'diamond' | 'barnDoor' | 'stripes' | 'blinds' | 'slices' | 'diagonal'
  | 'crossZoom' | 'whip' | 'flash' | 'glitch' | 'shutter' | 'cardGrid' | 'push';

const SHAPES: readonly Shape[] = ['iris', 'diamond', 'barnDoor', 'stripes', 'blinds', 'slices', 'diagonal', 'crossZoom', 'whip', 'flash', 'glitch', 'shutter', 'cardGrid', 'push'];

export function create(variant: SceneVariant): SceneTemplate {
  const p = variant.params;
  const shape = pick<Shape>(p, 'shape', SHAPES, 'iris');
  const headline = headlineSlot(text(p, 'headline', 'Every angle'), { align: 'left' }, 60);

  const build = (inputs: SceneInputs, ctx: BuildContext): Layer[] => {
    const { durationMs, design, safe } = ctx;
    const n = cardCount(inputs, variant, 2);
    const photos = fillSlots(inputs.photos, n);
    const u = Math.min(design.w, design.h);
    const cx = design.w / 2;
    const cy = design.h / 2;
    const turn = durationMs / n;
    const T = Math.min(turn * 0.45, num(p, 'cutMs', shape === 'flash' || shape === 'whip' ? 420 : 900));
    const cover = Math.max(design.w, design.h) * 1.04;
    const layers: Layer[] = [backgroundLayer(inputs, ctx)];

    photos.forEach((photo, i) => {
      const start = i * turn;
      const props = photoProps(photo, cover);
      // The photo itself, for its turn: with a slow drift so a held frame is never dead.
      const baseTracks = sampled(0, turn, 100, (ms) => {
        const local = ms / turn;
        const leaving = Math.max(0, (ms - (turn - T)) / T);
        const zoomOut = shape === 'crossZoom' ? leaving * 0.8 : 0;
        const whip = shape === 'whip' ? -leaving * leaving * design.w : shape === 'push' ? -leaving * design.w : 0;
        return { x: cx + whip, y: cy, scale: 1 + local * 0.05 + zoomOut, opacity: shape === 'crossZoom' ? 1 - leaving : 1 };
      });
      layers.push({ id: ctx.id('photo'), type: 'image', startMs: start, endMs: start + turn, tracks: baseTracks, props });

      // The next photo's arrival, in the last T of this turn.
      const next = photos[(i + 1) % n];
      if (!next) return;
      const incoming = untagged(photoProps(next, cover));
      const from = start + turn - T;
      const to = start + turn;
      layers.push(...arrival(shape, ctx, incoming, from, to, T, design, cx, cy, u, i));
    });

    // The words, low on the left, over a scrim.
    layers.push({
      id: ctx.id('scrim'), type: 'gradient', startMs: 0, endMs: durationMs, anchorX: 0, anchorY: 0, tracks: {},
      props: { w: design.w, h: design.h, gradient: 'linear', angle: 90, stops: [{ at: 0, paint: colorFill('rgba(0,0,0,0)') }, { at: 0.6, paint: colorFill('rgba(0,0,0,0.08)') }, { at: 1, paint: colorFill('rgba(0,0,0,0.7)') }] },
    });
    const size = u * 0.075;
    const measured = measureSlot(ctx, headline, inputs, size, safe.w * 0.9);
    const top = contentFloor(design, safe) - measured.height;
    layers.push(placeText(ctx, headline, inputs, { sizePx: size, maxWidthPx: safe.w * 0.9, x: safe.x, y: top, anchorX: 0, reveal: { kind: 'kinetic', unit: 'word', motion: 'rise', startMs: 400, durationMs: 650, staggerMs: 80 } }).layer);
    return layers;
  };

  return defineScene(variant, { textSlots: [headline], build });
}

/** The incoming photo, centred on (0, 0) in a mask's own space. */
function inner(ctx: BuildContext, props: ReturnType<typeof photoProps>, at: { x: number; y: number }, tracks: Layer['tracks'] = {}): Layer {
  return { id: ctx.id('in'), type: 'image', startMs: 0, endMs: 1_000_000, tracks: { x: [kf(0, at.x)], y: [kf(0, at.y)], ...tracks }, props };
}

function ramp(T: number, from = 0, to = 1, ease: Keyframe['ease'] = 'inOutCubic', delay = 0): Keyframe[] {
  return [kf(delay, from, 'linear'), kf(Math.min(T, delay + T * 0.85), to, ease)];
}

function arrival(
  shape: Shape,
  ctx: BuildContext,
  props: ReturnType<typeof photoProps>,
  from: number,
  to: number,
  T: number,
  design: { w: number; h: number },
  cx: number,
  cy: number,
  u: number,
  i: number,
): Layer[] {
  const span = { startMs: from, endMs: to };
  const diag = Math.hypot(design.w, design.h);
  switch (shape) {
    case 'iris':
    case 'diamond': {
      // A growing window; the photo inside is scaled the other way, so only the window grows.
      const grow = sampled(0, T, 40, (ms) => {
        const s = 0.02 + (ms / T) ** 1.6 * 1.1;
        return { x: cx, y: cy, scale: s, rotation: shape === 'diamond' ? 45 : 0 };
      });
      const counter = sampled(0, T, 40, (ms) => {
        const s = 0.02 + (ms / T) ** 1.6 * 1.1;
        return { x: 0, y: 0, scale: 1 / s, rotation: shape === 'diamond' ? -45 : 0 };
      });
      return [{ id: ctx.id('iris'), type: 'mask', ...span, tracks: grow, props: { shape: shape === 'iris' ? 'ellipse' : 'rect', w: diag, h: diag }, children: [inner(ctx, props, { x: 0, y: 0 }, counter)] }];
    }
    case 'barnDoor':
      // Two doors open from the centre line outward.
      return [-1, 1].map((side) => ({
        id: ctx.id('door'), type: 'mask' as const, ...span, anchorX: side < 0 ? 1 : 0, anchorY: 0.5,
        tracks: { x: [kf(0, cx)], y: [kf(0, cy)], clipProgress: ramp(T) },
        props: { shape: 'rect' as const, w: design.w / 2, h: design.h, clipFrom: side < 0 ? ('right' as const) : ('left' as const) },
        // Each door's space is centred on the frame's centre line, so the photo sits at its origin.
        children: [inner(ctx, props, { x: 0, y: 0 })],
      }));
    case 'stripes':
    case 'blinds':
    case 'slices': {
      const count = shape === 'blinds' ? 8 : 6;
      const h = design.h / count;
      return Array.from({ length: count }, (_, k) => {
        const y = k * h;
        const delay = shape === 'blinds' ? k * (T * 0.04) : k * (T * 0.06);
        const fromSide = k % 2 === 0 ? 'left' : 'right';
        const slide = shape === 'slices' ? { x: [kf(delay, (k % 2 === 0 ? -1 : 1) * design.w + design.w / 2, 'linear'), kf(delay + T * 0.6, design.w / 2, 'outCubic')] } : {};
        return {
          id: ctx.id('strip'), type: 'mask' as const, ...span, anchorX: 0, anchorY: 0,
          tracks: { x: [kf(0, 0)], y: [kf(0, y)], ...(shape === 'slices' ? {} : { clipProgress: ramp(T * 0.75, 0, 1, 'inOutCubic', delay) }) },
          props: { shape: 'rect' as const, w: design.w, h: h + 1, ...(shape === 'slices' ? {} : { clipFrom: shape === 'blinds' ? ('down' as const) : (fromSide) }) },
          children: [inner(ctx, props, { x: design.w / 2, y: design.h / 2 - y }, slide)],
        };
      });
    }
    case 'diagonal': {
      // A wipe along a tilted axis: the mask turns, the photo inside turns back.
      const angle = -32;
      return [{
        id: ctx.id('diagonal'), type: 'mask', ...span,
        tracks: { x: [kf(0, cx)], y: [kf(0, cy)], rotation: [kf(0, angle)], clipProgress: ramp(T) },
        props: { shape: 'rect', w: diag, h: diag, clipFrom: 'left' },
        children: [inner(ctx, props, { x: 0, y: 0 }, { rotation: [kf(0, -angle)] })],
      }];
    }
    case 'crossZoom':
      return [{ id: ctx.id('zoomIn'), type: 'image', ...span, tracks: { x: [kf(0, cx)], y: [kf(0, cy)], scaleX: ramp(T, 0.55, 1, 'outCubic'), scaleY: ramp(T, 0.55, 1, 'outCubic'), opacity: ramp(T, 0, 1, 'outCubic') }, props }];
    case 'whip':
    case 'push':
      return [{ id: ctx.id('whipIn'), type: 'image', ...span, tracks: { x: shape === 'whip' ? [kf(0, cx + design.w, 'linear'), kf(T, cx, 'outCubic')] : [kf(0, cx + design.w, 'linear'), kf(T, cx, 'inOutCubic')], y: [kf(0, cy)] }, props }];
    case 'flash':
      // A white flash covers the hard cut.
      return [
        { id: ctx.id('flashIn'), type: 'image', startMs: from + T * 0.5, endMs: to, tracks: { x: [kf(0, cx)], y: [kf(0, cy)] }, props },
        rect(ctx, 'flash', { w: design.w, h: design.h, x: 0, y: 0, anchorX: 0, anchorY: 0, fill: colorFill('#ffffff'), startMs: from, endMs: to + T * 0.6, tracks: { opacity: [kf(0, 0, 'linear'), kf(T * 0.5, 1, 'outCubic'), kf(T * 1.6, 0, 'outCubic')] } }),
      ];
    case 'glitch': {
      // The next frame breaks in: jittering slices, flickering, then it holds.
      const pieces: Layer[] = [];
      const count = 5;
      for (let k = 0; k < count; k++) {
        const h = design.h / count;
        pieces.push({
          id: ctx.id('glitch'), type: 'mask', ...span, anchorX: 0, anchorY: 0,
          tracks: { x: [kf(0, 0)], y: [kf(0, k * h)] },
          props: { shape: 'rect', w: design.w, h: h + 1 },
          children: [inner(ctx, props, { x: design.w / 2, y: design.h / 2 - k * h }, sampled(0, T, 45, (ms) => {
            const jitter = (hash(k + Math.floor(ms / 45) * 7, i) - 0.5) * design.w * 0.12 * (1 - ms / T);
            return { x: design.w / 2 + jitter, y: design.h / 2 - k * h, opacity: hash(k + Math.floor(ms / 60), 9) > 0.25 || ms > T * 0.7 ? 1 : 0 };
          }))],
        });
      }
      for (let k = 0; k < 4; k++) {
        pieces.push(rect(ctx, 'scan', { w: design.w, h: u * 0.01 * (1 + (k % 2)), x: 0, y: hash(k, i + 3) * design.h, anchorX: 0, fill: k % 2 === 0 ? roleFill('accent', 0.8) : colorFill('rgba(255,255,255,0.6)'), ...span, tracks: { opacity: sampled(0, T, 45, (ms) => ({ x: 0, y: 0, opacity: hash(k * 5 + Math.floor(ms / 45), 4) > 0.5 ? 1 : 0 })).opacity ?? [kf(0, 0)] } }));
      }
      return pieces;
    }
    case 'shutter': {
      // Slats flip open one after another, showing the next frame on their faces.
      const count = 6;
      const h = design.h / count;
      return Array.from({ length: count }, (_, k) => ({
        id: ctx.id('slat'), type: 'mask' as const, ...span,
        tracks: { x: [kf(0, cx)], y: [kf(0, k * h + h / 2)], turnX: [kf(k * T * 0.07, 90, 'linear'), kf(k * T * 0.07 + T * 0.55, 0, 'outCubic')] },
        props: { shape: 'rect' as const, w: design.w, h: h + 1 },
        children: [inner(ctx, props, { x: 0, y: design.h / 2 - (k * h + h / 2) })],
      }));
    }
    case 'cardGrid': {
      // A grid of cells, each popping in its part of the next frame in turn.
      const cols = design.w > design.h ? 4 : 3;
      const rows = design.w > design.h ? 3 : 5;
      const cw = design.w / cols;
      const ch = design.h / rows;
      const cells: Layer[] = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const delay = (r + c) * T * 0.07;
          cells.push({
            id: ctx.id('cell'), type: 'mask', ...span,
            tracks: { x: [kf(0, c * cw + cw / 2)], y: [kf(0, r * ch + ch / 2)], scaleX: [kf(delay, 0.001, 'linear'), kf(delay + T * 0.4, 1, 'outBack')], scaleY: [kf(delay, 0.001, 'linear'), kf(delay + T * 0.4, 1, 'outBack')] },
            props: { shape: 'rect', w: cw + 1, h: ch + 1 },
            children: [inner(ctx, props, { x: design.w / 2 - (c * cw + cw / 2), y: design.h / 2 - (r * ch + ch / 2) })],
          });
        }
      }
      return cells;
    }
  }
}
