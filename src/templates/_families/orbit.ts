import type { Layer } from '@/core/types';
import type { SceneInputs } from '@/document/types';
import type { BuildContext } from '../buildContext';
import { flag, num, pick, text, type SceneVariant } from '../catalog';
import type { SceneTemplate } from '../schema';
import { backgroundLayer } from '../_shared/chrome';
import { fillSlots } from '../_shared/photo';
import { beat, cardCount, cardProps, defineScene, depthGroup, easeInOut, FOCUS, focusCurve, glow, headlineAndStage, headlineSlot, isTall, lerp, linger, sampled, wrapSteps, type Pose, type Stage } from './kit';
import { focusIn, frac, lingerAt, smoother, type Box } from './emphasis';

/**
 * Ring Path (D-119): photographs travelling round a path in depth.
 *
 * Every variant is a function from (card, moment) to a pose — where it is,
 * how near, how turned — sampled into keyframes. Depth is real: the cards sit
 * in a depth-sorted group (D-117), so they pass in front of and behind each
 * other as they go round.
 *
 * One photo is in focus at every moment (D-157): each path has a focus point
 * — the front of a ring, the foot of a wheel, the crown of a crescent — and
 * the photo reaching it grows to fill it, faces you and comes forward while
 * the rest step back and darken. The turn lingers there, then moves on.
 */

type Shape =
  | 'ring' | 'wheel' | 'infinity' | 'pendulum' | 'crescent' | 'halo' | 'dual' | 'moons' | 'bloom' | 'roulette';

const SHAPES: readonly Shape[] = ['ring', 'wheel', 'infinity', 'pendulum', 'crescent', 'halo', 'dual', 'moons', 'bloom', 'roulette'];

const TAU = Math.PI * 2;

export function create(variant: SceneVariant): SceneTemplate {
  const p = variant.params;
  const shape = pick<Shape>(p, 'shape', SHAPES, 'ring');
  const headline = headlineSlot(text(p, 'headline', 'The collection'), {}, 50);

  const build = (inputs: SceneInputs, ctx: BuildContext): Layer[] => {
    const { durationMs } = ctx;
    const n = cardCount(inputs, variant);
    const photos = fillSlots(inputs.photos, n);
    const { headline: head, stage } = headlineAndStage(ctx, inputs, headline, { bottom: flag(p, 'textBelow') });
    const u = Math.min(ctx.design.w, ctx.design.h);
    const tall = isTall(stage);
    const card = Math.min(stage.w, stage.h) * num(p, 'card', 0.34) * (tall ? 1.3 : 1);
    const props = photos.map((photo) => cardProps(photo, card, inputs, u));
    const boxes: Box[] = props.map((prop) => ({ w: prop.w, h: prop.h }));
    const { pose, focusAt, stepMs } = poseFor(shape, p, stage, n, durationMs, tall, boxes);

    const cards = props.map((prop, i): Layer => ({
      id: ctx.id('card'),
      type: 'image',
      startMs: 0,
      endMs: durationMs,
      tracks: sampled(0, durationMs, stepMs, (ms) => pose(i, ms)),
      props: prop,
    }));

    return [
      backgroundLayer(inputs, ctx),
      // The light sits at the focus point, so the photo in focus is the lit one.
      glow(ctx, focusAt, Math.min(stage.w, stage.h) * 1.4, 0.18),
      depthGroup(ctx, 'ring', cards),
      head,
    ];
  };

  return defineScene(variant, { textSlots: [headline], build });
}

/** How near a card is, from -1 (far side) to 1 (front), as scale, fade and depth. */
function depthPose(x: number, y: number, depth: number, extra: Partial<Pose> = {}): Pose {
  const near = (depth + 1) / 2;
  return { x, y, scale: lerp(0.52, 1.06, near), opacity: lerp(0.45, 1, near), z: depth, ...extra };
}

