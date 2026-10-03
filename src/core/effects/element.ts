import type { Ctx2D } from '@/core/types';
import { withAlpha } from '@/core/render/paint';
import { DIRECTIONS, choice, color, fromSide } from './params';
import { noise, rand, smoothstep } from './random';
import { sparklePath } from './frame/atmosphere';
import type { ElementEffectDef, ElementOffset, ElementSample } from './types';

/**
 * Element effects: how one thing arrives, leaves, or draws the eye (D-100).
 *
 * Each adds to what the element was already doing. A template photo that
 * zooms in on its own still zooms in with "Spin in" added — now spinning as it
 * comes. That is deliberate: these sit on top of a design, they do not replace
 * it, so the design never breaks because someone added an effect to it.
 *
 * Distances are in the element's own units (its width and height), so a
 * "rise" is the same gesture on a thumbnail and on a full-bleed photo.
 */

const TAU = Math.PI * 2;
const outCubic = (p: number): number => 1 - (1 - p) ** 3;
const inCubic = (p: number): number => p * p * p;
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Bounces to rest, like something dropped onto a table. */
function bounceOut(p: number): number {
  const n = 7.5625;
  const d = 2.75;
  if (p < 1 / d) return n * p * p;
  if (p < 2 / d) { const q = p - 1.5 / d; return n * q * q + 0.75; }
  if (p < 2.5 / d) { const q = p - 2.25 / d; return n * q * q + 0.9375; }
  const q = p - 2.625 / d;
  return n * q * q + 0.984375;
}

/** Overshoots and settles — the motion that makes something feel alive. */
const springOut = (p: number): number => (p >= 1 ? 1 : 1 - Math.exp(-6 * p) * Math.cos(10 * p));

const reach = (s: ElementSample): number => Math.max(s.size.w, s.size.h, 40);

const entrance = (def: Omit<ElementEffectDef, 'category' | 'phase' | 'phases' | 'hold'>): ElementEffectDef => ({
  ...def, category: 'Entrance', phase: 'enter', phases: ['enter'], hold: 'before',
});

const exit = (def: Omit<ElementEffectDef, 'category' | 'phase' | 'phases' | 'hold'>): ElementEffectDef => ({
  ...def, category: 'Exit', phase: 'exit', phases: ['exit'], hold: 'after',
});

const emphasis = (def: Omit<ElementEffectDef, 'category' | 'phase' | 'phases'>): ElementEffectDef => ({
  ...def, category: 'Emphasis', phase: 'during', phases: ['during', 'enter', 'exit'],
});

const light = (def: Omit<ElementEffectDef, 'category' | 'phases'>): ElementEffectDef => ({
  ...def, category: 'Light', phases: ['during', 'enter', 'exit'],
});

/**
 * How visible an element is at this point of its effect, 0–1, scaled by the
 * effect's intensity — so an effect at 0% does nothing at all, fade included.
 */
const fade = (o: ElementOffset, s: ElementSample, visible: number): void => {
  o.opacity *= 1 - s.intensity * (1 - clamp01(visible));
};

// ── Entrances ───────────────────────────────────────────────────────────────

