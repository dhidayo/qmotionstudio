import type { Layer } from '@/core/types';
import type { SceneInputs } from '@/document/types';
import type { BuildContext } from '../buildContext';
import { flag, num, pick, text, type SceneVariant } from '../catalog';
import type { SceneTemplate } from '../schema';
import { backgroundLayer } from '../_shared/chrome';
import { fillSlots } from '../_shared/photo';
import { frac, roomyPoint, type Box } from './emphasis';
import { cardCount, cardProps, clamp01, defineScene, depthGroup, easeInOut, emphasise, focusCurve, glow, headlineAndStage, headlineSlot, isTall, lerp, linger, roomFor, sampled, turnFocus, wrapSteps, type Pose, type Stage } from './kit';
import { hash } from '@/core/render/layers/kinetic';

/**
 * Depth Stage (D-119): photographs arranged in real depth — corridors to fly
 * through, helices, a dome, a rolling cylinder, a warp rush toward the lens.
 *
 * One photo is in focus at every moment (D-157): where the arrangement moves
 * cards past a point — the front of a carousel, the middle of a helix, the
 * life-size step of a corridor — the card reaching it grows, faces you and
 * comes forward while the rest step back and darken, and the motion lingers
 * there before moving on. Arrangements that hold still take turns instead.
 */

type Shape =
  | 'tunnel' | 'hall' | 'warp' | 'helix' | 'doubleHelix' | 'cylinder' | 'wave' | 'dome'
  | 'floating' | 'carousel' | 'fan' | 'accordion';

const SHAPES: readonly Shape[] = ['tunnel', 'hall', 'warp', 'helix', 'doubleHelix', 'cylinder', 'wave', 'dome', 'floating', 'carousel', 'fan', 'accordion'];

const TAU = Math.PI * 2;

export function create(variant: SceneVariant): SceneTemplate {
  const p = variant.params;
  const shape = pick<Shape>(p, 'shape', SHAPES, 'tunnel');
  const headline = headlineSlot(text(p, 'headline', 'Step inside'), {}, 50);

  const build = (inputs: SceneInputs, ctx: BuildContext): Layer[] => {
    const { durationMs } = ctx;
    const n = cardCount(inputs, variant);
    const photos = fillSlots(inputs.photos, n);
    const { headline: head, stage } = headlineAndStage(ctx, inputs, headline, { bottom: flag(p, 'textBelow') });
    const u = Math.min(ctx.design.w, ctx.design.h);
    const tall = isTall(stage);
    const card = Math.min(stage.w, stage.h) * num(p, 'card', 0.32) * (tall ? 1.2 : 1);
    const props = photos.map((photo) => cardProps(photo, card, inputs, u));
    const boxes: Box[] = props.map((prop) => ({ w: prop.w, h: prop.h }));
    const { pose, focusAt } = poseFor(shape, p, stage, n, durationMs, card, boxes);
    const cards = props.map((prop, i): Layer => ({
      id: ctx.id('card'),
      type: 'image',
      startMs: 0,
      endMs: durationMs,
      tracks: sampled(0, durationMs, 80, (ms) => pose(i, ms), stage.w * 0.45),
      props: prop,
    }));
    // The light sits where the focus is, so the photo in focus is the lit one.
    return [backgroundLayer(inputs, ctx), glow(ctx, focusAt, Math.min(stage.w, stage.h) * 1.5, 0.2), depthGroup(ctx, 'depth', cards), head];
  };

  return defineScene(variant, { textSlots: [headline], build });
}

