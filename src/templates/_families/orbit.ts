import type { Layer } from '@/core/types';
import type { SceneInputs } from '@/document/types';
import type { BuildContext } from '../buildContext';
import { flag, num, pick, text, type SceneVariant } from '../catalog';
import type { SceneTemplate } from '../schema';
import { backgroundLayer } from '../_shared/chrome';
import { fillSlots } from '../_shared/photo';
import { beat, cardCount, cardProps, defineScene, depthGroup, easeInOut, easeOut, glow, headlineAndStage, headlineSlot, isTall, lerp, sampled, type Pose, type Stage } from './kit';

/**
 * Ring Path (D-119): photographs travelling round a path in depth.
 *
 * Every variant is a function from (card, moment) to a pose — where it is,
 * how near, how turned — sampled into keyframes. Depth is real: the cards sit
 * in a depth-sorted group (D-117), so they pass in front of and behind each
 * other as they go round.
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
    const pose = poseFor(shape, p, stage, n, durationMs, tall);

    const cards = photos.map((photo, i): Layer => ({
      id: ctx.id('card'),
      type: 'image',
      startMs: 0,
      endMs: durationMs,
      tracks: sampled(0, durationMs, 80, (ms) => pose(i, ms)),
      props: cardProps(photo, card, inputs, u),
    }));

    return [
      backgroundLayer(inputs, ctx),
      glow(ctx, { x: stage.cx, y: stage.cy }, Math.min(stage.w, stage.h) * 1.4, 0.18),
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

function poseFor(shape: Shape, p: SceneVariant['params'], stage: Stage, n: number, durationMs: number, tall: boolean): (i: number, ms: number) => Pose {
  const rx = stage.w * num(p, 'radius', 0.36);
  // A story frame has height to spare: the ring opens up to use it.
  const ry = Math.min(stage.h * 0.42, rx * num(p, 'tilt', 0.32) * (tall ? 1.7 : 1));
  const laps = num(p, 'laps', 1);
  const face = flag(p, 'face', true);
  const snap = flag(p, 'snap');
  const spinAt = (ms: number): number => {
    if (snap) {
      const b = beat(ms, durationMs, n, 0.32);
      return ((b.index + b.eased) / n) * TAU;
    }
    return (ms / durationMs) * TAU * laps;
  };

  switch (shape) {
    case 'ring':
      return (i, ms) => {
        const a = (i / n) * TAU - spinAt(ms);
        const depth = Math.cos(a);
        return depthPose(stage.cx + Math.sin(a) * rx, stage.cy + depth * ry, depth, face ? { turnY: -Math.sin(a) * 50 } : {});
      };

    case 'roulette':
      return (i, ms) => {
        // Spins fast at the start of each beat and eases hard onto the next card.
        const b = beat(ms, durationMs, n, 0.55);
        const spin = ((b.index + 1 - (1 - easeOut(b.u / 0.55)) * 3) / n) * TAU;
        const a = (i / n) * TAU - spin;
        const depth = Math.cos(a);
        return depthPose(stage.cx + Math.sin(a) * rx, stage.cy + depth * ry, depth, { turnY: -Math.sin(a) * 45 });
      };

    case 'wheel': {
      const low = flag(p, 'low');
      const r = Math.min(stage.w, stage.h) * num(p, 'radius', 0.36) * (low ? 1.5 : 1);
      const cy = low ? stage.cy + stage.h * 0.5 : stage.cy;
      return (i, ms) => {
        const a = (i / n) * TAU + spinAt(ms);
        return { x: stage.cx + Math.sin(a) * r, y: cy - Math.cos(a) * r, z: -Math.cos(a), scale: low ? lerp(0.7, 1, (Math.cos(a) + 1) / 2) : 1 };
      };
    }

    case 'infinity':
      return (i, ms) => {
        const t = (i / n) * TAU + spinAt(ms);
        const depth = Math.cos(t);
        return depthPose(stage.cx + Math.sin(t) * rx * 1.1, stage.cy + Math.sin(t) * Math.cos(t) * ry * 1.6, depth);
      };

    case 'pendulum': {
      const pivotY = stage.cy - stage.h * 0.55;
      const length = stage.h * 0.8;
      const spread = 0.24;
      return (i, ms) => {
        const swing = Math.sin((ms / durationMs) * TAU * Math.max(1, Math.round(laps * 2))) * 0.38;
        const off = (i - (n - 1) / 2) * spread;
        const a = swing + off;
        const depth = Math.cos(a * 2);
        return { x: stage.cx + Math.sin(a) * length, y: pivotY + Math.cos(a) * length, rotation: (-a * 180) / Math.PI, z: depth, scale: lerp(0.75, 1.02, (depth + 1) / 2) };
      };
    }

    case 'crescent': {
      // Cards travel an arc from left to right, largest at its crown.
      const radius = Math.max(stage.w, stage.h) * 0.62;
      const centreY = stage.cy + radius * 0.82;
      const arc = 1.15;
      return (i, ms) => {
        const s = ((i / n + (ms / durationMs) * laps) % 1);
        const a = -arc + s * arc * 2;
        const crown = Math.cos((a / arc) * (Math.PI / 2));
        return { x: stage.cx + Math.sin(a) * radius, y: centreY - Math.cos(a) * radius, rotation: (a * 180) / Math.PI * 0.6, scale: lerp(0.55, 1.08, crown), opacity: Math.min(1, crown * 2.2), z: crown };
      };
    }

    case 'halo':
      return (i, ms) => {
        // Two rings: the inner one turning one way, the outer the other, breathing.
        const inner = i % 2 === 0;
        const k = Math.floor(i / 2);
        const count = inner ? Math.ceil(n / 2) : Math.floor(n / 2);
        const breathe = 1 + Math.sin((ms / durationMs) * TAU * 2) * 0.06;
        const r = (inner ? 0.5 : 1) * Math.min(stage.w, stage.h) * 0.42 * breathe;
        const a = (k / Math.max(1, count)) * TAU + (inner ? 1 : -1) * (ms / durationMs) * TAU * 0.5 + (inner ? 0 : Math.PI / count);
        return { x: stage.cx + Math.sin(a) * r, y: stage.cy - Math.cos(a) * r, scale: inner ? 0.8 : 0.66, z: inner ? 1 : 0 };
      };

    case 'dual':
      return (i, ms) => {
        const second = i % 2 === 1;
        const k = Math.floor(i / 2);
        const count = Math.max(1, second ? Math.floor(n / 2) : Math.ceil(n / 2));
        const tilt = second ? -0.36 : 0.36;
        const a = (k / count) * TAU + (second ? -1 : 1) * (ms / durationMs) * TAU * laps;
        const ex = Math.sin(a) * rx;
        const ey = Math.cos(a) * ry;
        const depth = Math.cos(a);
        return depthPose(stage.cx + ex * Math.cos(tilt) - ey * Math.sin(tilt), stage.cy + ex * Math.sin(tilt) + ey * Math.cos(tilt), depth);
      };

    case 'moons':
      return (i, ms) => {
        if (i === 0) {
          // The lead card holds the centre, gently breathing.
          return { x: stage.cx, y: stage.cy, scale: 1.25 + Math.sin(ms / 900) * 0.02, z: 0 };
        }
        const k = i - 1;
        const a = (k / (n - 1)) * TAU - (ms / durationMs) * TAU * laps;
        const depth = Math.cos(a);
        return depthPose(stage.cx + Math.sin(a) * rx * 1.1, stage.cy + depth * ry * 1.2, depth * 1.4, { scale: lerp(0.38, 0.7, (depth + 1) / 2) });
      };

    case 'bloom':
      return (i, ms) => {
        // Out of a stack into a ring, a slow turn, and back into the stack to loop.
        const open = easeInOut(Math.min(1, ms / (durationMs * 0.25)));
        const close = easeInOut(Math.max(0, (ms - durationMs * 0.8) / (durationMs * 0.2)));
        const spread = open * (1 - close);
        const a = (i / n) * TAU - (ms / durationMs) * TAU * 0.35;
        const depth = Math.cos(a);
        const ring = depthPose(stage.cx + Math.sin(a) * rx, stage.cy + depth * ry, depth, { turnY: -Math.sin(a) * 40 * spread });
        return {
          ...ring,
          x: lerp(stage.cx, ring.x, spread),
          y: lerp(stage.cy + (i - n / 2) * 2, ring.y, spread),
          rotation: (1 - spread) * (i - (n - 1) / 2) * 3,
          scale: lerp(0.9, ring.scale ?? 1, spread),
          opacity: lerp(1, ring.opacity ?? 1, spread),
          z: lerp(i / n, depth, spread),
        };
      };
  }
}
