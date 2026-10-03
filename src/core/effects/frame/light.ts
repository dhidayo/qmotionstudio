import type { Ctx2D } from '@/core/types';
import { withAlpha } from '@/core/render/paint';
import { amount, choice, color, size, speed, strength } from '../params';
import { between, lerp, rand } from '../random';
import type { FrameEffectDef, FrameIO, FrameSample } from '../types';

/**
 * Light: leaks, flares, rays, lightning and flashes (D-100).
 *
 * Almost everything here is drawn with `screen` or `lighter`, which only ever
 * brighten. That is what makes light read as light rather than as a coloured
 * shape laid on top of the picture — a flare on a black frame is a flare, and
 * on a white one it disappears, exactly as real light does.
 */

const TAU = Math.PI * 2;

const visible = (s: FrameSample): number => s.env * s.intensity;

const LEAK_COLORS: Readonly<Record<string, readonly string[]>> = {
  warm: ['#ff7a2f', '#ffc15e', '#ff4f6d'],
  gold: ['#ffb347', '#ffe08a', '#ff9a3c'],
  rose: ['#ff6fa8', '#ffb3c7', '#c86bff'],
  teal: ['#2ee6c8', '#5ab8ff', '#a1ffce'],
};

/** A sweeping in-and-out curve for one-shot accents: 0 → 1 → 0 across the window. */
const swell = (p: number): number => Math.sin(Math.PI * Math.max(0, Math.min(1, p)));