const ENTRANCES: readonly ElementEffectDef[] = [
  entrance({
    id: 'fade-in', name: 'Fade in', blurb: 'Quietly appears.',
    defaultMs: 600, defaultIntensity: 1, params: [],
    motion(s, o) { fade(o, s, outCubic(s.p)); },
  }),
  entrance({
    id: 'zoom-in', name: 'Zoom in', blurb: 'Grows from small to full size.',
    defaultMs: 650, defaultIntensity: 0.8, params: [],
    motion(s, o) {
      const k = 1 - 0.7 * s.intensity * (1 - outCubic(s.p));
      o.scaleX *= k; o.scaleY *= k;
      fade(o, s, s.p * 2.5);
    },
  }),
  entrance({
    id: 'pop-in', name: 'Pop in', blurb: 'Springs into place with a little bounce.',
    defaultMs: 700, defaultIntensity: 0.9, params: [],
    motion(s, o) {
      const k = 1 - 0.75 * s.intensity * (1 - springOut(s.p));
      o.scaleX *= k; o.scaleY *= k;
      fade(o, s, s.p * 4);
    },
  }),
  entrance({
    id: 'rise-in', name: 'Rise', blurb: 'Floats up into place.',
    defaultMs: 700, defaultIntensity: 0.7, params: [],
    motion(s, o) {
      o.y += (1 - outCubic(s.p)) * s.size.h * 0.4 * s.intensity;
      fade(o, s, outCubic(s.p) * 1.4);
    },
  }),
  entrance({
    id: 'drop-in', name: 'Drop & bounce', blurb: 'Falls from above and bounces to rest.',
    defaultMs: 900, defaultIntensity: 0.8, params: [],
    motion(s, o) {
      o.y -= (1 - bounceOut(s.p)) * Math.max(s.size.h, 60) * 1.1 * s.intensity;
      fade(o, s, s.p * 6);
    },
  }),
  entrance({
    id: 'slide-in', name: 'Slide in', blurb: 'Glides in from a side.',
    defaultMs: 650, defaultIntensity: 0.8, params: [choice('from', 'From', DIRECTIONS)],
    motion(s, o) {
      const dir = fromSide(s.params.str('from'));
      const d = (1 - outCubic(s.p)) * reach(s) * 0.9 * s.intensity;
      o.x += dir.x * d; o.y += dir.y * d;
      fade(o, s, s.p * 3);
    },
  }),
  entrance({
    id: 'spin-in', name: 'Spin in', blurb: 'Twirls in as it grows.',
    defaultMs: 800, defaultIntensity: 0.8, params: [],
    motion(s, o) {
      const rest = 1 - outCubic(s.p);
      o.rotation -= rest * 200 * s.intensity;
      const k = 1 - 0.6 * s.intensity * rest;
      o.scaleX *= k; o.scaleY *= k;
      fade(o, s, s.p * 3);
    },
  }),
  entrance({
    id: 'flip-in', name: 'Flip in', blurb: 'Turns over like a card.',
    defaultMs: 700, defaultIntensity: 1, params: [],
    motion(s, o) {
      o.scaleX *= Math.max(0.001, 1 - s.intensity * (1 - outCubic(s.p)));
      fade(o, s, s.p * 3);
    },
  }),
  entrance({
    id: 'blur-in', name: 'Focus in', blurb: 'Sharpens out of a blur.',
    defaultMs: 800, defaultIntensity: 0.8, params: [],
    motion(s, o) {
      o.blur += (1 - outCubic(s.p)) * Math.min(s.size.w, s.size.h, 400) * 0.1 * s.intensity;
      fade(o, s, s.p * 2);
    },
  }),
  entrance({
    id: 'stretch-in', name: 'Stretch in', blurb: 'Springs up from flat, rubbery and fun.',
    defaultMs: 800, defaultIntensity: 0.8, params: [],
    motion(s, o) {
      const k = springOut(s.p);
      o.scaleY *= Math.max(0.001, 1 - s.intensity * (1 - k));
      o.scaleX *= 1 + 0.35 * s.intensity * (1 - k);
      fade(o, s, s.p * 4);
    },
  }),
  entrance({
    id: 'swing-in', name: 'Swing in', blurb: 'Swings into place like a hanging sign.',
    defaultMs: 1_000, defaultIntensity: 0.8, params: [],
    motion(s, o) {
      o.rotation += -30 * s.intensity * Math.exp(-4 * s.p) * Math.cos(9 * s.p) * (1 - s.p);
      fade(o, s, s.p * 4);
    },
  }),
  entrance({
    id: 'glitch-in', name: 'Glitch in', blurb: 'Stutters into existence.',
    defaultMs: 600, defaultIntensity: 0.8, params: [],
    motion(s, o) {
      const k = Math.floor(s.t / 45);
      const chaos = (1 - s.p) * s.intensity;
      o.x += (rand(s.seed, k, 1) - 0.5) * s.size.w * 0.25 * chaos;
      o.opacity *= rand(s.seed, k, 2) < chaos * 0.6 ? 0.15 : 1;
      o.scaleX *= 1 + (rand(s.seed, k, 3) - 0.5) * 0.3 * chaos;
    },
  }),
];

// ── Exits ───────────────────────────────────────────────────────────────────

