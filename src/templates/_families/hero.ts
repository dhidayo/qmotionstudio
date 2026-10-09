import { colorFill, roleFill, type Layer } from '@/core/types';
import type { SceneInputs } from '@/document/types';
import type { BuildContext } from '../buildContext';
import { num, pick, text, type SceneVariant } from '../catalog';
import type { SceneTemplate } from '../schema';
import { backgroundLayer, contentFloor } from '../_shared/chrome';
import { fillSlots, photoProps } from '../_shared/photo';
import { cardCount, cardProps, clamp01, defineScene, depthGroup, easeInOut, easeOut, easeOutBack, glow, headlineAndStage, headlineSlot, isTall, lerp, measureSlot, placeText, rect, sampled, type Pose } from './kit';

/**
 * Hero Stage and Photo Reveal (D-119): one photograph at a time, each given
 * its moment — on a stage between its neighbours, or filling the frame with
 * a slow Ken Burns move — and handed on to the next in a way that suits it: a
 * crossfade, a push, a peel, a stamp, a turn of a billboard.
 */

type Shape =
  | 'crossfade' | 'kenBurns' | 'flanks' | 'polaroid' | 'billboard' | 'stamp' | 'peel'
  | 'triptych' | 'lightbox' | 'rackFocus' | 'velvetPush' | 'dissolve' | 'closeUp' | 'pullback'
  | 'lift' | 'glide';

const SHAPES: readonly Shape[] = ['crossfade', 'kenBurns', 'flanks', 'polaroid', 'billboard', 'stamp', 'peel', 'triptych', 'lightbox', 'rackFocus', 'velvetPush', 'dissolve', 'closeUp', 'pullback', 'lift', 'glide'];

/** The full-frame shapes: the photo is the picture, the words sit over it. */
const FULL_FRAME: readonly Shape[] = ['kenBurns', 'velvetPush', 'closeUp', 'pullback', 'lift', 'glide'];

export function create(variant: SceneVariant): SceneTemplate {
  const p = variant.params;
  const shape = pick<Shape>(p, 'shape', SHAPES, 'crossfade');
  const full = FULL_FRAME.includes(shape);
  const headline = headlineSlot(text(p, 'headline', 'The story so far'), full ? { align: 'left' } : {}, 60);

  const build = (inputs: SceneInputs, ctx: BuildContext): Layer[] => {
    const { durationMs, design, safe } = ctx;
    const n = cardCount(inputs, variant, 2);
    const photos = fillSlots(inputs.photos, n);
    const u = Math.min(design.w, design.h);
    const turn = durationMs / n;
    /** Where a moment falls: which photo's turn, and how far through it. */
    const at = (ms: number): { index: number; local: number } => ({ index: Math.floor(ms / turn) % n, local: (ms % turn) / turn });

    if (full) {
      const layers: Layer[] = [backgroundLayer(inputs, ctx)];
      const cover = Math.max(design.w, design.h) * 1.25;
      photos.forEach((photo, i) => {
        const tracks = sampled(0, durationMs, 70, (ms) => fullPose(shape, i, ms, at, design, n));
        const props = photoProps(photo, cover);
        layers.push({ id: ctx.id('frame'), type: 'image', startMs: 0, endMs: durationMs, tracks, props });
      });
      // A scrim and the words, low on the left.
      layers.push({
        id: ctx.id('scrim'), type: 'gradient', startMs: 0, endMs: durationMs, anchorX: 0, anchorY: 0, tracks: {},
        props: { w: design.w, h: design.h, gradient: 'linear', angle: 90, stops: [{ at: 0, paint: colorFill('rgba(0,0,0,0)') }, { at: 0.55, paint: colorFill('rgba(0,0,0,0.1)') }, { at: 1, paint: colorFill('rgba(0,0,0,0.72)') }] },
      });
      const size = u * 0.075;
      const measured = measureSlot(ctx, headline, inputs, size, safe.w * 0.9);
      const top = contentFloor(design, safe) - measured.height;
      layers.push(rect(ctx, 'rule', { w: u * 0.1, h: Math.max(3, u * 0.007), x: safe.x, y: top - u * 0.035, anchorX: 0, fill: roleFill('accent'), tracks: { scaleX: [{ t: 300, v: 0, ease: 'linear' }, { t: 900, v: 1, ease: 'outExpo' }] } }));
      layers.push(placeText(ctx, headline, inputs, { sizePx: size, maxWidthPx: safe.w * 0.9, x: safe.x, y: top, anchorX: 0, reveal: { kind: 'kinetic', unit: 'word', motion: 'rise', startMs: 400, durationMs: 650, staggerMs: 80 } }).layer);
      return layers;
    }

    const { headline: head, stage } = headlineAndStage(ctx, inputs, headline);
    const tall = isTall(stage);
    const card = Math.min(stage.w, stage.h) * num(p, 'card', 0.62) * (tall ? 1.1 : 1);
    const cards: Layer[] = [];
    photos.forEach((photo, i) => {
      if (shape === 'billboard') {
        // Two faces per turn: this photo, then the next on the back.
        cards.push({ id: ctx.id('face'), type: 'image', startMs: 0, endMs: durationMs, tracks: sampled(0, durationMs, 50, (ms) => {
          const { index, local } = at(ms);
          const flip = easeInOut((local - 0.7) / 0.3) * 180;
          const showing = index === i ? (flip < 90 ? 1 : 0) : index === (i - 1 + n) % n ? (flip >= 90 ? 1 : 0) : 0;
          const angle = index === i ? flip : flip - 180;
          return { x: stage.cx, y: stage.cy, turnY: angle, opacity: showing, z: 0 };
        }), props: cardProps(photo, card, inputs, u) });
        return;
      }
      cards.push({
        id: ctx.id('hero'), type: 'image', startMs: 0, endMs: durationMs,
        tracks: sampled(0, durationMs, 60, (ms) => stagePose(shape, i, ms, at, n, stage, card), stage.w * 0.7),
        props: shape === 'polaroid' ? polaroid(photo, card, inputs, u) : cardProps(photo, card, inputs, u),
      });
    });
    return [backgroundLayer(inputs, ctx), glow(ctx, { x: stage.cx, y: stage.cy }, Math.min(stage.w, stage.h) * 1.4, 0.2), depthGroup(ctx, 'stage', cards), head];
  };

  return defineScene(variant, { textSlots: [headline], build });
}

