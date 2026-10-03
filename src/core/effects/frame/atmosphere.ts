import type { Ctx2D } from '@/core/types';
import { withAlpha } from '@/core/render/paint';
import { amount, choice, color, size, speed } from '../params';
import { between, noise, rand, smoothstep, wrap } from '../random';
import type { FrameEffectDef, FrameSample } from '../types';

/**
 * Atmosphere: things in the air (D-100).
 *
 * Every particle is a function of its index, the effect's seed and the time —
 * never a position carried from the last frame. So the playhead can land
 * anywhere and the flakes are exactly where the export will have them.
 *
 * Particles are drawn nearest-last with size, speed and opacity all tied to
 * one "depth" number, which is the whole trick of making a flat layer of dots
 * read as weather with distance in it.
 */

const TAU = Math.PI * 2;

const count = (s: FrameSample, low: number, high: number): number =>
  Math.round(low + (high - low) * (s.params.num('amount') / 100));

const visible = (s: FrameSample): number => s.env * s.intensity;

/** A four-pointed glint: the shape people draw when they draw "sparkle". */
export function sparklePath(ctx: Ctx2D, x: number, y: number, r: number, turn: number): void {
  const c = Math.cos(turn);
  const sn = Math.sin(turn);
  const at = (dx: number, dy: number): [number, number] => [x + dx * c - dy * sn, y + dx * sn + dy * c];
  const pinch = r * 0.12;
  ctx.beginPath();
  const [x0, y0] = at(0, -r);
  ctx.moveTo(x0, y0);
  const points: [number, number][] = [[r, 0], [0, r], [-r, 0], [0, -r]];
  const pinches: [number, number][] = [[pinch, -pinch], [pinch, pinch], [-pinch, pinch], [-pinch, -pinch]];
  for (let i = 0; i < 4; i++) {
    const [cx, cy] = at(...(pinches[i] ?? [0, 0]));
    const [px, py] = at(...(points[i] ?? [0, 0]));
    ctx.quadraticCurveTo(cx, cy, px, py);
  }
  ctx.closePath();
}

function heartPath(ctx: Ctx2D, x: number, y: number, s: number, turn: number): void {
  const c = Math.cos(turn);
  const sn = Math.sin(turn);
  const p = (dx: number, dy: number): [number, number] => [x + (dx * c - dy * sn) * s, y + (dx * sn + dy * c) * s];
  ctx.beginPath();
  ctx.moveTo(...p(0, 0.35));
  ctx.bezierCurveTo(...p(-0.05, 0.25), ...p(-0.5, 0.1), ...p(-0.5, -0.12));
  ctx.bezierCurveTo(...p(-0.5, -0.42), ...p(-0.12, -0.5), ...p(0, -0.22));
  ctx.bezierCurveTo(...p(0.12, -0.5), ...p(0.5, -0.42), ...p(0.5, -0.12));
  ctx.bezierCurveTo(...p(0.5, 0.1), ...p(0.05, 0.25), ...p(0, 0.35));
  ctx.closePath();
}

const PALETTES: Readonly<Record<string, readonly string[]>> = {
  party: ['#ff4d6d', '#ffd23f', '#3ec1d3', '#7b5cff', '#2ee59d', '#ff8c42'],
  gold: ['#f7d774', '#e8b53a', '#fff3c4', '#c99a2e'],
  pastel: ['#ffc8dd', '#bde0fe', '#cdb4db', '#caffbf', '#fdffb6'],
  blossom: ['#ffc1d6', '#ffd9e6', '#ff9fbf', '#ffe4ec'],
  autumn: ['#e8742c', '#c9472b', '#f2b43c', '#9c5a2b'],
  white: ['#ffffff', '#f3f0ea', '#e9eef5'],
  warm: ['#ffcf8a', '#ffb067', '#ffe2b0'],
  cool: ['#9cd2ff', '#b9a7ff', '#a8fff0'],
  rose: ['#ff9fc6', '#ffc2dc', '#ff7fae'],
};