const EXITS: readonly ElementEffectDef[] = [
  exit({
    id: 'fade-out', name: 'Fade out', blurb: 'Quietly disappears.',
    defaultMs: 600, defaultIntensity: 1, params: [],
    motion(s, o) { fade(o, s, 1 - inCubic(s.p)); },
  }),
  exit({
    id: 'zoom-away', name: 'Zoom away', blurb: 'Shrinks into the distance.',
    defaultMs: 650, defaultIntensity: 0.8, params: [],
    motion(s, o) {
      const k = 1 - 0.8 * s.intensity * inCubic(s.p);
      o.scaleX *= k; o.scaleY *= k;
      fade(o, s, 1 - smoothstep(0.5, 1, s.p));
    },
  }),
  exit({
    id: 'zoom-through', name: 'Zoom through', blurb: 'Rushes towards you and dissolves.',
    defaultMs: 650, defaultIntensity: 0.8, params: [],
    motion(s, o) {
      const k = 1 + 0.9 * s.intensity * inCubic(s.p);
      o.scaleX *= k; o.scaleY *= k;
      o.blur += s.p * s.p * Math.min(s.size.w, s.size.h, 400) * 0.06 * s.intensity;
      fade(o, s, 1 - s.p ** 1.5);
    },
  }),
  exit({
    id: 'sink-out', name: 'Sink', blurb: 'Drops away gently.',
    defaultMs: 650, defaultIntensity: 0.7, params: [],
    motion(s, o) {
      o.y += inCubic(s.p) * s.size.h * 0.4 * s.intensity;
      fade(o, s, 1 - inCubic(s.p));
    },
  }),
  exit({
    id: 'slide-out', name: 'Slide out', blurb: 'Glides off to a side.',
    defaultMs: 650, defaultIntensity: 0.8,
    params: [choice('to', 'Towards', [
      { value: 'right', label: 'Right' }, { value: 'left', label: 'Left' },
      { value: 'down', label: 'Bottom' }, { value: 'up', label: 'Top' },
    ])],
    motion(s, o) {
      const dir = fromSide(s.params.str('to'));
      const d = inCubic(s.p) * reach(s) * 0.9 * s.intensity;
      o.x += dir.x * d; o.y += dir.y * d;
      fade(o, s, 1 - smoothstep(0.6, 1, s.p));
    },
  }),
  exit({
    id: 'spin-out', name: 'Spin out', blurb: 'Twirls away to nothing.',
    defaultMs: 750, defaultIntensity: 0.8, params: [],
    motion(s, o) {
      o.rotation += inCubic(s.p) * 200 * s.intensity;
      const k = 1 - 0.7 * s.intensity * inCubic(s.p);
      o.scaleX *= k; o.scaleY *= k;
      fade(o, s, 1 - smoothstep(0.55, 1, s.p));
    },
  }),
  exit({
    id: 'flip-out', name: 'Flip out', blurb: 'Turns over and is gone.',
    defaultMs: 600, defaultIntensity: 1, params: [],
    motion(s, o) {
      o.scaleX *= Math.max(0.001, 1 - s.intensity * inCubic(s.p));
      fade(o, s, 1 - smoothstep(0.8, 1, s.p));
    },
  }),
  exit({
    id: 'blur-out', name: 'Focus out', blurb: 'Softens into a blur and fades.',
    defaultMs: 750, defaultIntensity: 0.8, params: [],
    motion(s, o) {
      o.blur += inCubic(s.p) * Math.min(s.size.w, s.size.h, 400) * 0.1 * s.intensity;
      fade(o, s, 1 - smoothstep(0.4, 1, s.p));
    },
  }),
  exit({
    id: 'blow-away', name: 'Blow away', blurb: 'Carried off by a breeze.',
    defaultMs: 900, defaultIntensity: 0.8, params: [],
    motion(s, o) {
      const k = inCubic(s.p) * s.intensity;
      o.x += k * reach(s) * 0.8;
      o.y -= k * s.size.h * 0.35;
      o.rotation += k * 14;
      o.blur += k * Math.min(s.size.w, s.size.h, 400) * 0.04;
      fade(o, s, 1 - smoothstep(0.35, 1, s.p));
    },
  }),
  exit({
    id: 'fizzle', name: 'Fizzle', blurb: 'Dissolves into a drift of sparkles.',
    defaultMs: 1_000, defaultIntensity: 0.9, params: [color('#ffe7a3')],
    motion(s, o) { fade(o, s, 1 - smoothstep(0.05, 0.75, s.p)); },
    over(ctx, s, box) { sparkleCloud(ctx, s, box, 28, s.p, true); },
  }),
  exit({
    id: 'glitch-out', name: 'Glitch out', blurb: 'Breaks up and cuts out.',
    defaultMs: 500, defaultIntensity: 0.8, params: [],
    motion(s, o) {
      const k = Math.floor(s.t / 45);
      const chaos = s.p * s.intensity;
      o.x += (rand(s.seed, k, 1) - 0.5) * s.size.w * 0.25 * chaos;
      fade(o, s, s.p > 0.92 ? 0 : rand(s.seed, k, 2) < chaos * 0.6 ? 0.15 : 1);
      o.scaleY *= 1 + (rand(s.seed, k, 3) - 0.5) * 0.3 * chaos;
    },
  }),
];

