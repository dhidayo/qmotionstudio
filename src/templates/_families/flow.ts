import type { Layer } from '@/core/types';
import type { SceneInputs } from '@/document/types';
import type { BuildContext } from '../buildContext';
import { flag, num, pick, text, type SceneVariant } from '../catalog';
import type { SceneTemplate } from '../schema';
import { backgroundLayer } from '../_shared/chrome';
import { fillSlots } from '../_shared/photo';
import { beat, cardCount, cardProps, clamp01, defineScene, depthGroup, glow, headlineAndStage, headlineSlot, isTall, lerp, sampled, type Pose, type Stage } from './kit';
import { hash } from '@/core/render/layers/kinetic';

/**
 * Flow Track (D-119): photographs moving along a lane — the coverflow every
 * phone made familiar, carousels, shelves, conveyors, escalators, and rows
 * that drift past at their own depth.
 */

type Shape =
  | 'coverflow' | 'vertical' | 'diagonal' | 'shelf' | 'conveyor' | 'escalator'
  | 'sine' | 'polaroid' | 'centerLock' | 'stackPush' | 'zipper' | 'river';

const SHAPES: readonly Shape[] = ['coverflow', 'vertical', 'diagonal', 'shelf', 'conveyor', 'escalator', 'sine', 'polaroid', 'centerLock', 'stackPush', 'zipper', 'river'];

export function create(variant: SceneVariant): SceneTemplate {
  const p = variant.params;
  const shape = pick<Shape>(p, 'shape', SHAPES, 'coverflow');
  const headline = headlineSlot(text(p, 'headline', 'The collection'), {}, 50);

  const build = (inputs: SceneInputs, ctx: BuildContext): Layer[] => {
    const { durationMs } = ctx;
    const n = cardCount(inputs, variant);
    const photos = fillSlots(inputs.photos, n);
    const { headline: head, stage } = headlineAndStage(ctx, inputs, headline, { bottom: flag(p, 'textBelow') });
    const u = Math.min(ctx.design.w, ctx.design.h);
    const tall = isTall(stage);
    const card = Math.min(stage.w, stage.h) * num(p, 'card', 0.42) * (tall ? 1.25 : 1);
    const pose = poseFor(shape, p, stage, n, durationMs, card, tall);
    const cards = photos.map((photo, i): Layer => ({
      id: ctx.id('card'),
      type: 'image',
      startMs: 0,
      endMs: durationMs,
      tracks: sampled(0, durationMs, 80, (ms) => pose(i, ms), stage.w * 0.45),
      props: cardProps(photo, card, inputs, u),
    }));
    return [backgroundLayer(inputs, ctx), glow(ctx, { x: stage.cx, y: stage.cy }, Math.min(stage.w, stage.h) * 1.3, 0.16), depthGroup(ctx, 'flow', cards), head];
  };

  return defineScene(variant, { textSlots: [headline], build });
}

/** Where card `i` is relative to the one in focus, wrapped into [-n/2, n/2). */
function offsetOf(i: number, focus: number, n: number): number {
  let off = (i - focus) % n;
  if (off < -n / 2) off += n;
  if (off >= n / 2) off -= n;
  return off;
}