function paletteFor(s: FrameSample, key: string): readonly string[] {
  const name = s.params.str(key);
  if (name === 'brand') return [s.palette.accent, s.palette.ink, s.palette.surface, '#ffffff'];
  return PALETTES[name] ?? PALETTES['party'] ?? ['#ffffff'];
}

const pick = <T,>(list: readonly T[], r: number, fallback: T): T =>
  list[Math.floor(r * list.length) % Math.max(1, list.length)] ?? fallback;

// ── The effects ─────────────────────────────────────────────────────────────

const snow: FrameEffectDef = {
  id: 'snow',
  name: 'Snow',
  category: 'Atmosphere',
  blurb: 'Soft flakes drifting down, near ones bigger and quicker.',
  defaultMs: null,
  defaultIntensity: 0.8,
  params: [
    amount(55), size(100), speed(100),
    { kind: 'number', key: 'wind', label: 'Wind', min: -100, max: 100, default: 15 },
    color('#ffffff'),
  ],
  draw(ctx, s) {
    const a = visible(s);
    if (a <= 0.002) return;
    const { w, h } = s.design;
    const u = s.unit;
    const n = count(s, 40, 320);
    const sizeMul = s.params.num('size') / 100;
    const speedMul = s.params.num('speed') / 100;
    const wind = s.params.num('wind') / 100;
    const secs = s.t / 1000;

    ctx.save();
    ctx.fillStyle = s.params.color('color');
    for (let i = 0; i < n; i++) {
      const depth = rand(s.seed, i, 1);
      const r = u * (0.0018 + depth * 0.0058) * sizeMul;
      const fall = h * (0.05 + depth * 0.14) * speedMul;
      const span = h + r * 8;
      const y = wrap(rand(s.seed, i, 2) * span + fall * secs, span) - r * 4;
      const sway = Math.sin(secs * (0.5 + rand(s.seed, i, 3)) + rand(s.seed, i, 4) * TAU) * u * 0.012 * (0.4 + depth);
      const across = w + r * 8;
      const x = wrap(rand(s.seed, i, 5) * across + wind * fall * 0.8 * secs + sway, across) - r * 4;
      ctx.globalAlpha = a * (0.35 + depth * 0.6);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  },
};

const rain: FrameEffectDef = {
  id: 'rain',
  name: 'Rain',
  category: 'Atmosphere',
  blurb: 'Fine streaks of rain and a little gloom.',
  defaultMs: null,
  defaultIntensity: 0.7,
  params: [
    amount(60), speed(100),
    { kind: 'number', key: 'wind', label: 'Slant', min: -100, max: 100, default: 20 },
    color('#d8e6ff'),
  ],
  draw(ctx, s) {
    const a = visible(s);
    if (a <= 0.002) return;
    const { w, h } = s.design;
    const u = s.unit;
    const n = count(s, 60, 420);
    const speedMul = s.params.num('speed') / 100;
    const slant = (s.params.num('wind') / 100) * 0.35;
    const secs = s.t / 1000;
    const tint = s.params.color('color');

    ctx.save();
    // The light goes when it rains; a frame of streaks over full sun reads as scratches.
    ctx.fillStyle = `rgba(8, 14, 28, ${(0.16 * a).toFixed(3)})`;
    ctx.fillRect(0, 0, w, h);
    ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const depth = rand(s.seed, i, 1);
      const len = u * (0.025 + depth * 0.055);
      const fall = h * (0.9 + depth * 1.3) * speedMul;
      const span = h + len * 2;
      const y = wrap(rand(s.seed, i, 2) * span + fall * secs, span) - len;
      const across = w + len * 2;
      const x = wrap(rand(s.seed, i, 3) * across + slant * fall * secs, across) - len;
      ctx.strokeStyle = withAlpha(tint, a * (0.22 + depth * 0.4));
      ctx.lineWidth = u * (0.0011 + depth * 0.0017);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - slant * len, y - len);
      ctx.stroke();
    }
    ctx.restore();
  },
};

