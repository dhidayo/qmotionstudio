import type { Layer } from '@/core/types';
import type { SceneInputs } from '@/document/types';
import type { BuildContext } from '../buildContext';
import { flag, num, pick, text, type SceneVariant } from '../catalog';
import type { SceneTemplate } from '../schema';
import { backgroundLayer } from '../_shared/chrome';
import { fillSlots } from '../_shared/photo';
import { cardCount, cardProps, clamp01, defineScene, depthGroup, easeInOut, glow, headlineAndStage, headlineSlot, isTall, lerp, sampled, type Pose, type Stage } from './kit';
import { hash } from '@/core/render/layers/kinetic';

/**
 * Depth Stage (D-119): photographs arranged in real depth — corridors to fly
 * through, helices, a dome, a rolling cylinder, a warp rush toward the lens.
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
    const pose = poseFor(shape, p, stage, n, durationMs, card);
    const cards = photos.map((photo, i): Layer => ({
      id: ctx.id('card'),
      type: 'image',
      startMs: 0,
      endMs: durationMs,
      tracks: sampled(0, durationMs, 80, (ms) => pose(i, ms), stage.w * 0.45),
      props: cardProps(photo, card, inputs, u),
    }));
    return [backgroundLayer(inputs, ctx), glow(ctx, { x: stage.cx, y: stage.cy }, Math.min(stage.w, stage.h) * 1.5, 0.2), depthGroup(ctx, 'depth', cards), head];
  };

  return defineScene(variant, { textSlots: [headline], build });
}

function poseFor(shape: Shape, p: SceneVariant['params'], stage: Stage, n: number, durationMs: number, card: number): (i: number, ms: number) => Pose {
  const laps = num(p, 'laps', 1);
  const progress = (i: number, ms: number): number => ((i / n + (ms / durationMs) * laps) % 1 + 1) % 1;
  const R = Math.min(stage.w, stage.h) * num(p, 'radius', 0.36);

  switch (shape) {
    case 'tunnel':
      return (i, ms) => {
        // Cards line the four walls of a corridor and come past the camera.
        const s = progress(i, ms);
        const wall = i % 4;
        const reach = s * s;
        const spreadX = stage.w * 0.55 * reach;
        const spreadY = stage.h * 0.5 * reach;
        const x = stage.cx + (wall === 0 ? -spreadX : wall === 1 ? spreadX : (hash(i, 3) - 0.5) * spreadX);
        const y = stage.cy + (wall === 2 ? -spreadY : wall === 3 ? spreadY : (hash(i, 4) - 0.5) * spreadY);
        return { x, y, scale: lerp(0.08, 1.6, reach), z: s, opacity: clamp01(s * 5) * clamp01((1 - s) * 7), turnY: wall === 0 ? 50 : wall === 1 ? -50 : 0, turnX: wall === 2 ? -50 : wall === 3 ? 50 : 0 };
      };

    case 'hall':
      return (i, ms) => {
        const s = progress(i, ms);
        const reach = s ** 2.4;
        const angle = (i / n) * TAU;
        return { x: stage.cx + Math.cos(angle) * stage.w * 0.32 * reach, y: stage.cy + Math.sin(angle) * stage.h * 0.25 * reach, scale: lerp(0.06, 1.9, reach), z: s, opacity: clamp01(s * 6) * clamp01((1 - s) * 5) };
      };

    case 'warp':
      return (i, ms) => {
        const s = ((hash(i, 8) + (ms / durationMs) * laps * 1.6) % 1);
        const reach = s ** 2;
        const angle = hash(i, 9) * TAU;
        return { x: stage.cx + Math.cos(angle) * stage.w * 0.75 * reach, y: stage.cy + Math.sin(angle) * stage.h * 0.65 * reach, scale: lerp(0.04, 1.4, reach), scaleX: lerp(0.04, 1.4, reach) * (1 + reach * 0.6), z: s, opacity: clamp01(s * 8) * clamp01((1 - s) * 8) };
      };

    case 'helix':
    case 'doubleHelix':
      return (i, ms) => {
        const strand = shape === 'doubleHelix' ? (i % 2) * Math.PI : 0;
        const s = progress(shape === 'doubleHelix' ? Math.floor(i / 2) * 2 : i, ms);
        const a = s * TAU * 1.5 + strand;
        const depth = Math.cos(a);
        return { x: stage.cx + Math.sin(a) * R, y: lerp(stage.cy + stage.h * 0.48, stage.cy - stage.h * 0.48, s), scale: lerp(0.5, 1.05, (depth + 1) / 2), turnY: -Math.sin(a) * 55, z: depth, opacity: clamp01(s * 7) * clamp01((1 - s) * 7) * lerp(0.5, 1, (depth + 1) / 2) };
      };

    case 'cylinder':
      return (i, ms) => {
        const a = (i / n) * TAU - (ms / durationMs) * TAU * laps;
        const depth = Math.cos(a);
        return { x: stage.cx, y: stage.cy + Math.sin(a) * R * 1.1, scaleX: lerp(0.8, 1.15, (depth + 1) / 2), scaleY: lerp(0.8, 1.15, (depth + 1) / 2), turnX: Math.sin(a) * 70, z: depth, opacity: lerp(0.3, 1, (depth + 1) / 2) };
      };

    case 'wave':
      return (i, ms) => {
        const s = ((i / n + (ms / durationMs) * laps) % 1);
        const x = lerp(stage.cx - stage.w * 0.7, stage.cx + stage.w * 0.7, s);
        const phase = s * TAU * 1.2 + (ms / durationMs) * TAU;
        const depth = Math.cos(phase);
        return { x, y: stage.cy + Math.sin(phase) * stage.h * 0.16, scale: lerp(0.6, 1, (depth + 1) / 2), turnX: Math.sin(phase) * 30, z: depth };
      };

    case 'dome':
      return (i, ms) => {
        // Cards on a sphere, in bands of latitude, the sphere turning about its axis.
        const bands = 3;
        const perBand = Math.ceil(n / bands);
        const band = Math.floor(i / perBand);
        const k = i % perBand;
        const lat = ((band - (bands - 1) / 2) / bands) * 1.6;
        const lon = (k / perBand) * TAU + (band % 2) * (Math.PI / perBand) + (ms / durationMs) * TAU * laps * 0.5;
        const depth = Math.cos(lon) * Math.cos(lat);
        return { x: stage.cx + Math.sin(lon) * Math.cos(lat) * R * 1.2, y: stage.cy + Math.sin(lat) * R * 1.2, scale: lerp(0.35, 0.9, (depth + 1) / 2), turnY: -(lon % TAU > Math.PI ? lon % TAU - TAU : lon % TAU) * (180 / Math.PI) * 0.9, turnX: (lat * 180) / Math.PI * 0.7, z: depth, opacity: lerp(0.25, 1, (depth + 1) / 2) };
      };

    case 'floating':
      return (i, ms) => {
        // A loose stack drifting in parallax: near cards move more than far ones.
        const depth = hash(i, 21);
        const drift = Math.sin(ms / 1400 + i * 1.7) * (0.3 + depth);
        return { x: stage.cx + (hash(i, 22) - 0.5) * stage.w * 0.7 + drift * card * 0.2, y: stage.cy + (hash(i, 23) - 0.5) * stage.h * 0.6 + Math.cos(ms / 1700 + i) * card * 0.15 * (0.3 + depth), rotation: (hash(i, 24) - 0.5) * 16, scale: lerp(0.55, 1.15, depth), z: depth, opacity: lerp(0.6, 1, depth) };
      };

    case 'carousel':
      return (i, ms) => {
        const a = (i / n) * TAU - (ms / durationMs) * TAU * laps;
        const depth = Math.cos(a);
        const front = Math.max(0, depth) ** 6;
        return { x: stage.cx + Math.sin(a) * R * 1.2, y: stage.cy + depth * R * 0.25, scale: lerp(0.5, 1, (depth + 1) / 2) + front * 0.35, turnY: -Math.sin(a) * 60, z: depth, opacity: lerp(0.4, 1, (depth + 1) / 2) };
      };

    case 'fan':
      return (i, ms) => {
        // Cards fan out from a vanishing point toward the camera, then fold back.
        const open = easeInOut(Math.min(1, ms / (durationMs * 0.3))) * (1 - easeInOut(Math.max(0, (ms - durationMs * 0.78) / (durationMs * 0.22))));
        const off = i - (n - 1) / 2;
        const depth = 1 - Math.abs(off) / n;
        return { x: stage.cx + off * card * 0.42 * open, y: stage.cy - stage.h * 0.15 * (1 - open) + Math.abs(off) * card * 0.08 * open, rotation: off * 7 * open, scale: lerp(0.3, lerp(0.7, 1.05, depth), open), z: depth, turnY: -off * 8 * open };
      };

    case 'accordion':
      return (i, ms) => {
        // Panels side by side, folding alternately open and shut.
        const fold = (Math.sin((ms / durationMs) * TAU * laps * 2) + 1) / 2;
        const turn = (i % 2 === 0 ? 1 : -1) * fold * 62;
        const width = card * lerp(0.92, 0.45, fold);
        return { x: stage.cx + (i - (n - 1) / 2) * width, y: stage.cy, turnY: turn, scale: 0.9, z: i % 2 === 0 ? 1 : 0 };
      };
  }
}