const lightLeak: FrameEffectDef = {
  id: 'light-leak',
  name: 'Light leak',
  category: 'Light',
  blurb: 'Warm film light drifting across the picture.',
  defaultMs: null,
  defaultIntensity: 0.7,
  params: [speed(100),
    choice('colors', 'Colour', [
      { value: 'warm', label: 'Warm' }, { value: 'gold', label: 'Gold' },
      { value: 'rose', label: 'Rose' }, { value: 'teal', label: 'Teal' }, { value: 'brand', label: 'Your colour' },
    ])],
  draw(ctx, s) {
    const a = visible(s);
    if (a <= 0.002) return;
    const { w, h } = s.design;
    const secs = (s.t / 1000) * (s.params.num('speed') / 100);
    const name = s.params.str('colors');
    const colors = name === 'brand' ? [s.palette.accent, s.palette.accent, '#ffffff'] : LEAK_COLORS[name] ?? LEAK_COLORS['warm'] ?? [];

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    colors.forEach((tint, j) => {
      const phase = rand(s.seed, j, 1) * TAU;
      const cx = w * (0.5 + 0.75 * Math.sin(secs * (0.11 + j * 0.03) + phase));
      const cy = h * (0.5 + 0.6 * Math.cos(secs * (0.09 + j * 0.02) + phase * 1.7));
      const r = Math.max(w, h) * (0.45 + 0.15 * Math.sin(secs * 0.3 + j));
      const breathe = 0.75 + 0.25 * Math.sin(secs * 0.7 + phase);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, withAlpha(tint, 0.85 * a * breathe));
      g.addColorStop(0.4, withAlpha(tint, 0.38 * a * breathe));
      g.addColorStop(1, withAlpha(tint, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    });
    ctx.restore();
  },
};

const lensFlare: FrameEffectDef = {
  id: 'lens-flare',
  name: 'Lens flare',
  category: 'Light',
  blurb: 'A bright flare with ghosts and a streak, sweeping across.',
  defaultMs: 3_000,
  defaultIntensity: 0.8,
  params: [
    choice('path', 'Movement', [
      { value: 'sweep', label: 'Sweeps across' }, { value: 'still', label: 'Stays in the corner' },
    ]),
    color('#ffd9a0'), size(100),
  ],
  draw(ctx, s) {
    const a = visible(s);
    if (a <= 0.002) return;
    const { w, h } = s.design;
    const u = s.unit;
    const tint = s.params.color('color');
    const sizeMul = s.params.num('size') / 100;
    const sweep = s.params.str('path') === 'sweep';
    const eased = (1 - Math.cos(Math.PI * s.p)) / 2;
    const fx = sweep ? lerp(-0.1 * w, 1.1 * w, eased) : w * 0.82;
    const fy = h * (sweep ? 0.24 + 0.04 * Math.sin(s.p * Math.PI) : 0.18);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // The core.
    const core = ctx.createRadialGradient(fx, fy, 0, fx, fy, u * 0.24 * sizeMul);
    core.addColorStop(0, withAlpha('#ffffff', 0.9 * a));
    core.addColorStop(0.08, withAlpha(tint, 0.75 * a));
    core.addColorStop(0.3, withAlpha(tint, 0.18 * a));
    core.addColorStop(1, withAlpha(tint, 0));
    ctx.fillStyle = core;
    ctx.fillRect(fx - u * 0.3, fy - u * 0.3, u * 0.6, u * 0.6);

    // The anamorphic streak: a circle squashed flat.
    ctx.save();
    ctx.translate(fx, fy);
    ctx.scale(1, 0.018);
    const streak = ctx.createRadialGradient(0, 0, 0, 0, 0, w * 0.7);
    streak.addColorStop(0, withAlpha('#ffffff', 0.7 * a));
    streak.addColorStop(0.2, withAlpha(tint, 0.35 * a));
    streak.addColorStop(1, withAlpha(tint, 0));
    ctx.fillStyle = streak;
    ctx.beginPath();
    ctx.arc(0, 0, w * 0.7, 0, TAU);
    ctx.fill();
    ctx.restore();

    // Ghosts, strung along the line from the flare through the centre.
    const vx = w / 2 - fx;
    const vy = h / 2 - fy;
    const ghosts = [0.45, 0.75, 1.15, 1.5, 1.85];
    ghosts.forEach((k, i) => {
      const gx = fx + vx * k;
      const gy = fy + vy * k;
      const r = u * between(s.seed, i, 1, 0.018, 0.075) * sizeMul;
      const g = ctx.createRadialGradient(gx, gy, r * 0.2, gx, gy, r);
      const hue = i % 2 === 0 ? tint : '#9fd4ff';
      g.addColorStop(0, withAlpha(hue, 0.05 * a));
      g.addColorStop(0.85, withAlpha(hue, 0.16 * a));
      g.addColorStop(1, withAlpha(hue, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(gx, gy, r, 0, TAU);
      ctx.fill();
    });
    ctx.restore();
  },
};

const lightRays: FrameEffectDef = {
  id: 'light-rays',
  name: 'Light rays',
  category: 'Light',
  blurb: 'Sunbeams falling through the frame.',
  defaultMs: null,
  defaultIntensity: 0.6,
  params: [
    choice('from', 'Coming from', [
      { value: 'topLeft', label: 'Top left' }, { value: 'top', label: 'Top' }, { value: 'topRight', label: 'Top right' },
    ]),
    amount(55), color('#fff1c9'),
  ],
  draw(ctx, s) {
    const a = visible(s);
    if (a <= 0.002) return;
    const { w, h } = s.design;
    const from = s.params.str('from');
    const ox = from === 'topLeft' ? -0.1 * w : from === 'topRight' ? 1.1 * w : 0.5 * w;
    const oy = from === 'top' ? -0.25 * h : -0.12 * h;
    const aim = Math.atan2(h * 0.6 - oy, w * 0.5 - ox);
    const n = Math.round(5 + 10 * (s.params.num('amount') / 100));
    const reach = Math.hypot(w, h) * 1.3;
    const tint = s.params.color('color');
    const secs = s.t / 1000;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < n; i++) {
      const angle = aim + (rand(s.seed, i, 1) - 0.5) * 1.1 + Math.sin(secs * 0.3 + rand(s.seed, i, 2) * TAU) * 0.035;
      const half = between(s.seed, i, 3, 0.012, 0.05);
      const pulse = 0.55 + 0.45 * Math.sin(secs * (0.4 + rand(s.seed, i, 4) * 0.6) + rand(s.seed, i, 5) * TAU);
      // A beam is soft at its edges: a wide faint wedge with a narrower,
      // brighter one inside it reads as light; a single wedge reads as a shape.
      for (const [spread, strength] of [[1, 0.1], [0.45, 0.16]] as const) {
        const g = ctx.createLinearGradient(ox, oy, ox + Math.cos(angle) * reach, oy + Math.sin(angle) * reach);
        g.addColorStop(0, withAlpha(tint, strength * a * pulse));
        g.addColorStop(0.6, withAlpha(tint, strength * 0.3 * a * pulse));
        g.addColorStop(1, withAlpha(tint, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(ox, oy);
        ctx.lineTo(ox + Math.cos(angle - half * spread) * reach, oy + Math.sin(angle - half * spread) * reach);
        ctx.lineTo(ox + Math.cos(angle + half * spread) * reach, oy + Math.sin(angle + half * spread) * reach);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
  },
};

/** A jagged bolt from (x, top) down to `bottom`, the same every time for a given strike. */
function boltPoints(seed: number, strike: number, x0: number, y0: number, x1: number, y1: number, jag: number): [number, number][] {
  let points: [number, number][] = [[x0, y0], [x1, y1]];
  let spread = jag;
  for (let level = 0; level < 6; level++) {
    const next: [number, number][] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      if (!a || !b) continue;
      next.push(a);
      const r = rand(seed, strike * 997 + level * 61 + i, 77) - 0.5;
      next.push([(a[0] + b[0]) / 2 + r * spread, (a[1] + b[1]) / 2]);
    }
    const last = points[points.length - 1];
    if (last) next.push(last);
    points = next;
    spread *= 0.55;
  }
  return points;
}

function strokeBolt(ctx: Ctx2D, points: readonly [number, number][], width: number, style: string): void {
  ctx.lineWidth = width;
  ctx.strokeStyle = style;
  ctx.beginPath();
  points.forEach(([x, y], i) => { if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
  ctx.stroke();
}

const lightning: FrameEffectDef = {
  id: 'lightning',
  name: 'Lightning',
  category: 'Light',
  blurb: 'Bolts and flashes across a darkened sky.',
  defaultMs: 2_000,
  defaultIntensity: 0.9,
  params: [
    { kind: 'number', key: 'rate', label: 'Strikes per second', min: 0.3, max: 3, step: 0.1, default: 0.9 },
    color('#dbe8ff'),
    { kind: 'number', key: 'gloom', label: 'Storm gloom', min: 0, max: 100, default: 40, suffix: '%' },
  ],
  draw(ctx, s) {
    const a = visible(s);
    if (a <= 0.002) return;
    const { w, h } = s.design;
    const u = s.unit;
    const tint = s.params.color('color');
    const period = 1000 / s.params.num('rate');

    ctx.save();
    const gloom = (s.params.num('gloom') / 100) * 0.4 * a;
    if (gloom > 0) {
      ctx.fillStyle = `rgba(8, 14, 34, ${gloom.toFixed(3)})`;
      ctx.fillRect(0, 0, w, h);
    }

    const current = Math.floor(s.t / period);
    for (let k = current - 1; k <= current; k++) {
      if (k < 0) continue;
      const at = k * period + rand(s.seed, k, 1) * period * 0.55;
      const dt = s.t - at;
      if (dt < 0 || dt > 520) continue;
      // Real lightning flickers: a strike, a dip, a second return stroke, a fade.
      const flash = dt < 55 ? 1 : dt < 105 ? 0.3 : dt < 165 ? 0.85 : Math.exp(-(dt - 165) / 120);

      const x0 = w * between(s.seed, k, 2, 0.15, 0.85);
      const x1 = x0 + w * between(s.seed, k, 3, -0.25, 0.25);
      const y1 = h * between(s.seed, k, 4, 0.55, 0.95);
      const main = boltPoints(s.seed, k, x0, -h * 0.05, x1, y1, w * 0.18);

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalCompositeOperation = 'lighter';
      ctx.shadowColor = tint;
      ctx.shadowBlur = u * 0.04;
      strokeBolt(ctx, main, u * 0.012, withAlpha(tint, 0.35 * flash * a));
      ctx.shadowBlur = 0;
      strokeBolt(ctx, main, u * 0.0032, withAlpha('#ffffff', flash * a));

      // Two branches, forking off partway down.
      for (let b = 0; b < 2; b++) {
        const from = main[Math.floor(main.length * between(s.seed, k * 3 + b, 5, 0.25, 0.6))];
        if (!from) continue;
        const branch = boltPoints(s.seed, k * 7 + b + 1, from[0], from[1], from[0] + w * between(s.seed, k * 3 + b, 6, -0.2, 0.2), from[1] + h * 0.25, w * 0.07);
        strokeBolt(ctx, branch, u * 0.0018, withAlpha('#ffffff', 0.7 * flash * a));
      }

      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = withAlpha(tint, 0.42 * flash * a);
      ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();
  },
};

const flash: FrameEffectDef = {
  id: 'flash',
  name: 'Flash',
  category: 'Light',
  blurb: 'A quick burst of light — on a beat, a reveal or a cut.',
  defaultMs: 500,
  defaultIntensity: 0.9,
  params: [
    color('#ffffff'),
    { kind: 'number', key: 'count', label: 'Flashes', min: 1, max: 8, step: 1, default: 1 },
  ],
  draw(ctx, s) {
    const n = Math.max(1, Math.round(s.params.num('count')));
    let peak = 0;
    for (let c = 0; c < n; c++) {
      const dt = s.t - (c * s.dur) / n;
      if (dt < 0) continue;
      peak = Math.max(peak, dt < 40 ? dt / 40 : Math.exp(-(dt - 40) / 170));
    }
    const a = peak * s.intensity;
    if (a <= 0.002) return;
    ctx.save();
    ctx.fillStyle = withAlpha(s.params.color('color'), a);
    ctx.fillRect(0, 0, s.design.w, s.design.h);
    ctx.restore();
  },
};

/** Copies the frame, small, and lays it back over itself: a cheap, convincing bloom. */
function bloom(ctx: Ctx2D, io: FrameIO, alpha: number, mode: GlobalCompositeOperation): void {
  const { px } = io;
  const small = io.scratch(0);
  const sw = Math.max(2, Math.round(px.w / 8));
  const sh = Math.max(2, Math.round(px.h / 8));
  const mid = io.scratch(1);
  const mw = Math.max(2, Math.round(px.w / 3));
  const mh = Math.max(2, Math.round(px.h / 3));
  mid.ctx.drawImage(io.source, 0, 0, px.w, px.h, 0, 0, mw, mh);
  small.ctx.drawImage(mid.canvas, 0, 0, mw, mh, 0, 0, sw, sh);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = mode;
  ctx.globalAlpha = alpha;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(small.canvas, 0, 0, sw, sh, 0, 0, px.w, px.h);
  ctx.restore();
}

const glow: FrameEffectDef = {
  id: 'glow',
  name: 'Glow',
  category: 'Light',
  blurb: 'Highlights bloom softly, as if through a dreamy lens.',
  defaultMs: null,
  defaultIntensity: 0.6,
  params: [
    { kind: 'number', key: 'pulse', label: 'Pulse', min: 0, max: 100, default: 0, suffix: '%' },
  ],
  draw(ctx, s, io) {
    const pulseRate = s.params.num('pulse') / 100;
    const pulse = pulseRate > 0 ? 0.6 + 0.4 * Math.sin((s.t / 1000) * TAU * (0.3 + pulseRate * 1.5)) : 1;
    const a = s.env * s.intensity * pulse;
    if (a <= 0.002) return;
    // Twice: once wide and soft, once tighter — the way real bloom falls off.
    bloom(ctx, io, Math.min(1, a * 0.9), 'screen');
    bloom(ctx, io, Math.min(1, a * 0.45), 'lighter');
  },
};

const spotlight: FrameEffectDef = {
  id: 'spotlight',
  name: 'Spotlight',
  category: 'Light',
  blurb: 'Darkness, and a pool of light that wanders the frame.',
  defaultMs: null,
  defaultIntensity: 0.7,
  params: [size(100), speed(100)],
  draw(ctx, s) {
    const a = visible(s);
    if (a <= 0.002) return;
    const { w, h } = s.design;
    const secs = (s.t / 1000) * (s.params.num('speed') / 100);
    const cx = w * (0.5 + 0.3 * Math.sin(secs * 0.5 + rand(s.seed, 0, 1) * TAU));
    const cy = h * (0.46 + 0.2 * Math.sin(secs * 0.37 + rand(s.seed, 0, 2) * TAU));
    const r = s.unit * 0.36 * (s.params.num('size') / 100);
    const g = ctx.createRadialGradient(cx, cy, r * 0.55, cx, cy, r * 1.6);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${(0.82 * a).toFixed(3)})`);
    ctx.save();
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  },
};

const shine: FrameEffectDef = {
  id: 'shine-sweep',
  name: 'Shine sweep',
  category: 'Light',
  blurb: 'A glossy band of light passing over the whole picture.',
  defaultMs: 1_400,
  defaultIntensity: 0.7,
  params: [
    { kind: 'number', key: 'repeats', label: 'Sweeps', min: 1, max: 6, step: 1, default: 1 },
    color('#ffffff'),
  ],
  draw(ctx, s) {
    const repeats = Math.max(1, Math.round(s.params.num('repeats')));
    const local = (s.p * repeats) % 1;
    const a = s.intensity * swell(local);
    if (a <= 0.002) return;
    const { w, h } = s.design;
    const diag = Math.hypot(w, h);
    const pos = lerp(-0.6, 0.6, (1 - Math.cos(Math.PI * local)) / 2) * diag;
    const band = s.unit * 0.22;
    const tint = s.params.color('color');

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-0.42);
    const g = ctx.createLinearGradient(pos - band, 0, pos + band, 0);
    g.addColorStop(0, withAlpha(tint, 0));
    g.addColorStop(0.5, withAlpha(tint, 0.55 * a));
    g.addColorStop(1, withAlpha(tint, 0));
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = g;
    ctx.fillRect(-diag, -diag, diag * 2, diag * 2);
    ctx.restore();
  },
};

const filmBurn: FrameEffectDef = {
  id: 'film-burn',
  name: 'Film burn',
  category: 'Light',
  blurb: 'An orange burn blooming from the edge — a classic transition accent.',
  defaultMs: 1_300,
  defaultIntensity: 0.9,
  params: [
    choice('edge', 'From', [
      { value: 'left', label: 'Left' }, { value: 'right', label: 'Right' },
      { value: 'top', label: 'Top' }, { value: 'bottom', label: 'Bottom' },
    ], 'right'),
    strength(80),
  ],
  draw(ctx, s) {
    const q = swell(s.p) * s.intensity * (s.params.num('strength') / 100);
    if (q <= 0.002) return;
    const { w, h } = s.design;
    const edge = s.params.str('edge');
    const drift = Math.sin(s.p * Math.PI * 1.3 + rand(s.seed, 0, 1) * TAU) * 0.15;
    const cx = edge === 'left' ? 0 : edge === 'right' ? w : w * (0.5 + drift);
    const cy = edge === 'top' ? 0 : edge === 'bottom' ? h : h * (0.5 + drift);
    const r = Math.max(w, h) * (0.15 + 1.05 * q);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, withAlpha('#fffbe8', Math.min(1, q * 1.2)));
    g.addColorStop(0.18, withAlpha('#ffd27a', q * 0.95));
    g.addColorStop(0.45, withAlpha('#ff6a00', q * 0.7));
    g.addColorStop(0.75, withAlpha('#a0140a', q * 0.35));
    g.addColorStop(1, withAlpha('#a0140a', 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // A second, smaller bloom off-centre, so it looks like fire and not like a gradient.
    const bx = cx + (edge === 'left' ? 1 : edge === 'right' ? -1 : 0) * w * 0.12;
    const by = cy + (edge === 'top' ? 1 : edge === 'bottom' ? -1 : 0) * h * 0.12 + h * 0.18 * drift;
    const b = ctx.createRadialGradient(bx, by, 0, bx, by, r * 0.5);
    b.addColorStop(0, withAlpha('#ffb347', q * 0.6));
    b.addColorStop(1, withAlpha('#ff6a00', 0));
    ctx.fillStyle = b;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  },
};

export const LIGHT: readonly FrameEffectDef[] = [
  lightLeak, lensFlare, lightRays, lightning, flash, glow, spotlight, shine, filmBurn,
];

export { bloom };