const sparkles: FrameEffectDef = {
  id: 'sparkles',
  name: 'Sparkles',
  category: 'Atmosphere',
  blurb: 'Glints that wink in and out — glitter, sprinkles, magic.',
  defaultMs: null,
  defaultIntensity: 0.85,
  params: [amount(45), size(100), speed(100), color('#ffe28a'),
    { kind: 'number', key: 'rise', label: 'Drift up', min: 0, max: 100, default: 25, suffix: '%' }],
  draw(ctx, s) {
    const a = visible(s);
    if (a <= 0.002) return;
    const { w, h } = s.design;
    const u = s.unit;
    const n = count(s, 8, 90);
    const sizeMul = s.params.num('size') / 100;
    const speedMul = s.params.num('speed') / 100;
    const rise = s.params.num('rise') / 100;
    const tint = s.params.color('color');

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const life = between(s.seed, i, 1, 700, 1700) / speedMul;
      const cycle = s.t / life + rand(s.seed, i, 2);
      const k = Math.floor(cycle);
      const f = cycle - k;
      const id = i * 131 + k;
      const x = rand(s.seed, id, 3) * w;
      const y = rand(s.seed, id, 4) * h - f * u * 0.05 * rise;
      const r = u * between(s.seed, id, 5, 0.008, 0.028) * sizeMul * Math.sin(Math.PI * f);
      if (r < 0.4) continue;

      const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 2.4);
      glow.addColorStop(0, withAlpha(tint, 0.45 * a));
      glow.addColorStop(1, withAlpha(tint, 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, r * 2.4, 0, TAU);
      ctx.fill();

      ctx.fillStyle = withAlpha('#ffffff', 0.95 * a);
      sparklePath(ctx, x, y, r, f * Math.PI * 0.5);
      ctx.fill();
    }
    ctx.restore();
  },
};

const confetti: FrameEffectDef = {
  id: 'confetti',
  name: 'Confetti',
  category: 'Atmosphere',
  blurb: 'A celebration: paper pieces tumbling down.',
  defaultMs: 4_000,
  defaultIntensity: 1,
  params: [amount(60), size(100), speed(100),
    choice('colors', 'Colours', [
      { value: 'party', label: 'Party' }, { value: 'gold', label: 'Gold' },
      { value: 'pastel', label: 'Pastel' }, { value: 'brand', label: 'Your colours' },
    ])],
  draw(ctx, s) {
    const a = visible(s);
    if (a <= 0.002) return;
    const { w, h } = s.design;
    const u = s.unit;
    const n = count(s, 30, 220);
    const sizeMul = s.params.num('size') / 100;
    const speedMul = s.params.num('speed') / 100;
    const colors = paletteFor(s, 'colors');
    const secs = s.t / 1000;
    const base = ctx.getTransform();

    ctx.save();
    ctx.globalAlpha = a;
    for (let i = 0; i < n; i++) {
      const depth = rand(s.seed, i, 1);
      const fall = h * (0.14 + depth * 0.22) * speedMul;
      const span = h + u * 0.1;
      // Starts above the frame, so the first pieces fall *in* rather than appearing mid-air.
      const y = wrap(rand(s.seed, i, 2) * span * 1.4 + fall * secs, span) - u * 0.05;
      const x = wrap(rand(s.seed, i, 3) * w + Math.sin(secs * (1 + rand(s.seed, i, 4) * 2) + rand(s.seed, i, 5) * TAU) * u * 0.04, w);
      const turn = secs * between(s.seed, i, 6, -5, 5) + rand(s.seed, i, 7) * TAU;
      const flip = Math.cos(secs * between(s.seed, i, 8, 3, 9) + rand(s.seed, i, 9) * TAU);
      const pw = u * 0.011 * sizeMul * (0.7 + depth * 0.6);
      ctx.setTransform(base);
      ctx.translate(x, y);
      ctx.rotate(turn);
      ctx.scale(1, Math.abs(flip) < 0.05 ? 0.05 : flip);
      ctx.fillStyle = pick(colors, rand(s.seed, i, 10), '#ffffff');
      ctx.fillRect(-pw / 2, -pw * 0.8, pw, pw * 1.6);
    }
    ctx.restore();
  },
};