/** A print with a thick white border, for the polaroid drop. */
function polaroid(photo: Parameters<typeof cardProps>[0], size: number, inputs: SceneInputs, unit: number): ReturnType<typeof cardProps> {
  const props = cardProps(photo, size, inputs, unit);
  return { ...props, cornerRadius: Math.min(props.cornerRadius ?? 0, unit * 0.006), border: { inset: 0, paint: colorFill('#f7f5f0'), width: Math.max(6, unit * 0.022) } };
}

type At = (ms: number) => { index: number; local: number };

function fullPose(shape: Shape, i: number, ms: number, at: At, design: { w: number; h: number }, n: number): Pose {
  const { index, local } = at(ms);
  const cx = design.w / 2;
  const cy = design.h / 2;
  const mine = index === i;
  const next = (index + 1) % n === i;
  // The next photo starts arriving in the last fifth of the current one's turn.
  const handoff = clamp01((local - 0.8) / 0.2);
  const incoming = next && handoff > 0;
  if (!mine && !incoming) return { x: cx, y: cy, opacity: 0, z: 0 };
  const u = mine ? local : handoff * 0.2 - 0.2; // the incoming photo's own clock begins slightly before its turn
  const fadeOut = mine ? 1 - handoff : 1;
  const fadeIn = incoming ? easeInOut(handoff) : 1;
  const z = incoming ? 1 : 0;
  switch (shape) {
    case 'kenBurns': {
      const dir = i % 2 === 0 ? 1 : -1;
      return { x: cx + dir * lerp(-1, 1, u) * design.w * 0.03, y: cy + lerp(1, -1, u) * design.h * 0.02, scale: lerp(1, 1.12, clamp01(u)), opacity: mine ? fadeOut + (incoming ? 0 : 0) : fadeIn, z };
    }
    case 'velvetPush':
      // The camera pushes through the outgoing photo into the next.
      return mine
        ? { x: cx, y: cy, scale: lerp(1, 1.15, clamp01(local)) * (1 + handoff * 0.6), opacity: 1 - handoff, z: 1 }
        : { x: cx, y: cy, scale: lerp(0.85, 1, handoff), opacity: fadeIn, z: 0 };
    case 'closeUp':
      // Locked tight on a detail, then opening out to the whole picture.
      return { x: cx + (1 - easeInOut(clamp01(u / 0.6))) * design.w * 0.12, y: cy - (1 - easeInOut(clamp01(u / 0.6))) * design.h * 0.08, scale: lerp(2.1, 1, easeInOut(clamp01(u / 0.6))), opacity: mine ? fadeOut : fadeIn, z };
    case 'pullback':
      return { x: cx, y: cy, scale: lerp(1.9, 1.02, easeOut(clamp01(u))), opacity: mine ? fadeOut : fadeIn, z };
    case 'lift':
      // Rising from the lower third into a soft close-up.
      return { x: cx, y: cy + lerp(design.h * 0.12, -design.h * 0.04, easeInOut(clamp01(u))), scale: lerp(1.05, 1.22, clamp01(u)), opacity: mine ? fadeOut : fadeIn, z };
    case 'glide':
      return { x: cx + lerp(design.w * 0.12, -design.w * 0.04, easeOut(clamp01(u))), y: cy, scale: lerp(1.15, 1.04, easeOut(clamp01(u))), opacity: mine ? fadeOut : fadeIn, z };
    default:
      return { x: cx, y: cy, opacity: mine ? 1 : 0, z };
  }
}