function poseFor(shape: Shape, p: SceneVariant['params'], stage: Stage, n: number, durationMs: number, card: number, tall: boolean): (i: number, ms: number) => Pose {
  const snap = flag(p, 'snap');
  const laps = num(p, 'laps', 1);
  const focusAt = (ms: number): number => {
    if (snap) {
      const b = beat(ms, durationMs, n, 0.3);
      return b.index + b.eased;
    }
    return (ms / durationMs) * n * laps;
  };
  const tilt = num(p, 'tilt', 62);
  const gap = card * num(p, 'gap', 0.55);

  switch (shape) {
    case 'coverflow':
    case 'vertical':
    case 'diagonal':
    case 'centerLock':
      return (i, ms) => {
        const off = offsetOf(i, focusAt(ms), n);
        const a = Math.abs(off);
        const side = Math.sign(off);
        const near = Math.min(a, 1);
        const along = side * (near * card * 0.62 + Math.max(0, a - 1) * gap);
        // Gone before it reaches the far end, where it wraps round to the other side.
        const fade = clamp01(Math.min(3.2 - a, (n / 2 - a) * 2.5));
        if (shape === 'centerLock') {
          return { x: stage.cx + off * card * 0.82, y: stage.cy, scale: lerp(1.12, 0.78, near), opacity: fade, z: -a };
        }
        const turn = -Math.max(-1, Math.min(1, off)) * tilt;
        const scale = 1 - near * 0.2;
        if (shape === 'vertical') return { x: stage.cx, y: stage.cy + along * (tall ? 1 : 0.8), turnX: turn, scale, opacity: fade, z: -a };
        if (shape === 'diagonal') return { x: stage.cx + along * 0.8, y: stage.cy + along * 0.55, turnY: turn * 0.7, scale, opacity: fade, z: -a };
        return { x: stage.cx + along, y: stage.cy, turnY: turn, scale, opacity: fade, z: -a };
      };

    case 'shelf':
      return (i, ms) => {
        // A row receding to the right: perspective by scale, scrolling left.
        const s = ((i / n + (ms / durationMs) * laps) % 1);
        const depth = s;
        const scale = lerp(1.05, 0.32, depth);
        return { x: lerp(stage.cx - stage.w * 0.42, stage.cx + stage.w * 0.45, Math.sqrt(depth)), y: stage.cy - depth * stage.h * 0.12, scale, turnY: -28, z: -depth, opacity: clamp01(depth * 8) * clamp01((1 - depth) * 6) };
      };

    case 'conveyor':
      return (i, ms) => {
        // From far up the lane toward the lens.
        const s = ((i / n + (ms / durationMs) * laps) % 1);
        const scale = lerp(0.18, 1.35, s * s);
        return { x: stage.cx, y: lerp(stage.cy - stage.h * 0.32, stage.cy + stage.h * 0.42, s), scale, turnX: lerp(45, 0, s), z: s, opacity: clamp01(s * 6) * clamp01((1 - s) * 5) };
      };

    case 'escalator':
      return (i, ms) => {
        const s = ((i / n + (ms / durationMs) * laps) % 1);
        return { x: lerp(stage.cx - stage.w * 0.42, stage.cx + stage.w * 0.42, s), y: lerp(stage.cy + stage.h * 0.38, stage.cy - stage.h * 0.38, s), scale: lerp(1.05, 0.6, s), z: -s, opacity: clamp01(s * 6) * clamp01((1 - s) * 6), rotation: -8 };
      };

    case 'sine':
      return (i, ms) => {
        const s = ((i / n + (ms / durationMs) * laps) % 1);
        const x = lerp(stage.cx - stage.w * 0.75, stage.cx + stage.w * 0.75, s);
        const phase = s * Math.PI * 2 * 1.5;
        return { x, y: stage.cy + Math.sin(phase) * stage.h * 0.18, rotation: Math.cos(phase) * 10, scale: 0.85, z: Math.sin(phase) };
      };

    case 'polaroid':
      return (i, ms) => {
        // Tilted prints drifting past at their own depth.
        const depth = hash(i, 11);
        const speed = lerp(0.6, 1.4, depth) * laps;
        const s = ((hash(i, 12) + (ms / durationMs) * speed) % 1);
        return { x: lerp(stage.cx - stage.w * 0.65, stage.cx + stage.w * 0.65, s), y: stage.cy + (hash(i, 13) - 0.5) * stage.h * 0.75, rotation: (hash(i, 14) - 0.5) * 24, scale: lerp(0.55, 1.05, depth), z: depth, opacity: lerp(0.65, 1, depth) };
      };

    case 'stackPush':
      return (i, ms) => {
        // A notification pile: each turn a new card slides in on top, the rest settle down a step.
        const b = beat(ms, durationMs, n, 0.4);
        const rank = (b.index - i + n) % n; // 0 is the newest
        const pushing = rank === 0;
        const settle = b.eased;
        const y = stage.cy + (rank - (pushing ? 0 : settle)) * card * 0.16 - card * 0.1;
        const x = pushing ? lerp(stage.cx + stage.w * 0.9, stage.cx, settle) : stage.cx;
        return { x, y, scale: 1 - Math.max(0, rank - settle) * 0.06, z: -rank, opacity: clamp01(5 - rank) };
      };

    case 'zipper':
      return (i, ms) => {
        // Two lanes running opposite ways, crossing in the middle.
        const lane = i % 2 === 0 ? -1 : 1;
        const k = Math.floor(i / 2);
        const count = Math.ceil(n / 2);
        const s = ((k / count + lane * (ms / durationMs) * laps) % 1 + 1) % 1;
        return { x: lerp(stage.cx - stage.w * 0.7, stage.cx + stage.w * 0.7, s), y: stage.cy + lane * card * 0.42, scale: 0.78, z: lane, rotation: lane * 3 };
      };

    case 'river':
      return (i, ms) => {
        const s = ((i / n + (ms / durationMs) * laps) % 1);
        const y = lerp(stage.cy - stage.h * 0.45, stage.cy + stage.h * 0.45, s);
        const x = stage.cx + Math.sin(s * Math.PI * 3) * stage.w * 0.3;
        return { x, y, scale: lerp(0.5, 1.05, s), z: s, opacity: clamp01(s * 6) * clamp01((1 - s) * 6), rotation: Math.cos(s * Math.PI * 3) * 8 };
      };
  }
}