// ── Emphasis ────────────────────────────────────────────────────────────────

const periodParam = (fallback: number) => ({
  kind: 'number' as const, key: 'period', label: 'Every', min: 200, max: 6_000, step: 100, default: fallback, suffix: 'ms',
});

const EMPHASIS: readonly ElementEffectDef[] = [
  emphasis({
    id: 'shake-el', name: 'Shake', blurb: 'Trembles with excitement.',
    defaultMs: 800, defaultIntensity: 0.7, params: [],
    motion(s, o) {
      const x = s.t * 0.018;
      const fade = Math.min(1, s.p * 8, (1 - s.p) * 8);
      o.x += noise(s.seed, x) * s.size.w * 0.05 * s.intensity * fade;
      o.y += noise(s.seed + 3, x) * s.size.h * 0.05 * s.intensity * fade;
      o.rotation += noise(s.seed + 5, x) * 3 * s.intensity * fade;
    },
  }),
  emphasis({
    id: 'pulse', name: 'Pulse', blurb: 'Breathes bigger and back, steadily.',
    defaultMs: 2_000, defaultIntensity: 0.7, params: [periodParam(1_000)],
    motion(s, o) {
      const k = 1 + 0.1 * s.intensity * (0.5 - 0.5 * Math.cos((s.t / s.params.num('period')) * TAU));
      o.scaleX *= k; o.scaleY *= k;
    },
  }),
  emphasis({
    id: 'heartbeat', name: 'Heartbeat', blurb: 'A double thump, like a heart.',
    defaultMs: 2_400, defaultIntensity: 0.8, params: [periodParam(1_200)],
    motion(s, o) {
      const ph = (s.t % s.params.num('period')) / s.params.num('period');
      const beat = Math.exp(-(((ph - 0.05) / 0.06) ** 2)) + 0.7 * Math.exp(-(((ph - 0.25) / 0.06) ** 2));
      const k = 1 + 0.12 * s.intensity * beat;
      o.scaleX *= k; o.scaleY *= k;
    },
  }),
  emphasis({
    id: 'float', name: 'Float', blurb: 'Bobs gently up and down.',
    defaultMs: 3_000, defaultIntensity: 0.7, params: [periodParam(3_000)],
    motion(s, o) { o.y += Math.sin((s.t / s.params.num('period')) * TAU) * s.size.h * 0.05 * s.intensity; },
  }),
  emphasis({
    id: 'wiggle', name: 'Wiggle', blurb: 'A playful little wiggle, now and then.',
    defaultMs: 2_000, defaultIntensity: 0.8, params: [periodParam(1_500)],
    motion(s, o) {
      const period = s.params.num('period');
      const local = s.t % period;
      const burst = local < 520 ? Math.sin((local / 520) * Math.PI) : 0;
      o.rotation += Math.sin((s.t / 85) * TAU * 0.5) * 7 * s.intensity * burst;
    },
  }),
  emphasis({
    id: 'swing', name: 'Swing', blurb: 'Rocks side to side like a pendulum.',
    defaultMs: 3_000, defaultIntensity: 0.7, params: [periodParam(2_000)],
    motion(s, o) { o.rotation += Math.sin((s.t / s.params.num('period')) * TAU) * 10 * s.intensity; },
  }),
  emphasis({
    id: 'spin', name: 'Spin', blurb: 'Turns round and round.',
    defaultMs: 4_000, defaultIntensity: 1, params: [periodParam(4_000),
      choice('way', 'Direction', [{ value: 'cw', label: 'Clockwise' }, { value: 'ccw', label: 'Anticlockwise' }])],
    motion(s, o) {
      o.rotation += (s.t / s.params.num('period')) * 360 * s.intensity * (s.params.str('way') === 'ccw' ? -1 : 1);
    },
  }),
  emphasis({
    id: 'jello', name: 'Jello', blurb: 'A wobbly squash and stretch.',
    defaultMs: 1_200, defaultIntensity: 0.8, params: [periodParam(1_200)],
    motion(s, o) {
      const local = (s.t % s.params.num('period')) / s.params.num('period');
      const wobble = Math.sin(local * TAU * 3) * Math.exp(-local * 4) * 0.18 * s.intensity;
      o.scaleX *= 1 + wobble;
      o.scaleY *= 1 - wobble;
    },
  }),
  emphasis({
    id: 'bounce', name: 'Bounce', blurb: 'Hops up and down.',
    defaultMs: 2_000, defaultIntensity: 0.7, params: [periodParam(700)],
    motion(s, o) {
      o.y -= Math.abs(Math.sin((s.t / s.params.num('period')) * Math.PI)) * s.size.h * 0.14 * s.intensity;
    },
  }),
  emphasis({
    id: 'breathe', name: 'Breathe', blurb: 'A slow, calm swell. Almost still.',
    defaultMs: 4_000, defaultIntensity: 0.7, params: [periodParam(4_000)],
    motion(s, o) {
      const k = 1 + 0.045 * s.intensity * Math.sin((s.t / s.params.num('period')) * TAU);
      o.scaleX *= k; o.scaleY *= k;
    },
  }),
  emphasis({
    id: 'flicker', name: 'Flicker', blurb: 'Blinks like a failing neon sign.',
    defaultMs: 1_500, defaultIntensity: 0.7, params: [],
    motion(s, o) { if (rand(s.seed, Math.floor(s.t / 60), 1) > 0.65) o.opacity *= 1 - 0.75 * s.intensity; },
  }),
];

