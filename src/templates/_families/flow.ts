import type { Layer } from '@/core/types';
import type { SceneInputs } from '@/document/types';
import type { BuildContext } from '../buildContext';
import { flag, num, pick, text, type SceneVariant } from '../catalog';
import type { SceneTemplate } from '../schema';
import { backgroundLayer } from '../_shared/chrome';
import { fillSlots } from '../_shared/photo';
import { beat, cardCount, cardProps, clamp01, defineScene, depthGroup, FOCUS, focusCurve, glow, headlineAndStage, headlineSlot, isTall, lerp, linger, sampled, wrapSteps, type Pose, type Stage } from './kit';
import { focusIn, frac, lingerAt, type Box } from './emphasis';
import { hash } from '@/core/render/layers/kinetic';

/**
 * Flow Track (D-119): photographs moving along a lane — the coverflow every
 * phone made familiar, carousels, shelves, conveyors, escalators, and rows
 * that drift past at their own depth.
 *
 * One photo is in focus at every moment (D-157): each lane has a focus point
 * — the middle of a coverflow, the centre of the frame for a drifting row —
 * and the photo passing it grows, faces you and comes forward while the rest
 * step back and darken. The lane lingers there, then flows on.
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
    const props = photos.map((photo) => cardProps(photo, card, inputs, u));
    const boxes: Box[] = props.map((prop) => ({ w: prop.w, h: prop.h }));
    const pose = poseFor(shape, p, stage, n, durationMs, card, tall, boxes);
    const cards = props.map((prop, i): Layer => ({
      id: ctx.id('card'),
      type: 'image',
      startMs: 0,
      endMs: durationMs,
      tracks: sampled(0, durationMs, 80, (ms) => pose(i, ms), stage.w * 0.45),
      props: prop,
    }));
    return [backgroundLayer(inputs, ctx), glow(ctx, { x: stage.cx, y: stage.cy }, Math.min(stage.w, stage.h) * 1.3, 0.16), depthGroup(ctx, 'flow', cards), head];
  };

  return defineScene(variant, { textSlots: [headline], build });
}

function poseFor(shape: Shape, p: SceneVariant['params'], stage: Stage, n: number, durationMs: number, card: number, tall: boolean, boxes: readonly Box[]): (i: number, ms: number) => Pose {
  const snap = flag(p, 'snap');
  const laps = num(p, 'laps', 1);
  const box = (i: number): Box => boxes[i] ?? boxes[0] ?? { w: card, h: card };
  /** How far the lane has run, in card steps: lingering at each photo, or a beat that settles on it. */
  const travelled = (ms: number): number => {
    if (snap) {
      const b = beat(ms, durationMs, n, 0.3);
      return b.index + b.eased;
    }
    return linger((ms / durationMs) * n * laps);
  };
  const tilt = num(p, 'tilt', 62);
  const gap = card * num(p, 'gap', 0.55);

  /**
   * A lane that loops: card `i` is `s` of the way along it (0 to 1), and the
   * photo in focus is the one at `at` along it. The run lingers there.
   */
  const lane = (at: number, wanted: number, place: (i: number, s: number) => Pose, straighten = 0) => (i: number, ms: number): Pose => {
    const run = lingerAt((ms / durationMs) * n * laps, -at * n);
    const s = frac((i + run) / n);
    return focusIn(place(i, s), focusCurve(wrapSteps(i + run - at * n, n)), stage, box(i), wanted, { straighten });
  };

  switch (shape) {
    case 'coverflow':
    case 'vertical':
    case 'diagonal':
    case 'centerLock':
      return (i, ms) => {
        const off = wrapSteps(i - travelled(ms), n);
        const a = Math.abs(off);
        const side = Math.sign(off);
        const near = Math.min(a, 1);
        // Set a little wider than the plain row, so the neighbours still show
        // beside the photo in focus as it grows.
        const along = side * (near * card * 0.78 + Math.max(0, a - 1) * gap);
        // Gone before it reaches the far end, where it wraps round to the other side.
        const fade = clamp01(Math.min(3.2 - a, (n / 2 - a) * 2.5));
        const f = focusCurve(off);
        if (shape === 'centerLock') {
          return focusIn({ x: stage.cx + off * card * 0.82, y: stage.cy, scale: lerp(1.12, 0.78, near), opacity: fade, z: -a }, f, stage, box(i), 1.3);
        }
        const turn = -Math.max(-1, Math.min(1, off)) * tilt;
        const scale = 1 - near * 0.2;
        if (shape === 'vertical') return focusIn({ x: stage.cx, y: stage.cy + along * (tall ? 1 : 0.8), turnX: turn, scale, opacity: fade, z: -a }, f, stage, box(i));
        if (shape === 'diagonal') return focusIn({ x: stage.cx + along * 0.8, y: stage.cy + along * 0.55, turnY: turn * 0.7, scale, opacity: fade, z: -a }, f, stage, box(i));
        return focusIn({ x: stage.cx + along, y: stage.cy, turnY: turn, scale, opacity: fade, z: -a }, f, stage, box(i));
      };

    case 'shelf':
      // A row receding to the right: perspective by scale, scrolling away.
      // The focus is the middle of the frame, where the row turns to face you.
      return lane(0.25, FOCUS.peak, (_, s) => ({
        x: lerp(stage.cx - stage.w * 0.42, stage.cx + stage.w * 0.45, Math.sqrt(s)),
        y: stage.cy - s * stage.h * 0.12,
        scale: lerp(1.05, 0.32, s),
        turnY: -28,
        z: -s,
        opacity: clamp01(s * 8) * clamp01((1 - s) * 6),
      }));

    case 'conveyor':
      // From far up the lane toward the lens; in focus just before it passes.
      return lane(0.7, 1.15, (_, s) => ({
        x: stage.cx,
        y: lerp(stage.cy - stage.h * 0.32, stage.cy + stage.h * 0.42, s),
        scale: lerp(0.18, 1.35, s * s),
        turnX: lerp(45, 0, s),
        z: s,
        opacity: clamp01(s * 6) * clamp01((1 - s) * 5),
      }));

    case 'escalator':
      return lane(0.5, FOCUS.peak, (_, s) => ({
        x: lerp(stage.cx - stage.w * 0.42, stage.cx + stage.w * 0.42, s),
        y: lerp(stage.cy + stage.h * 0.38, stage.cy - stage.h * 0.38, s),
        scale: lerp(1.05, 0.6, s),
        z: -s,
        opacity: clamp01(s * 6) * clamp01((1 - s) * 6),
        rotation: -8,
      }), 1);

    case 'sine':
      return lane(0.5, FOCUS.peak, (_, s) => {
        const phase = s * Math.PI * 2 * 1.5;
        return { x: lerp(stage.cx - stage.w * 0.75, stage.cx + stage.w * 0.75, s), y: stage.cy + Math.sin(phase) * stage.h * 0.18, rotation: Math.cos(phase) * 10, scale: 0.85, z: Math.sin(phase) };
      }, 1);

    case 'polaroid':
      // Tilted prints drifting past at their own depths, evenly spaced so one
      // reaches the middle at a time: there it rises to the centre, turns
      // upright and grows, then drifts on and settles back to its own depth.
      return lane(0.5, 1.4, (i, s) => {
        const depth = hash(i, 11);
        const f = focusCurve(wrapSteps(s * n - n / 2, n));
        const drift = (depth - 0.5) * stage.w * 0.05 * Math.sin(s * Math.PI * 4 + i) * (1 - f);
        const y = stage.cy + (hash(i, 13) - 0.5) * stage.h * 0.75;
        return {
          x: lerp(stage.cx - stage.w * 0.65, stage.cx + stage.w * 0.65, s) + drift,
          y: lerp(y, stage.cy, f),
          rotation: (hash(i, 14) - 0.5) * 24,
          scale: lerp(0.55, 1.05, depth),
          z: depth,
          opacity: lerp(0.65, 1, depth) * clamp01(s * 10) * clamp01((1 - s) * 10),
        };
      }, 0.75);

    case 'stackPush':
      return (i, ms) => {
        // A notification pile: each turn a new card slides in on top, the rest
        // settle down a step. The newest covers the rest, which darken as they sink.
        const b = beat(ms, durationMs, n, 0.4);
        const rank = (b.index - i + n) % n; // 0 is the newest
        const settle = b.eased;
        const depth = rank === 0 ? 0 : rank - 1 + settle;
        const y = stage.cy + depth * card * 0.16 - card * 0.1;
        const x = rank === 0 ? lerp(stage.cx + stage.w * 0.9, stage.cx, settle) : stage.cx;
        return { x, y, scale: 1 - depth * 0.06, z: -rank, opacity: clamp01(5 - depth), shade: Math.min(0.5, depth * 0.12) };
      };

    case 'zipper': {
      // Two lanes running opposite ways, crossing in the middle, half a card
      // apart so they take turns bringing a photo to the centre.
      const count = Math.ceil(n / 2);
      return (i, ms) => {
        const dir = i % 2 === 0 ? -1 : 1;
        const k = Math.floor(i / 2);
        const run = linger(((ms / durationMs) * laps * count + count / 2) * 2) / 2 - count / 2;
        const pos = dir < 0 ? k - run : k + 0.5 + run;
        const s = frac(pos / count);
        const f = focusCurve(wrapSteps(pos - count / 2, count), FOCUS.reach / 2);
        return focusIn({ x: lerp(stage.cx - stage.w * 0.7, stage.cx + stage.w * 0.7, s), y: stage.cy + dir * card * 0.42, scale: 0.78, z: dir, rotation: dir * 3 }, f, stage, box(i), 1.3, { straighten: 1 });
      };
    }

    case 'river':
      // Down a meandering river toward you; in focus as it crosses the middle.
      return lane(2 / 3, 1.3, (_, s) => ({
        x: stage.cx + Math.sin(s * Math.PI * 3) * stage.w * 0.3,
        y: lerp(stage.cy - stage.h * 0.45, stage.cy + stage.h * 0.45, s),
        scale: lerp(0.5, 1.05, s),
        z: s,
        opacity: clamp01(s * 6) * clamp01((1 - s) * 6),
        rotation: Math.cos(s * Math.PI * 3) * 8,
      }), 1);
  }
}
