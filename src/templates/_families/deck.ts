import type { Layer } from '@/core/types';
import type { SceneInputs } from '@/document/types';
import type { BuildContext } from '../buildContext';
import { flag, num, pick, text, type SceneVariant } from '../catalog';
import type { SceneTemplate } from '../schema';
import { backgroundLayer } from '../_shared/chrome';
import { fillSlots } from '../_shared/photo';
import { cardCount, cardProps, clamp01, defineScene, depthGroup, easeInOut, easeOut, easeOutBack, glow, headlineAndStage, headlineSlot, isTall, lerp, sampled, type Pose, type Stage } from './kit';
import { hash } from '@/core/render/layers/kinetic';

/**
 * Deck Motion (D-119): photographs handled like a deck of cards — dealt,
 * fanned, shuffled, tossed, sprung out, stacked into a tower and knocked
 * down. Each loops: the deck ends where it began.
 */

type Shape =
  | 'cascade' | 'spring' | 'deal' | 'magician' | 'burst' | 'shuffle' | 'bounce'
  | 'storyPile' | 'scrapbook' | 'toss' | 'swap' | 'tower';

const SHAPES: readonly Shape[] = ['cascade', 'spring', 'deal', 'magician', 'burst', 'shuffle', 'bounce', 'storyPile', 'scrapbook', 'toss', 'swap', 'tower'];

export function create(variant: SceneVariant): SceneTemplate {
  const p = variant.params;
  const shape = pick<Shape>(p, 'shape', SHAPES, 'cascade');
  const headline = headlineSlot(text(p, 'headline', 'Pick a card'), {}, 50);

  const build = (inputs: SceneInputs, ctx: BuildContext): Layer[] => {
    const { durationMs, design } = ctx;
    const n = cardCount(inputs, variant);
    const photos = fillSlots(inputs.photos, n);
    const { headline: head, stage } = headlineAndStage(ctx, inputs, headline, { bottom: flag(p, 'textBelow') });
    const u = Math.min(design.w, design.h);
    const card = Math.min(stage.w, stage.h) * num(p, 'card', 0.36) * (isTall(stage) ? 1.2 : 1);
    const pose = poseFor(shape, stage, n, durationMs, card);
    const cards = photos.map((photo, i): Layer => ({
      id: ctx.id('card'),
      type: 'image',
      startMs: 0,
      endMs: durationMs,
      tracks: sampled(0, durationMs, 60, (ms) => pose(i, ms), stage.w * 0.6),
      props: cardProps(photo, card, inputs, u),
    }));
    return [backgroundLayer(inputs, ctx), glow(ctx, { x: stage.cx, y: stage.cy }, Math.min(stage.w, stage.h) * 1.3, 0.16), depthGroup(ctx, 'deck', cards), head];
  };

  return defineScene(variant, { textSlots: [headline], build });
}

/** The deck: a neat pile at the centre, the top card last. */
function piled(stage: Stage, i: number, n: number): Pose {
  return { x: stage.cx + (i - (n - 1) / 2) * 2, y: stage.cy - (i - (n - 1) / 2) * 3, rotation: (hash(i, 31) - 0.5) * 6, z: i };
}

/** Out of the pile, hold, back into it: 0 → 1 → 0 across the loop. */
function openness(ms: number, durationMs: number, openShare = 0.22, closeAt = 0.8): number {
  return easeInOut(ms / (durationMs * openShare)) * (1 - easeInOut((ms - durationMs * closeAt) / (durationMs * (1 - closeAt))));
}

function mix(a: Pose, b: Pose, u: number): Pose {
  return {
    x: lerp(a.x, b.x, u),
    y: lerp(a.y, b.y, u),
    rotation: lerp(a.rotation ?? 0, b.rotation ?? 0, u),
    scale: lerp(a.scale ?? 1, b.scale ?? 1, u),
    opacity: lerp(a.opacity ?? 1, b.opacity ?? 1, u),
    z: lerp(a.z ?? 0, b.z ?? 0, u),
    turnY: lerp(a.turnY ?? 0, b.turnY ?? 0, u),
  };
}