// ── Light ───────────────────────────────────────────────────────────────────

/** Sparks spread out from the element: a burst, or (with `drift`) a dissolve. */
function sparkleCloud(
  ctx: Ctx2D,
  s: ElementSample,
  box: { x: number; y: number; w: number; h: number },
  n: number,
  p: number,
  drift: boolean,
): void {
  const tint = s.params.color('color');
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const r0 = Math.max(box.w, box.h) * 0.5;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const angle = rand(s.seed, i, 1) * TAU;
    const startX = drift ? box.x + rand(s.seed, i, 2) * box.w : cx;
    const startY = drift ? box.y + rand(s.seed, i, 3) * box.h : cy;
    const dist = (drift ? r0 * 0.5 : r0 * (0.9 + rand(s.seed, i, 4) * 0.7)) * outCubic(p);
    const x = startX + Math.cos(angle) * dist + (drift ? r0 * 0.4 * p : 0);
    const y = startY + Math.sin(angle) * dist - (drift ? r0 * 0.6 * p : 0);
    const life = drift ? Math.sin(Math.PI * clamp01(p * 1.3 - rand(s.seed, i, 5) * 0.3)) : 1 - p;
    const r = Math.max(box.w, box.h, 60) * 0.035 * (0.5 + rand(s.seed, i, 6)) * life * s.intensity;
    if (r < 0.3) continue;
    ctx.fillStyle = withAlpha(tint, 0.95 * life);
    sparklePath(ctx, x, y, r, p * 2 + i);
    ctx.fill();
  }
  ctx.restore();
}