const bokeh: FrameEffectDef = {
  id: 'bokeh',
  name: 'Bokeh lights',
  category: 'Atmosphere',
  blurb: 'Soft out-of-focus lights floating across the frame.',
  defaultMs: null,
  defaultIntensity: 0.7,
  params: [amount(45), size(100), speed(100),
    choice('colors', 'Colours', [
      { value: 'warm', label: 'Warm' }, { value: 'cool', label: 'Cool' },
      { value: 'rose', label: 'Rose' }, { value: 'gold', label: 'Gold' }, { value: 'brand', label: 'Your colours' },
    ])],
  draw(ctx, s) {
    const a = visible(s);
    if (a <= 0.002) return;
    const { w, h } = s.design;
    const u = s.unit;
    const n = count(s, 6, 40);
    const sizeMul = s.params.num('size') / 100;
    const speedMul = s.params.num('speed') / 100;
    const colors = paletteFor(s, 'colors');
    const secs = s.t / 1000;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < n; i++) {
      const depth = rand(s.seed, i, 1);
      const r = u * (0.025 + depth * 0.075) * sizeMul;
      const phase = rand(s.seed, i, 2) * TAU;
      const across = w + r * 2;
      const tall = h + r * 2;
      const x = wrap(rand(s.seed, i, 3) * across + Math.sin(secs * 0.2 * speedMul + phase) * u * 0.08 + secs * u * 0.012 * speedMul, across) - r;
      const y = wrap(rand(s.seed, i, 4) * tall - secs * u * 0.02 * speedMul * (0.3 + depth), tall) - r;
      const pulse = 0.6 + 0.4 * Math.sin(secs * (0.6 + rand(s.seed, i, 5)) + phase);
      const tint = pick(colors, rand(s.seed, i, 6), '#ffffff');
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const o = a * pulse * (0.25 + (1 - depth) * 0.25);
      g.addColorStop(0, withAlpha(tint, o * 0.7));
      g.addColorStop(0.75, withAlpha(tint, o * 0.85));
      g.addColorStop(0.92, withAlpha(tint, o));
      g.addColorStop(1, withAlpha(tint, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  },
};

const fireflies: FrameEffectDef = {
  id: 'fireflies',
  name: 'Fireflies',
  category: 'Atmosphere',
  blurb: 'Tiny glowing lights wandering and pulsing.',
  defaultMs: null,
  defaultIntensity: 0.85,
  params: [amount(40), size(100), speed(100), color('#e9ff8a')],
  draw(ctx, s) {
    const a = visible(s);
    if (a <= 0.002) return;
    const { w, h } = s.design;
    const u = s.unit;
    const n = count(s, 8, 50);
    const sizeMul = s.params.num('size') / 100;
    const speedMul = s.params.num('speed') / 100;
    const tint = s.params.color('color');
    const secs = (s.t / 1000) * speedMul;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const p = (k: number): number => rand(s.seed, i, k);
      const x = p(1) * w + Math.sin(secs * (0.3 + p(2) * 0.5) + p(3) * TAU) * u * 0.08 + Math.sin(secs * 0.13 + p(4) * TAU) * u * 0.05;
      const y = p(5) * h + Math.cos(secs * (0.25 + p(6) * 0.4) + p(7) * TAU) * u * 0.06;
      // Never fully out: a firefly between flashes still glows a little.
      const pulse = 0.3 + 0.7 * Math.max(0, Math.sin(secs * (1.2 + p(8) * 1.6) + p(9) * TAU));
      const r = u * 0.026 * sizeMul * (0.6 + p(10) * 0.6);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, withAlpha('#ffffff', a * pulse));
      g.addColorStop(0.12, withAlpha(tint, a * pulse));
      g.addColorStop(0.35, withAlpha(tint, a * pulse * 0.35));
      g.addColorStop(1, withAlpha(tint, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  },
};

const hearts: FrameEffectDef = {
  id: 'hearts',
  name: 'Floating hearts',
  category: 'Atmosphere',
  blurb: 'Hearts rising gently — for love, thanks and favourites.',
  defaultMs: null,
  defaultIntensity: 0.9,
  params: [amount(35), size(100), speed(100), color('#ff5c8a')],
  draw(ctx, s) {
    const a = visible(s);
    if (a <= 0.002) return;
    const { w, h } = s.design;
    const u = s.unit;
    const n = count(s, 6, 36);
    const sizeMul = s.params.num('size') / 100;
    const speedMul = s.params.num('speed') / 100;
    const tint = s.params.color('color');
    const secs = s.t / 1000;

    ctx.save();
    for (let i = 0; i < n; i++) {
      const depth = rand(s.seed, i, 1);
      const sz = u * (0.02 + depth * 0.035) * sizeMul;
      const rise = h * (0.07 + depth * 0.09) * speedMul;
      const span = h + sz * 4;
      const y = h + sz * 2 - wrap(rand(s.seed, i, 2) * span + rise * secs, span);
      const x = rand(s.seed, i, 3) * w + Math.sin(secs * 1.3 + rand(s.seed, i, 4) * TAU) * u * 0.03;
      const fade = smoothstep(0, h * 0.3, y) * (0.5 + depth * 0.5);
      ctx.fillStyle = withAlpha(tint, a * fade);
      heartPath(ctx, x, y, sz, Math.sin(secs + rand(s.seed, i, 5) * TAU) * 0.3);
      ctx.fill();
    }
    ctx.restore();
  },
};

const bubbles: FrameEffectDef = {
  id: 'bubbles',
  name: 'Bubbles',
  category: 'Atmosphere',
  blurb: 'Light bubbles wobbling upwards.',
  defaultMs: null,
  defaultIntensity: 0.8,
  params: [amount(35), size(100), speed(100), color('#ffffff')],
  draw(ctx, s) {
    const a = visible(s);
    if (a <= 0.002) return;
    const { w, h } = s.design;
    const u = s.unit;
    const n = count(s, 6, 45);
    const sizeMul = s.params.num('size') / 100;
    const speedMul = s.params.num('speed') / 100;
    const tint = s.params.color('color');
    const secs = s.t / 1000;

    ctx.save();
    for (let i = 0; i < n; i++) {
      const depth = rand(s.seed, i, 1);
      const r = u * (0.012 + depth * 0.03) * sizeMul;
      const rise = h * (0.06 + depth * 0.1) * speedMul;
      const span = h + r * 4;
      const y = h + r * 2 - wrap(rand(s.seed, i, 2) * span + rise * secs, span);
      const x = rand(s.seed, i, 3) * w + Math.sin(secs * 2 + rand(s.seed, i, 4) * TAU) * r * 0.8;
      const o = a * (0.45 + depth * 0.4);
      ctx.fillStyle = withAlpha(tint, o * 0.12);
      ctx.strokeStyle = withAlpha(tint, o * 0.7);
      ctx.lineWidth = Math.max(0.6, r * 0.08);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = withAlpha('#ffffff', o * 0.8);
      ctx.beginPath();
      ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.18, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  },
};

const petals: FrameEffectDef = {
  id: 'petals',
  name: 'Falling petals',
  category: 'Atmosphere',
  blurb: 'Petals or leaves turning as they fall.',
  defaultMs: null,
  defaultIntensity: 0.9,
  params: [amount(40), size(100), speed(100),
    choice('colors', 'Kind', [
      { value: 'blossom', label: 'Blossom' }, { value: 'autumn', label: 'Autumn leaves' },
      { value: 'white', label: 'White petals' }, { value: 'brand', label: 'Your colours' },
    ])],
  draw(ctx, s) {
    const a = visible(s);
    if (a <= 0.002) return;
    const { w, h } = s.design;
    const u = s.unit;
    const n = count(s, 10, 80);
    const sizeMul = s.params.num('size') / 100;
    const speedMul = s.params.num('speed') / 100;
    const colors = paletteFor(s, 'colors');
    const secs = s.t / 1000;
    const base = ctx.getTransform();

    ctx.save();
    ctx.globalAlpha = a;
    for (let i = 0; i < n; i++) {
      const depth = rand(s.seed, i, 1);
      const pw = u * (0.014 + depth * 0.02) * sizeMul;
      const fall = h * (0.06 + depth * 0.1) * speedMul;
      const span = h + pw * 6;
      const y = wrap(rand(s.seed, i, 2) * span + fall * secs, span) - pw * 3;
      const x = wrap(rand(s.seed, i, 3) * w + secs * u * 0.02 + Math.sin(secs * (0.8 + rand(s.seed, i, 4)) + rand(s.seed, i, 5) * TAU) * u * 0.05, w);
      ctx.setTransform(base);
      ctx.translate(x, y);
      ctx.rotate(secs * between(s.seed, i, 6, -2, 2) + rand(s.seed, i, 7) * TAU);
      ctx.scale(Math.cos(secs * between(s.seed, i, 8, 1, 3) + rand(s.seed, i, 9) * TAU), 1);
      ctx.fillStyle = pick(colors, rand(s.seed, i, 10), '#ffffff');
      ctx.beginPath();
      ctx.ellipse(0, 0, pw, pw * 0.55, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  },
};

const embers: FrameEffectDef = {
  id: 'embers',
  name: 'Embers',
  category: 'Atmosphere',
  blurb: 'Warm sparks rising and flickering out.',
  defaultMs: null,
  defaultIntensity: 0.85,
  params: [amount(50), size(100), speed(100), color('#ff8a3d')],
  draw(ctx, s) {
    const a = visible(s);
    if (a <= 0.002) return;
    const { w, h } = s.design;
    const u = s.unit;
    const n = count(s, 15, 120);
    const sizeMul = s.params.num('size') / 100;
    const speedMul = s.params.num('speed') / 100;
    const tint = s.params.color('color');
    const secs = s.t / 1000;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const depth = rand(s.seed, i, 1);
      const rise = h * (0.12 + depth * 0.2) * speedMul;
      const span = h * 1.1;
      const travelled = wrap(rand(s.seed, i, 2) * span + rise * secs, span);
      const y = h - travelled;
      const x = rand(s.seed, i, 3) * w + noise(s.seed + i, secs * 0.8) * u * 0.06;
      const flicker = 0.55 + 0.45 * noise(s.seed + 31 * i, secs * 6);
      const life = 1 - travelled / span;
      const r = u * (0.003 + depth * 0.006) * sizeMul;
      const o = a * flicker * life;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
      g.addColorStop(0, withAlpha('#fff1c2', o));
      g.addColorStop(0.3, withAlpha(tint, o * 0.8));
      g.addColorStop(1, withAlpha(tint, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r * 3, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  },
};

const dust: FrameEffectDef = {
  id: 'dust',
  name: 'Dust in the light',
  category: 'Atmosphere',
  blurb: 'Fine motes hanging in a sunbeam. Quiet and cinematic.',
  defaultMs: null,
  defaultIntensity: 0.7,
  params: [amount(55), size(100), speed(100), color('#fff4dc')],
  draw(ctx, s) {
    const a = visible(s);
    if (a <= 0.002) return;
    const { w, h } = s.design;
    const u = s.unit;
    const n = count(s, 30, 220);
    const sizeMul = s.params.num('size') / 100;
    const secs = (s.t / 1000) * (s.params.num('speed') / 100);
    const tint = s.params.color('color');

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = tint;
    for (let i = 0; i < n; i++) {
      const depth = rand(s.seed, i, 1);
      const x = wrap(rand(s.seed, i, 2) * w + noise(s.seed + i, secs * 0.15) * u * 0.08 + secs * u * 0.004, w);
      const y = wrap(rand(s.seed, i, 3) * h + noise(s.seed + 7 * i, secs * 0.12) * u * 0.06 - secs * u * 0.003, h);
      const twinkle = 0.4 + 0.6 * Math.abs(Math.sin(secs * (0.7 + depth) + rand(s.seed, i, 4) * TAU));
      ctx.globalAlpha = a * twinkle * (0.2 + depth * 0.45);
      ctx.beginPath();
      ctx.arc(x, y, u * (0.0012 + depth * 0.003) * sizeMul, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  },
};

const shootingStars: FrameEffectDef = {
  id: 'shooting-stars',
  name: 'Shooting stars',
  category: 'Atmosphere',
  blurb: 'A twinkling sky with stars streaking across it.',
  defaultMs: null,
  defaultIntensity: 0.9,
  params: [amount(45),
    { kind: 'number', key: 'every', label: 'A star every', min: 400, max: 4_000, step: 100, default: 1_400, suffix: 'ms' },
    color('#ffffff')],
  draw(ctx, s) {
    const a = visible(s);
    if (a <= 0.002) return;
    const { w, h } = s.design;
    const u = s.unit;
    const tint = s.params.color('color');
    const secs = s.t / 1000;

    ctx.save();
    // The still stars.
    const n = count(s, 20, 140);
    ctx.fillStyle = tint;
    for (let i = 0; i < n; i++) {
      ctx.globalAlpha = a * (0.25 + 0.6 * Math.abs(Math.sin(secs * (0.5 + rand(s.seed, i, 1) * 1.5) + rand(s.seed, i, 2) * TAU)));
      ctx.beginPath();
      ctx.arc(rand(s.seed, i, 3) * w, rand(s.seed, i, 4) * h * 0.75, u * (0.001 + rand(s.seed, i, 5) * 0.002), 0, TAU);
      ctx.fill();
    }

    // The shooting ones.
    const every = s.params.num('every');
    const lifeMs = 750;
    const current = Math.floor(s.t / every);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (let k = current - 1; k <= current; k++) {
      if (k < 0) continue;
      const start = k * every + rand(s.seed, k, 6) * every * 0.4;
      const f = (s.t - start) / lifeMs;
      if (f < 0 || f > 1) continue;
      const x0 = w * between(s.seed, k, 7, 0.25, 1.05);
      const y0 = h * between(s.seed, k, 8, -0.05, 0.3);
      const angle = between(s.seed, k, 9, 2.4, 2.8);
      const travel = u * 0.7;
      const hx = x0 + Math.cos(angle) * travel * f;
      const hy = y0 + Math.sin(angle) * travel * f;
      const tail = u * 0.22 * Math.sin(Math.PI * Math.min(1, f * 1.4));
      const tx = hx - Math.cos(angle) * tail;
      const ty = hy - Math.sin(angle) * tail;
      const g = ctx.createLinearGradient(hx, hy, tx, ty);
      g.addColorStop(0, withAlpha(tint, a));
      g.addColorStop(1, withAlpha(tint, 0));
      ctx.strokeStyle = g;
      ctx.globalAlpha = 1;
      ctx.lineWidth = u * 0.004;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(tx, ty);
      ctx.stroke();
    }
    ctx.restore();
  },
};

export const ATMOSPHERE: readonly FrameEffectDef[] = [
  snow, sparkles, confetti, bokeh, petals, hearts, fireflies, bubbles, rain, embers, dust, shootingStars,
];