function poseFor(shape: Shape, stage: Stage, n: number, durationMs: number, card: number): (i: number, ms: number) => Pose {
  const mid = (n - 1) / 2;
  switch (shape) {
    case 'cascade':
      return (i, ms) => {
        // The deck cascades down-right into a fanned staircase.
        const open = easeOut(clamp01((ms - i * 140) / 700)) * (1 - easeInOut((ms - durationMs * 0.82) / (durationMs * 0.18)));
        // Spaced to fit the stage, however many cards and however narrow it is.
        const step = Math.min(card * 0.34, (stage.w - card * 0.9) / Math.max(1, n - 1));
        const spread: Pose = { x: stage.cx + (i - mid) * step, y: stage.cy + (i - mid) * card * 0.16, rotation: (i - mid) * 4, z: i };
        return mix(piled(stage, i, n), spread, open);
      };
    case 'spring':
      return (i, ms) => {
        // One by one, cards spring out of the deck into a row with overshoot.
        const cols = Math.min(n, isWide(stage) ? n : 3);
        const row = Math.floor(i / cols);
        const rows = Math.ceil(n / cols);
        const spot: Pose = { x: stage.cx + ((i % cols) - (Math.min(cols, n - row * cols) - 1) / 2) * card * 0.95, y: stage.cy + (row - (rows - 1) / 2) * card * 1.25, z: i };
        const out = easeOutBack((ms - 300 - i * 260) / 600);
        const back = easeInOut((ms - durationMs * 0.82) / (durationMs * 0.15));
        return mix(piled(stage, i, n), spot, Math.max(0, out) * (1 - back));
      };
    case 'deal':
      return (i, ms) => {
        const a = ((i - mid) / Math.max(1, mid)) * 0.9;
        const arc: Pose = { x: stage.cx + Math.sin(a) * stage.w * 0.4, y: stage.cy + (1 - Math.cos(a)) * stage.h * 0.3 - card * 0.1, rotation: (a * 180) / Math.PI * 0.6, z: i };
        const dealt = easeOut((ms - 250 - i * 220) / 500);
        const gather = easeInOut((ms - durationMs * 0.8) / (durationMs * 0.18));
        return mix(piled(stage, i, n), arc, clamp01(dealt) * (1 - gather));
      };
    case 'magician':
      return (i, ms) => {
        // The fan opens from one corner, every card turns over and back, then it closes.
        const open = openness(ms, durationMs, 0.25, 0.78);
        const flip = Math.sin(clamp01((ms - durationMs * 0.35 - i * 70) / (durationMs * 0.3)) * Math.PI) * 180;
        const pivot = { x: stage.cx, y: stage.cy + card * 0.6 };
        const a = ((i - mid) / Math.max(1, mid)) * 55 * open;
        const r = card * 0.55;
        const rad = (a * Math.PI) / 180;
        return { x: pivot.x + Math.sin(rad) * r, y: pivot.y - Math.cos(rad) * r, rotation: a, turnY: flip, z: i };
      };
    case 'burst':
      return (i, ms) => {
        const out = openness(ms, durationMs, 0.2, 0.75);
        const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
        const spot: Pose = { x: stage.cx + Math.cos(angle) * stage.w * 0.34, y: stage.cy + Math.sin(angle) * stage.h * 0.32, rotation: (angle * 180) / Math.PI / 6, scale: 0.8, z: i };
        return mix(piled(stage, i, n), spot, out);
      };
    case 'shuffle':
      return (i, ms) => {
        // Explode into a riffle, then snap back into a neat stack in a new order.
        const burst = Math.sin(clamp01((ms - durationMs * 0.15) / (durationMs * 0.5)) * Math.PI);
        const scatter: Pose = { x: stage.cx + (hash(i, 41) - 0.5) * stage.w * 0.7, y: stage.cy + (hash(i, 42) - 0.5) * stage.h * 0.6, rotation: (hash(i, 43) - 0.5) * 50, z: hash(i, 44) * n };
        return mix(piled(stage, i, n), scatter, easeInOut(burst));
      };
    case 'bounce':
      return (i, ms) => {
        // Cards drop from above with a soft bounce into a grid, then lift away.
        const cols = Math.min(n, isWide(stage) ? 4 : 2);
        const rows = Math.ceil(n / cols);
        const x = stage.cx + ((i % cols) - (Math.min(cols, n - Math.floor(i / cols) * cols) - 1) / 2) * card * 0.95;
        const y = stage.cy + (Math.floor(i / cols) - (rows - 1) / 2) * card * 1.2;
        const t = clamp01((ms - 200 - i * 180) / 900);
        const bounce = t < 1 ? 1 - Math.abs(Math.cos(t * Math.PI * 2.5)) * (1 - t) ** 2 : 1;
        const leave = easeInOut((ms - durationMs * 0.85) / (durationMs * 0.13));
        return { x, y: lerp(stage.cy - stage.h, y, bounce) - leave * stage.h * 1.2, opacity: t > 0 ? 1 : 0, z: i };
      };
    case 'storyPile':
      return (i, ms) => {
        // The top card lifts away each beat; the next rises to take its place.
        const turn = durationMs / n;
        const beatIndex = Math.floor(ms / turn);
        const local = (ms % turn) / turn;
        const rank = (i - beatIndex % n + n) % n;
        const lift = rank === 0 ? easeInOut((local - 0.6) / 0.4) : 0;
        const settle = easeInOut((local - 0.6) / 0.4);
        const depth = rank - (rank > 0 ? settle : 0);
        return { x: stage.cx, y: stage.cy + depth * card * 0.06 - lift * stage.h * 0.55, scale: 1 - depth * 0.05, rotation: lift * -8, opacity: (1 - lift) * clamp01(4 - depth), z: -rank };
      };
    case 'scrapbook':
      return (i, ms) => {
        const cols = isWide(stage) ? 4 : 2;
        const x = stage.cx + ((i % cols) - (cols - 1) / 2) * card * 0.8 + (hash(i, 51) - 0.5) * card * 0.3;
        const y = stage.cy + (Math.floor(i / cols) - (Math.ceil(n / cols) - 1) / 2) * card * 0.9 + (hash(i, 52) - 0.5) * card * 0.2;
        const breathe = Math.sin(ms / 1500 + i) * 0.03;
        return { x, y, rotation: (hash(i, 53) - 0.5) * 22 + Math.sin(ms / 1900 + i) * 2, scale: 0.92 + breathe, opacity: clamp01((ms - i * 150) / 400), z: hash(i, 54) };
      };
    case 'toss':
      return (i, ms) => {
        // Cards tossed in from alternate sides, spinning, landing on the pile.
        const side = i % 2 === 0 ? -1 : 1;
        const t = easeOut((ms - 200 - i * 350) / 700);
        const leave = easeInOut((ms - durationMs * 0.85) / (durationMs * 0.13));
        const rest: Pose = { x: stage.cx + (hash(i, 61) - 0.5) * card * 0.4, y: stage.cy + (hash(i, 62) - 0.5) * card * 0.3, rotation: (hash(i, 63) - 0.5) * 30, z: i };
        const from: Pose = { x: stage.cx + side * stage.w, y: stage.cy - stage.h * 0.3, rotation: side * 220, z: i };
        const landed = mix(from, rest, clamp01(t));
        return { ...landed, opacity: (t > 0 ? 1 : 0) * (1 - leave), scale: 1 - leave * 0.3 };
      };
    case 'swap':
      return (i, ms) => {
        // A row of cards that swap places in pairs each beat, arching past each other.
        const beats = 4;
        const turn = durationMs / beats;
        const b = Math.floor(ms / turn);
        const local = easeInOut(((ms % turn) / turn - 0.2) / 0.5);
        // Beat m swaps neighbours (0,1),(2,3)… when m is even, (1,2),(3,4)… when odd.
        const slotOf = (k: number, beatNo: number): number => {
          const order = Array.from({ length: n }, (_, c) => c);
          for (let m = 0; m < beatNo; m++) {
            for (let s = m % 2; s + 1 < n; s += 2) {
              const left = order[s] ?? s;
              order[s] = order[s + 1] ?? s + 1;
              order[s + 1] = left;
            }
          }
          return order.indexOf(k);
        };
        const from = slotOf(i, b);
        const to = slotOf(i, b + 1);
        const pos = (slot: number): number => stage.cx + (slot - mid) * card * 0.85;
        const arch = Math.sin(local * Math.PI) * card * 0.35 * Math.sign(to - from);
        return { x: lerp(pos(from), pos(to), local), y: stage.cy + arch, scale: isWide(stage) ? 0.9 : 0.75, z: to > from ? 1 : 0 };
      };
    case 'tower':
      return (i, ms) => {
        // A stack built up from the ground, a topple, and a rebuild.
        const ground = stage.cy + stage.h * 0.42;
        const height = card * 0.42;
        const built: Pose = { x: stage.cx, y: ground - i * height, rotation: (hash(i, 71) - 0.5) * 4, z: i };
        const fallen: Pose = { x: stage.cx + (i - mid) * card * 0.5 + (hash(i, 72) - 0.5) * card * 0.3, y: ground - card * 0.1, rotation: (hash(i, 73) - 0.5) * 160, z: i };
        const fall = easeOut((ms - durationMs * 0.45 - (n - i) * 40) / 500);
        const rebuild = easeOutBack((ms - durationMs * 0.75 - i * 90) / 450);
        const rise = easeOutBack((ms - i * 140) / 500);
        const start: Pose = { ...built, y: built.y - stage.h, opacity: 0 };
        if (ms < durationMs * 0.45) return mix(start, built, clamp01(rise));
        if (ms < durationMs * 0.75) return mix(built, fallen, clamp01(fall));
        return mix(fallen, built, clamp01(rebuild));
      };
  }
}

function isWide(stage: Stage): boolean {
  return stage.w > stage.h * 1.1;
}