function poseFor(
  shape: Shape,
  p: SceneVariant['params'],
  stage: Stage,
  n: number,
  durationMs: number,
  card: number,
  boxes: readonly Box[],
): { pose: (i: number, ms: number) => Pose; focusAt: { x: number; y: number } } {
  const laps = num(p, 'laps', 1);
  const R = Math.min(stage.w, stage.h) * num(p, 'radius', 0.36);
  const centre = { x: stage.cx, y: stage.cy };
  const box = (i: number): Box => boxes[i] ?? boxes[0] ?? { w: card, h: card };
  /** How large card `i` may grow, in focus at `at`. */
  const peakAt = (i: number, at: { x: number; y: number }, wanted?: number): number => roomFor(stage, at, box(i), wanted);
  /** The clock in card steps, lingering on each card as it reaches the focus. */
  const steps = (ms: number, perLoop: number): number => linger((ms / durationMs) * perLoop);
  /** A pose drawn into the focus point `at` as it comes into focus, then emphasised there. */
  const intoFocus = (i: number, base: Pose, f: number, at: { x: number; y: number }, wanted?: number, straighten = 0): Pose => {
    const peak = peakAt(i, at, wanted);
    const spot = roomyPoint(stage, at, box(i), peak);
    return { ...emphasise(base, f, peak, { straighten }), x: lerp(base.x, spot.x, f), y: lerp(base.y, spot.y, f) };
  };

  switch (shape) {
    case 'tunnel': {
      // The step of the corridor where a card is about life-size: there it
      // leaves its wall for the middle of the corridor, facing you.
      const sFocus = 0.74;
      return {
        focusAt: centre,
        pose: (i, ms) => {
          // Card i reaches the focus as the clock reaches each of its whole steps.
          const s = frac((i + steps(ms, n * laps)) / n + sFocus);
          const wall = i % 4;
          const reach = s * s;
          const spreadX = stage.w * 0.55 * reach;
          const spreadY = stage.h * 0.5 * reach;
          const x = stage.cx + (wall === 0 ? -spreadX : wall === 1 ? spreadX : (hash(i, 3) - 0.5) * spreadX);
          const y = stage.cy + (wall === 2 ? -spreadY : wall === 3 ? spreadY : (hash(i, 4) - 0.5) * spreadY);
          const base: Pose = { x, y, scale: lerp(0.08, 1.6, reach), z: s, opacity: clamp01(s * 5) * clamp01((1 - s) * 7), turnY: wall === 0 ? 50 : wall === 1 ? -50 : 0, turnX: wall === 2 ? -50 : wall === 3 ? 50 : 0 };
          return intoFocus(i, base, focusCurve(wrapSteps((s - sFocus) * n, n)), centre);
        },
      };
    }

    case 'hall': {
      // Where a card rushing out of the vanishing point is life-size.
      const sFocus = 0.75;
      return {
        focusAt: centre,
        pose: (i, ms) => {
          const s = frac((i + steps(ms, n * laps)) / n + sFocus);
          const reach = s ** 2.4;
          const angle = (i / n) * TAU;
          const base: Pose = { x: stage.cx + Math.cos(angle) * stage.w * 0.32 * reach, y: stage.cy + Math.sin(angle) * stage.h * 0.25 * reach, scale: lerp(0.06, 1.9, reach), z: s, opacity: clamp01(s * 6) * clamp01((1 - s) * 5) };
          return intoFocus(i, base, focusCurve(wrapSteps((s - sFocus) * n, n)), centre);
        },
      };
    }

    case 'warp': {
      // The rush never stops, but each turn the camera catches one photo: it
      // is drawn out of the stream into the middle, held there large, then let
      // go to streak on along its own line. Each card's place in the stream is
      // set so it is half-way out when its turn comes, so it is caught from
      // near the centre and released further along the same path.
      const speed = laps * 1.6;
      const turn = durationMs / n;
      return {
        focusAt: centre,
        pose: (i, ms) => {
          const phase = 0.5 - (((i + 0.5) * turn) / durationMs) * speed;
          const s = frac(phase + (ms / durationMs) * speed);
          const reach = s ** 2;
          const angle = hash(i, 9) * TAU;
          const f = turnFocus(ms, i, n, 0, durationMs, 0.22, true);
          const scale = lerp(0.04, 1.4, reach);
          const base: Pose = { x: stage.cx + Math.cos(angle) * stage.w * 0.75 * reach, y: stage.cy + Math.sin(angle) * stage.h * 0.65 * reach, scale, scaleX: scale * (1 + reach * 0.6 * (1 - f)), scaleY: scale, z: s, opacity: clamp01(s * 8) * clamp01((1 - s) * 8) };
          return intoFocus(i, base, f, centre);
        },
      };
    }

    case 'helix':
    case 'doubleHelix': {
      // The front crossing is the vertical middle of the climb: a quarter turn
      // added to the spiral puts it there. In the double helix only the strand
      // passing the front at that moment takes the focus.
      const strands = shape === 'doubleHelix' ? 2 : 1;
      const places = Math.ceil(n / strands);
      return {
        focusAt: centre,
        pose: (i, ms) => {
          const strand = i % strands;
          const s = frac((Math.floor(i / strands) + steps(ms, places * laps)) / places + 0.5);
          const a = s * TAU * 1.5 + Math.PI / 2 + strand * Math.PI;
          const depth = Math.cos(a);
          const base: Pose = { x: stage.cx + Math.sin(a) * R, y: lerp(stage.cy + stage.h * 0.48, stage.cy - stage.h * 0.48, s), scale: lerp(0.5, 1.05, (depth + 1) / 2), turnY: -Math.sin(a) * 55, z: depth, opacity: clamp01(s * 7) * clamp01((1 - s) * 7) * lerp(0.5, 1, (depth + 1) / 2) };
          const f = strand === 0 ? focusCurve(wrapSteps((s - 0.5) * places, places)) : 0;
          return intoFocus(i, base, f, centre);
        },
      };
    }

    case 'cylinder':
      return {
        focusAt: centre,
        pose: (i, ms) => {
          const off = wrapSteps(i - steps(ms, n * laps), n);
          const a = (off / n) * TAU;
          const depth = Math.cos(a);
          const base: Pose = { x: stage.cx, y: stage.cy + Math.sin(a) * R * 1.1, scaleX: lerp(0.8, 1.15, (depth + 1) / 2), scaleY: lerp(0.8, 1.15, (depth + 1) / 2), turnX: Math.sin(a) * 70, z: depth, opacity: lerp(0.3, 1, (depth + 1) / 2) };
          return intoFocus(i, base, focusCurve(off), centre);
        },
      };

    case 'wave':
      return {
        focusAt: centre,
        pose: (i, ms) => {
          // The middle of the frame is the focus: the card crossing it rides up
          // out of the wave to face you.
          const s = frac((i + steps(ms, n * laps)) / n + 0.5);
          const x = lerp(stage.cx - stage.w * 0.7, stage.cx + stage.w * 0.7, s);
          const phase = s * TAU * 1.2 + (ms / durationMs) * TAU;
          const depth = Math.cos(phase);
          const base: Pose = { x, y: stage.cy + Math.sin(phase) * stage.h * 0.16, scale: lerp(0.6, 1, (depth + 1) / 2), turnX: Math.sin(phase) * 30, z: depth };
          return intoFocus(i, base, focusCurve(wrapSteps((s - 0.5) * n, n)), centre);
        },
      };

    case 'dome': {
      // Cards on a sphere, in bands of latitude, the sphere turning about its
      // axis a whole turn per loop. The equator's cards take the focus as each
      // reaches the front.
      const bands = 3;
      const perBand = Math.ceil(n / bands);
      return {
        focusAt: centre,
        pose: (i, ms) => {
          const band = Math.floor(i / perBand);
          const k = i % perBand;
          const lat = ((band - (bands - 1) / 2) / bands) * 1.6;
          const turned = (steps(ms, perBand * laps) / perBand) * TAU - Math.PI / perBand;
          const lon = (k / perBand) * TAU + (band % 2) * (Math.PI / perBand) + turned;
          const depth = Math.cos(lon) * Math.cos(lat);
          const wrapped = lon % TAU > Math.PI ? (lon % TAU) - TAU : lon % TAU;
          const base: Pose = { x: stage.cx + Math.sin(lon) * Math.cos(lat) * R * 1.2, y: stage.cy + Math.sin(lat) * R * 1.2, scale: lerp(0.35, 0.9, (depth + 1) / 2), turnY: -wrapped * (180 / Math.PI) * 0.9, turnX: (lat * 180) / Math.PI * 0.7, z: depth, opacity: lerp(0.25, 1, (depth + 1) / 2) };
          const f = band === 1 ? focusCurve((wrapped / TAU) * perBand) : 0;
          return intoFocus(i, base, f, centre);
        },
      };
    }

    case 'floating':
      // A loose stack drifting in parallax, near cards moving more than far
      // ones. One at a time, a card is lifted out of the stack to the middle.
      return {
        focusAt: centre,
        pose: (i, ms) => {
          const depth = hash(i, 21);
          const drift = Math.sin(ms / 1400 + i * 1.7) * (0.3 + depth);
          const base: Pose = { x: stage.cx + (hash(i, 22) - 0.5) * stage.w * 0.7 + drift * card * 0.2, y: stage.cy + (hash(i, 23) - 0.5) * stage.h * 0.6 + Math.cos(ms / 1700 + i) * card * 0.15 * (0.3 + depth), rotation: (hash(i, 24) - 0.5) * 16, scale: lerp(0.55, 1.15, depth), z: depth, opacity: lerp(0.6, 1, depth) };
          return intoFocus(i, base, turnFocus(ms, i, n, 0, durationMs, 0.22, true), centre, 1.35, 0.8);
        },
      };

    case 'carousel': {
      const front = { x: stage.cx, y: stage.cy + R * 0.25 };
      return {
        focusAt: front,
        pose: (i, ms) => {
          const off = wrapSteps(i - steps(ms, n * laps), n);
          const a = (off / n) * TAU;
          const depth = Math.cos(a);
          const base: Pose = { x: stage.cx + Math.sin(a) * R * 1.2, y: stage.cy + depth * R * 0.25, scale: lerp(0.5, 1, (depth + 1) / 2), turnY: -Math.sin(a) * 60, z: depth, opacity: lerp(0.4, 1, (depth + 1) / 2) };
          return intoFocus(i, base, focusCurve(off), front);
        },
      };
    }

    case 'fan': {
      // Cards fan out from a vanishing point toward the camera, then fold back.
      // While the fan opens and closes the middle card leads; while it is open,
      // each card takes its turn, left to right, lifting where it stands.
      const openEnd = durationMs * 0.3;
      const closeStart = durationMs * 0.78;
      const mid = Math.floor(n / 2);
      const edgeMs = ((closeStart - openEnd) / n) * 0.22;
      return {
        focusAt: centre,
        pose: (i, ms) => {
          const open = easeInOut(Math.min(1, ms / openEnd)) * (1 - easeInOut(Math.max(0, (ms - closeStart) / (durationMs * 0.22))));
          const off = i - (n - 1) / 2;
          const depth = 1 - Math.abs(off) / n;
          const base: Pose = { x: stage.cx + off * card * 0.42 * open, y: stage.cy - stage.h * 0.15 * (1 - open) + Math.abs(off) * card * 0.08 * open, rotation: off * 7 * open, scale: lerp(0.3, lerp(0.7, 1.05, depth), open), z: depth, turnY: -off * 8 * open };
          const leading = i === mid ? Math.max(easeInOut((openEnd + edgeMs / 2 - ms) / edgeMs), easeInOut((ms - closeStart + edgeMs / 2) / edgeMs)) : 0;
          const f = Math.max(turnFocus(ms, i, n, openEnd, closeStart), leading);
          // Grows with the fan: a closed fan's leading card is a small one.
          const peak = lerp(0.3, peakAt(i, { x: base.x, y: base.y }), open);
          const lifted = { ...base, y: base.y - card * 0.06 * f * open };
          const spot = roomyPoint(stage, lifted, box(i), peak);
          return { ...emphasise(base, f, peak, { straighten: 0.8 }), x: lerp(base.x, spot.x, f), y: lerp(base.y, spot.y, f) };
        },
      };
    }

    case 'accordion': {
      // Panels side by side, folded; one panel at a time opens flat and full
      // size, and the open panel travels along the row and back.
      const visits = n > 1 ? n * 2 - 2 : 1;
      const order = (v: number): number => (v < n ? v : n * 2 - 2 - v);
      const folded = 0.45;
      const gap = card * 0.06;
      // Small enough that the open panel and the folded rest fit across the stage.
      const across = (boxW: number, peak: number): number => boxW * peak + (n - 1) * boxW * 0.9 * 0.86 * folded + gap * n;
      const peak = Math.max(1, Math.min(peakAt(0, centre), (stage.w - (n - 1) * box(0).w * 0.9 * 0.86 * folded - gap * n) / box(0).w));
      const fit = Math.min(1, stage.w / across(box(0).w, peak));
      const openness = (j: number, ms: number): number => {
        let f = 0;
        for (let v = 0; v < visits; v++) if (order(v) === j) f = Math.max(f, turnFocus(ms, v, visits, 0, durationMs, 0.3, true));
        return f;
      };
      return {
        focusAt: centre,
        pose: (i, ms) => {
          const fs = Array.from({ length: n }, (_, j) => openness(j, ms));
          // Each panel's width as drawn: open ones flat and large, folded ones turned edge-on.
          const widths = fs.map((f, j) => (box(j).w * lerp(0.9 * 0.86 * folded, peak, f) + gap) * fit);
          const total = widths.reduce((sum, w) => sum + w, 0);
          let x = stage.cx - total / 2;
          for (let j = 0; j < i; j++) x += widths[j] ?? 0;
          x += (widths[i] ?? 0) / 2;
          const f = fs[i] ?? 0;
          const turn = (i % 2 === 0 ? 1 : -1) * Math.acos(folded) * (180 / Math.PI) * (1 - f);
          const base: Pose = { x, y: stage.cy, turnY: turn, scale: 0.9 * fit, z: i % 2 === 0 ? 1 : 0 };
          return emphasise(base, f, peak * fit);
        },
      };
    }
  }
}