type Path = {
  readonly pose: (i: number, ms: number) => Pose;
  /** Where the photo in focus stands. */
  readonly focusAt: { readonly x: number; readonly y: number };
  readonly stepMs: number;
};

function poseFor(shape: Shape, p: SceneVariant['params'], stage: Stage, n: number, durationMs: number, tall: boolean, boxes: readonly Box[]): Path {
  const rx = stage.w * num(p, 'radius', 0.36);
  // A story frame has height to spare: the ring opens up to use it.
  const ry = Math.min(stage.h * 0.42, rx * num(p, 'tilt', 0.32) * (tall ? 1.7 : 1));
  const laps = num(p, 'laps', 1);
  const face = flag(p, 'face', true);
  const snap = flag(p, 'snap');
  const box = (i: number): Box => boxes[i] ?? boxes[0] ?? { w: 1, h: 1 };
  const tallest = Math.max(1, ...boxes.map((b) => b.h));
  /** The clock in card steps: lingering at each focus, or a beat that settles on it. */
  const stepsAt = (ms: number): number => {
    if (snap) {
      const b = beat(ms, durationMs, n, 0.32);
      return b.index + b.eased;
    }
    return linger((ms / durationMs) * n * laps);
  };
  /** The card `steps` round from the front of the ring, as a pose. */
  const ringPose = (steps: number, turn: number): Pose => {
    const a = (steps / n) * TAU;
    const depth = Math.cos(a);
    return depthPose(stage.cx + Math.sin(a) * rx, stage.cy + depth * ry, depth, turn ? { turnY: -Math.sin(a) * turn } : {});
  };
  const front = { x: stage.cx, y: stage.cy + ry };

  switch (shape) {
    case 'ring':
      return {
        focusAt: front,
        stepMs: 80,
        pose: (i, ms) => {
          const steps = wrapSteps(i - stepsAt(ms), n);
          return focusIn(ringPose(steps, face ? 50 : 0), focusCurve(steps), stage, box(i));
        },
      };

    case 'roulette': {
      // Each beat the ring spins a full turn and one card more, fast in the
      // middle and easing onto the next photo. The spin starts gently, so the
      // photo leaving the front shrinks away rather than vanishing; photos
      // flashing past at full speed are not emphasised at all.
      const spinShare = 0.5;
      return {
        focusAt: front,
        stepMs: 40,
        pose: (i, ms) => {
          const b = beat(ms, durationMs, n, spinShare);
          const s = Math.min(1, b.u / spinShare);
          const steps = wrapSteps(i - (b.index + easeInOut(s) * (n + 1)), n);
          const calm = 1 - smoother((s - 0.15) / 0.2) * smoother((0.85 - s) / 0.2);
          return focusIn(ringPose(steps, 45), focusCurve(steps) * calm, stage, box(i));
        },
      };
    }

    case 'wheel': {
      const low = flag(p, 'low');
      const peak = 1.25;
      // The Ferris wheel's focus is its lowest car, so the wheel is kept small
      // enough for that car to grow without leaving the stage.
      const natural = Math.min(stage.w, stage.h) * num(p, 'radius', 0.36);
      const r = low ? natural * 1.5 : Math.min(natural, Math.max(stage.h / 2 - (tallest * peak) / 2, stage.h * 0.25));
      const cy = low ? stage.cy + stage.h * 0.5 : stage.cy;
      // A wheel's focus is its foot (the Ferris wheel) or its top (the low wheel), in card steps.
      const centre = low ? 0 : n / 2;
      return {
        focusAt: { x: stage.cx, y: low ? cy - r : cy + r },
        stepMs: 80,
        pose: (i, ms) => {
          const at = lingerAt((ms / durationMs) * n * laps, -centre);
          const a = ((i + at) / n) * TAU;
          const base: Pose = { x: stage.cx + Math.sin(a) * r, y: cy - Math.cos(a) * r, z: -Math.cos(a), scale: low ? lerp(0.7, 1, (Math.cos(a) + 1) / 2) : 1 };
          return focusIn(base, focusCurve(wrapSteps(i + at - centre, n)), stage, box(i), peak);
        },
      };
    }

    case 'infinity':
      // The focus is the near crossing at the middle of the figure of eight.
      return {
        focusAt: { x: stage.cx, y: stage.cy },
        stepMs: 80,
        pose: (i, ms) => {
          const at = linger((ms / durationMs) * n * laps);
          const t = ((i + at) / n) * TAU;
          const depth = Math.cos(t);
          const base = depthPose(stage.cx + Math.sin(t) * rx * 1.1, stage.cy + Math.sin(t) * Math.cos(t) * ry * 1.6, depth);
          return focusIn(base, focusCurve(wrapSteps(i + at, n)), stage, box(i));
        },
      };

    case 'pendulum': {
      const pivotY = stage.cy - stage.h * 0.55;
      const length = stage.h * 0.8;
      const spread = 0.24;
      const mid = (n - 1) / 2;
      // The swing, in card spacings, ends on a photo at each side, and it
      // lingers on each photo it passes as that one hangs straight down.
      const grid = frac(mid);
      const reach = Math.min(Math.max(mid, 0.5), Math.max(grid === 0 ? 1 : grid, Math.round(1.58 - grid) + grid));
      const swings = Math.max(1, Math.round(laps * 2));
      return {
        focusAt: { x: stage.cx, y: pivotY + length },
        stepMs: 80,
        pose: (i, ms) => {
          const swing = lingerAt(Math.sin((ms / durationMs) * TAU * swings) * reach, -mid);
          const steps = swing + (i - mid);
          const a = steps * spread;
          const depth = Math.cos(a * 2);
          const base: Pose = { x: stage.cx + Math.sin(a) * length, y: pivotY + Math.cos(a) * length, rotation: (-a * 180) / Math.PI, z: depth, scale: lerp(0.75, 1.02, (depth + 1) / 2) };
          return focusIn(base, focusCurve(steps), stage, box(i), FOCUS.peak, { straighten: 1 });
        },
      };
    }

    case 'crescent': {
      // Cards travel an arc from left to right, largest at its crown.
      const radius = Math.max(stage.w, stage.h) * 0.62;
      const centreY = stage.cy + radius * 0.82;
      const arc = 1.15;
      return {
        focusAt: { x: stage.cx, y: centreY - radius },
        stepMs: 80,
        pose: (i, ms) => {
          const at = lingerAt((ms / durationMs) * n * laps, -n / 2);
          const s = frac((i + at) / n);
          const a = -arc + s * arc * 2;
          const crown = Math.cos((a / arc) * (Math.PI / 2));
          const base: Pose = { x: stage.cx + Math.sin(a) * radius, y: centreY - Math.cos(a) * radius, rotation: (a * 180) / Math.PI * 0.6, scale: lerp(0.55, 1.08, crown), opacity: Math.min(1, crown * 2.2), z: crown };
          return focusIn(base, focusCurve(wrapSteps(i + at - n / 2, n)), stage, box(i), FOCUS.peak, { straighten: 1 });
        },
      };
    }

    case 'halo': {
      // Two rings: the inner one turning one way, the outer the other,
      // breathing. The focus is the foot of the outer ring.
      const outer = Math.max(1, Math.floor(n / 2));
      const inner = Math.max(1, Math.ceil(n / 2));
      const R = Math.min(stage.w, stage.h) * 0.42;
      return {
        focusAt: { x: stage.cx, y: stage.cy + R },
        stepMs: 80,
        pose: (i, ms) => {
          const k = Math.floor(i / 2);
          const breathe = 1 + Math.sin((ms / durationMs) * TAU * 2) * 0.06;
          if (i % 2 === 0) {
            const a = (k / inner) * TAU + (ms / durationMs) * TAU * 0.5;
            return focusIn({ x: stage.cx + Math.sin(a) * R * 0.5 * breathe, y: stage.cy - Math.cos(a) * R * 0.5 * breathe, scale: 0.8, z: 1 }, 0, stage, box(i));
          }
          // Card k is at the foot when `steps` is half the ring round.
          const steps = k + 0.5 - lingerAt((ms / durationMs) * 0.5 * outer, outer / 2 - 0.5);
          const a = (steps / outer) * TAU;
          const base: Pose = { x: stage.cx + Math.sin(a) * R * breathe, y: stage.cy - Math.cos(a) * R * breathe, scale: 0.66, z: 0 };
          return focusIn(base, focusCurve(wrapSteps(steps - outer / 2, outer)), stage, box(i), 1.3);
        },
      };
    }

    case 'dual': {
      // The second ring runs half a step behind the first, so the two take
      // turns bringing a photo to the front.
      const first = Math.max(1, Math.ceil(n / 2));
      const second = Math.max(1, Math.floor(n / 2));
      return {
        focusAt: { x: stage.cx, y: stage.cy + ry },
        stepMs: 80,
        pose: (i, ms) => {
          const other = i % 2 === 1;
          const k = Math.floor(i / 2);
          const count = other ? second : first;
          const at = linger((ms / durationMs) * laps * first * 2) / 2;
          const steps = other ? wrapSteps(k - at + 0.5, count) : wrapSteps(k + at, count);
          const tilt = other ? -0.36 : 0.36;
          const a = (steps / count) * TAU;
          const ex = Math.sin(a) * rx;
          const ey = Math.cos(a) * ry;
          const depth = Math.cos(a);
          const base = depthPose(stage.cx + ex * Math.cos(tilt) - ey * Math.sin(tilt), stage.cy + ex * Math.sin(tilt) + ey * Math.cos(tilt), depth);
          return focusIn(base, focusCurve(steps, FOCUS.reach / 2), stage, box(i));
        },
      };
    }

    case 'moons':
      // The lead photo is the permanent subject; its moons keep their orbit.
      return {
        focusAt: { x: stage.cx, y: stage.cy },
        stepMs: 80,
        pose: (i, ms) => {
          if (i === 0) {
            // The lead card holds the centre, gently breathing.
            return { x: stage.cx, y: stage.cy, scale: 1.25 + Math.sin(ms / 900) * 0.02, z: 0 };
          }
          const k = i - 1;
          const a = (k / (n - 1)) * TAU - (ms / durationMs) * TAU * laps;
          const depth = Math.cos(a);
          return depthPose(stage.cx + Math.sin(a) * rx * 1.1, stage.cy + depth * ry * 1.2, depth * 1.4, { scale: lerp(0.38, 0.7, (depth + 1) / 2) });
        },
      };

    case 'bloom':
      return {
        focusAt: front,
        stepMs: 80,
        pose: (i, ms) => {
          // Out of a stack into a ring, a slow turn, and back into the stack to
          // loop. Stacked, the top photo is the focus; in the ring, the front one.
          const open = easeInOut(Math.min(1, ms / (durationMs * 0.25)));
          const close = easeInOut(Math.max(0, (ms - durationMs * 0.8) / (durationMs * 0.2)));
          const spread = open * (1 - close);
          const steps = wrapSteps(i - linger((ms / durationMs) * n * 0.35), n);
          const ring = ringPose(steps, 40 * spread);
          const base: Pose = {
            ...ring,
            x: lerp(stage.cx, ring.x, spread),
            y: lerp(stage.cy + (i - n / 2) * 2, ring.y, spread),
            rotation: (1 - spread) * (i - (n - 1) / 2) * 3,
            scale: lerp(0.9, ring.scale ?? 1, spread),
            opacity: lerp(1, ring.opacity ?? 1, spread),
            z: lerp(i / n, ring.z ?? 0, spread),
          };
          const f = spread * focusCurve(steps) + (1 - spread) * (i === n - 1 ? 1 : 0);
          return focusIn(base, f, stage, box(i), FOCUS.peak, { straighten: 1 });
        },
      };
  }
}