function stagePose(shape: Shape, i: number, ms: number, at: At, n: number, stage: { cx: number; cy: number; w: number; h: number }, card: number): Pose {
  const { index, local } = at(ms);
  const rank = (i - index + n) % n; // 0 is the current photo, 1 the next, n-1 the previous
  const move = easeInOut((local - 0.75) / 0.25);
  switch (shape) {
    case 'crossfade': {
      const mine = rank === 0;
      const breathe = 1 + Math.sin(local * Math.PI) * 0.03;
      if (mine) return { x: stage.cx, y: stage.cy, scale: breathe, opacity: 1 - move, z: 1 };
      if (rank === 1) return { x: stage.cx, y: stage.cy, scale: 0.97, opacity: move, z: 2 };
      return { x: stage.cx, y: stage.cy, opacity: 0, z: 0 };
    }
    case 'flanks':
    case 'triptych': {
      // The current photo centre stage, its neighbours either side, shifting along each beat.
      let slot = rank > n / 2 ? rank - n : rank; // -1 previous, 0 current, 1 next
      slot -= move;
      const spread = shape === 'triptych' ? card * 0.78 : card * 0.66;
      const a = Math.abs(slot);
      return { x: stage.cx + slot * spread, y: stage.cy + a * card * (shape === 'triptych' ? 0 : 0.06), scale: lerp(1, shape === 'triptych' ? 0.7 : 0.55, Math.min(1, a)), opacity: clamp01(1.6 - a), z: -a };
    }
    case 'polaroid': {
      // Each print drops onto the table and stays; the pile builds, then
      // slides away at the end so the loop starts on a clear table.
      const u = (index + local) / n;
      const land = easeOutBack(((u - i / n) * n) / 0.35);
      const clear = easeInOut((u - 0.9) / 0.1);
      const angle = ((i * 37) % 23) - 11;
      const spot = { x: stage.cx + (((i * 53) % 17) - 8) * card * 0.03, y: stage.cy + (((i * 29) % 13) - 6) * card * 0.03 };
      return {
        x: spot.x,
        y: lerp(stage.cy - stage.h, spot.y, clamp01(land)) + clear * stage.h,
        rotation: angle,
        scale: lerp(1.3, 1, clamp01(land)),
        opacity: (u >= i / n ? 1 : 0) * (1 - clear),
        z: i,
      };
    }
    case 'stamp': {
      const mine = rank === 0;
      const press = clamp01(local / 0.18);
      const shake = mine && local < 0.3 ? Math.sin(local * 120) * (0.3 - local) * 8 : 0;
      if (mine) return { x: stage.cx + shake, y: stage.cy, scale: lerp(1.5, 1, easeOutBack(press)), opacity: clamp01(press * 3), rotation: lerp(-6, -2, press), z: 2 };
      if (rank === n - 1) return { x: stage.cx, y: stage.cy, scale: 1, opacity: 1 - press, rotation: -2, z: 1 };
      return { x: stage.cx, y: stage.cy, opacity: 0, z: 0 };
    }
    case 'peel': {
      // The top card peels away to one side, showing the next beneath it.
      if (rank === 0) return { x: stage.cx + move * stage.w * 0.9, y: stage.cy - move * stage.h * 0.1, rotation: move * 24, opacity: 1 - move * 0.3, z: n };
      return { x: stage.cx, y: stage.cy + rank * card * 0.025, scale: 1 - rank * 0.03, rotation: rank % 2 === 0 ? 2 : -2, opacity: clamp01(3 - rank), z: n - rank };
    }
    case 'lightbox': {
      // A dim grid of all of them, the current one lifted large in the middle.
      const cols = Math.ceil(Math.sqrt(n));
      const rows = Math.ceil(n / cols);
      const gx = stage.cx + ((i % cols) - (cols - 1) / 2) * card * 0.52;
      const gy = stage.cy + (Math.floor(i / cols) - (rows - 1) / 2) * card * 0.66;
      const lifted = rank === 0 ? easeInOut(local / 0.2) * (1 - move) : 0;
      return { x: lerp(gx, stage.cx, lifted), y: lerp(gy, stage.cy, lifted), scale: lerp(0.45, 1.05, lifted), opacity: lerp(0.35, 1, lifted), z: lifted };
    }
    case 'rackFocus': {
      // A row of photos; focus racks along it, the rest soft and dim.
      const slot = (rank > n / 2 ? rank - n : rank) - move;
      const a = Math.abs(slot);
      return { x: stage.cx + slot * card * 0.6, y: stage.cy, scale: lerp(1, 0.78, Math.min(1, a)), opacity: clamp01(1.4 - a * 0.45), blur: Math.min(1, a) * card * 0.02, z: -a };
    }
    case 'dissolve': {
      // The outgoing photo sinks back as the next rises forward.
      if (rank === 0) return { x: stage.cx, y: stage.cy, scale: lerp(1, 0.8, move), opacity: 1 - move, z: 0 };
      if (rank === 1) return { x: stage.cx, y: stage.cy, scale: lerp(1.2, 1, move), opacity: move, z: 1 };
      return { x: stage.cx, y: stage.cy, opacity: 0, z: -1 };
    }
    default:
      return { x: stage.cx, y: stage.cy, opacity: rank === 0 ? 1 : 0, z: 0 };
  }
}