const LIGHT: readonly ElementEffectDef[] = [
  light({
    id: 'shine', name: 'Shine', blurb: 'A glossy glint sweeps across it. Lovely on logos and products.',
    phase: 'enter', defaultMs: 1_100, defaultIntensity: 0.85,
    params: [{ kind: 'number', key: 'repeats', label: 'Sweeps', min: 1, max: 6, step: 1, default: 1 }, color('#ffffff')],
    onto(ctx, s, box) {
      if (s.intensity <= 0.002) return;
      const repeats = Math.max(1, Math.round(s.params.num('repeats')));
      const local = (s.p * repeats) % 1;
      const along = -0.5 + 2 * local;
      const band = Math.max(box.w, box.h) * 0.22;
      const cx = box.x + box.w * along;
      const cy = box.y + box.h / 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(0.45);
      const g = ctx.createLinearGradient(-band, 0, band, 0);
      const tint = s.params.color('color');
      const a = 0.75 * s.intensity * Math.sin(Math.PI * local);
      g.addColorStop(0, withAlpha(tint, 0));
      g.addColorStop(0.5, withAlpha(tint, a));
      g.addColorStop(1, withAlpha(tint, 0));
      ctx.fillStyle = g;
      const big = Math.hypot(box.w, box.h) * 2;
      ctx.fillRect(-band, -big, band * 2, big * 2);
      ctx.restore();
    },
  }),
  light({
    id: 'glow-el', name: 'Glow', blurb: 'A soft halo of light around its shape.',
    phase: 'during', defaultMs: 2_000, defaultIntensity: 0.8,
    params: [color('#ffffff'), { kind: 'number', key: 'pulse', label: 'Pulse', min: 0, max: 100, default: 30, suffix: '%' }],
    glow(s) {
      const pulse = s.params.num('pulse') / 100;
      const k = 1 - pulse * 0.5 * (1 - Math.cos((s.t / 1200) * TAU));
      const edge = Math.min(1, s.p * 6, (1 - s.p) * 6);
      return {
        color: s.params.color('color'),
        radius: Math.min(s.size.w, s.size.h, 600) * 0.12 * s.intensity,
        alpha: 0.95 * k * edge,
      };
    },
  }),
  light({
    id: 'flash-el', name: 'Flash', blurb: 'Lights up white for an instant.',
    phase: 'enter', defaultMs: 500, defaultIntensity: 0.9, params: [color('#ffffff')],
    onto(ctx, s, box) {
      const a = (s.t < 40 ? s.t / 40 : Math.exp(-(s.t - 40) / 160)) * s.intensity;
      if (a <= 0.002) return;
      ctx.fillStyle = withAlpha(s.params.color('color'), a);
      ctx.fillRect(box.x - 2, box.y - 2, box.w + 4, box.h + 4);
    },
  }),
  light({
    id: 'sparkle-burst', name: 'Sparkle burst', blurb: 'Sparks fly out from it. A little magic.',
    phase: 'enter', defaultMs: 900, defaultIntensity: 0.9, params: [color('#ffe28a'), periodParam(1_200)],
    over(ctx, s, box) {
      const period = s.params.num('period');
      const local = s.dur > period * 1.5 ? (s.t % period) / period : s.p;
      sparkleCloud(ctx, s, box, 16, local, false);
    },
  }),
  light({
    id: 'halo', name: 'Halo', blurb: 'A pool of light behind it.',
    phase: 'during', defaultMs: 2_000, defaultIntensity: 0.7, params: [color('#fff1c9')],
    under(ctx, s, box) {
      if (s.intensity <= 0.002) return;
      const edge = Math.min(1, s.p * 5, (1 - s.p) * 5);
      const cx = box.x + box.w / 2;
      const cy = box.y + box.h / 2;
      const r = Math.max(box.w, box.h) * 0.85;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      const tint = s.params.color('color');
      const a = 0.55 * s.intensity * edge * (0.85 + 0.15 * Math.sin((s.t / 1500) * TAU));
      g.addColorStop(0, withAlpha(tint, a));
      g.addColorStop(1, withAlpha(tint, 0));
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      ctx.restore();
    },
  }),
  light({
    id: 'neon-frame', name: 'Neon frame', blurb: 'A glowing outline that hums.',
    phase: 'during', defaultMs: 2_000, defaultIntensity: 0.8, params: [color('#4cf2ff')],
    over(ctx, s, box) {
      if (s.intensity <= 0.002) return;
      const edge = Math.min(1, s.p * 5, (1 - s.p) * 5);
      const hum = 0.75 + 0.25 * Math.sin((s.t / 90) * TAU * 0.25) * (rand(s.seed, Math.floor(s.t / 80), 1) > 0.9 ? 0 : 1);
      const tint = s.params.color('color');
      const lw = Math.max(1.5, Math.min(box.w, box.h) * 0.014);
      ctx.save();
      ctx.strokeStyle = withAlpha(tint, s.intensity * edge * hum);
      ctx.lineWidth = lw;
      ctx.shadowColor = tint;
      ctx.shadowBlur = lw * 5;
      const pad = lw * 2.5;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(box.x - pad, box.y - pad, box.w + pad * 2, box.h + pad * 2, box.radius + pad);
      else ctx.rect(box.x - pad, box.y - pad, box.w + pad * 2, box.h + pad * 2);
      ctx.stroke();
      ctx.restore();
    },
  }),
];

export const ELEMENT_EFFECTS: readonly ElementEffectDef[] = [...ENTRANCES, ...EXITS, ...EMPHASIS, ...LIGHT];
