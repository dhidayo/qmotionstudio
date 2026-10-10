import type { Ctx2D } from '@/core/types';
import { makeCanvas, context2d, type AnyCanvas } from '@/core/render/surface';
import { drawGrain } from '@/core/render/postFx';
import { withAlpha } from '@/core/render/paint';
import { choice, color, strength } from '../params';
import { between, rand } from '../random';
import type { FrameEffectDef, FrameIO, FrameSample } from '../types';

/**
 * Stylize: looks applied to the finished picture (D-100).
 *
 * Colour looks use blend modes rather than `ctx.filter`, which Safari's canvas
 * does not support and which would make an export on one browser differ from
 * the preview on another. A `saturation` fill of grey *is* black and white; a
 * `color` fill is a tint. Both are Baseline, cheap, and identical everywhere.
 *
 * The pixel looks — glitch, colour split, pixelate — read the frame back
 * through a scratch copy and draw it again, displaced.
 */

const visible = (s: FrameSample): number => s.env * s.intensity;

/** How strongly a one-shot look is applied at `p`, for its "in / out / dip / steady" setting. */
function shaped(s: FrameSample): number {
  const eased = (v: number): number => (1 - Math.cos(Math.PI * Math.max(0, Math.min(1, v)))) / 2;
  switch (s.params.str('mode')) {
    case 'in': return 1 - eased(s.p);
    case 'out': return eased(s.p);
    case 'dip': return Math.sin(Math.PI * s.p);
    default: return s.env;
  }
}

const modes = (fallback = 'dip') => choice('mode', 'Shape', [
  { value: 'dip', label: 'In and back out' },
  { value: 'in', label: 'Clears at the start' },
  { value: 'out', label: 'Builds to the end' },
  { value: 'steady', label: 'Steady' },
], fallback);

function desaturate(ctx: Ctx2D, s: FrameSample, amount: number): void {
  if (amount <= 0.002) return;
  ctx.save();
  ctx.globalCompositeOperation = 'saturation';
  ctx.globalAlpha = Math.min(1, amount);
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, s.design.w, s.design.h);
  ctx.restore();
}

function tint(ctx: Ctx2D, s: FrameSample, hex: string, amount: number, mode: GlobalCompositeOperation = 'color'): void {
  if (amount <= 0.002) return;
  ctx.save();
  ctx.globalCompositeOperation = mode;
  ctx.globalAlpha = Math.min(1, amount);
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, s.design.w, s.design.h);
  ctx.restore();
}

/** The red channel shifted against green and blue. */
export function rgbSplit(ctx: Ctx2D, io: FrameIO, dxPx: number, dyPx: number): void {
  if (Math.abs(dxPx) < 0.5 && Math.abs(dyPx) < 0.5) return;
  const { px } = io;

  // Each channel straight from the frame — no intermediate copy, which was a
  // whole extra frame of drawing on every one of these effects.
  const channel = (index: number, hex: string): AnyCanvas => {
    const out = io.scratch(index);
    out.ctx.drawImage(io.source, 0, 0, px.w, px.h, 0, 0, px.w, px.h);
    out.ctx.globalCompositeOperation = 'multiply';
    out.ctx.fillStyle = hex;
    out.ctx.fillRect(0, 0, px.w, px.h);
    out.ctx.globalCompositeOperation = 'destination-in';
    out.ctx.drawImage(io.source, 0, 0, px.w, px.h, 0, 0, px.w, px.h);
    out.ctx.globalCompositeOperation = 'source-over';
    return out.canvas;
  };
  const red = channel(1, '#ff0000');
  const rest = channel(2, '#00ffff');

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, px.w, px.h);
  ctx.drawImage(rest, 0, 0, px.w, px.h, 0, 0, px.w, px.h);
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(red, 0, 0, px.w, px.h, dxPx, dyPx, px.w, px.h);
  ctx.restore();
}

const blackWhite: FrameEffectDef = {
  id: 'black-white',
  name: 'Black & white',
  category: 'Stylize',
  blurb: 'Classic monochrome. Timeless, editorial, serious.',
  defaultMs: null,
  defaultIntensity: 1,
  params: [{ kind: 'number', key: 'contrast', label: 'Contrast', min: 0, max: 100, default: 30, suffix: '%' }],
  draw(ctx, s) {
    const a = visible(s);
    desaturate(ctx, s, a);
    const contrast = (s.params.num('contrast') / 100) * a;
    if (contrast > 0.002) tint(ctx, s, '#808080', contrast * 0.5, 'overlay');
  },
};

const sepia: FrameEffectDef = {
  id: 'sepia',
  name: 'Sepia',
  category: 'Stylize',
  blurb: 'Warm old-photograph brown.',
  defaultMs: null,
  defaultIntensity: 0.85,
  params: [],
  draw(ctx, s) {
    const a = visible(s);
    desaturate(ctx, s, a);
    tint(ctx, s, '#9a6b3b', a * 0.6);
  },
};

const colorTint: FrameEffectDef = {
  id: 'tint',
  name: 'Colour tint',
  category: 'Stylize',
  blurb: 'Wash the whole picture in one colour — your brand, a mood.',
  defaultMs: null,
  defaultIntensity: 0.45,
  params: [color('#ff9a5c')],
  draw(ctx, s) {
    const a = visible(s);
    const hex = s.params.color('color');
    tint(ctx, s, hex, a * 0.55, 'color');
    tint(ctx, s, hex, a * 0.35, 'soft-light');
  },
};

const DUOTONES: Readonly<Record<string, readonly [string, string]>> = {
  sunset: ['#2b1055', '#ffd36e'],
  ocean: ['#04395e', '#7af0d4'],
  neon: ['#1a0b3d', '#ff5fc8'],
  forest: ['#10301e', '#d8f3a4'],
};

const duotone: FrameEffectDef = {
  id: 'duotone',
  name: 'Duotone',
  category: 'Stylize',
  blurb: 'Two colours, shadows in one and light in the other. Very poster.',
  defaultMs: null,
  defaultIntensity: 1,
  params: [choice('pair', 'Colours', [
    { value: 'sunset', label: 'Purple & gold' }, { value: 'ocean', label: 'Navy & mint' },
    { value: 'neon', label: 'Ink & pink' }, { value: 'forest', label: 'Pine & lime' },
    { value: 'brand', label: 'Your colours' },
  ])],
  draw(ctx, s) {
    const a = visible(s);
    if (a <= 0.002) return;
    const name = s.params.str('pair');
    const [dark, light] = name === 'brand'
      ? [s.palette.bg, s.palette.accent]
      : DUOTONES[name] ?? ['#2b1055', '#ffd36e'];
    desaturate(ctx, s, a);
    tint(ctx, s, dark, a, 'screen');
    tint(ctx, s, light, a, 'multiply');
  },
};

const glitch: FrameEffectDef = {
  id: 'glitch',
  name: 'Glitch',
  category: 'Stylize',
  blurb: 'Digital tearing and colour shifts in sharp bursts.',
  defaultMs: 800,
  defaultIntensity: 0.8,
  params: [strength(60),
    { kind: 'number', key: 'rate', label: 'How often', min: 10, max: 100, default: 55, suffix: '%' }],
  draw(ctx, s, io) {
    const a = s.intensity * (s.params.num('strength') / 100);
    if (a <= 0.002 || s.env <= 0.05) return;
    const tick = Math.floor(s.t / 70);
    if (rand(s.seed, tick, 1) > (s.params.num('rate') / 100) * Math.max(0.3, s.env)) return;

    const { px } = io;
    if (rand(s.seed, tick, 2) < 0.6) rgbSplit(ctx, io, px.w * 0.012 * a * (rand(s.seed, tick, 3) < 0.5 ? -1 : 1), 0);

    const copy = io.scratch(0);
    copy.ctx.drawImage(io.source, 0, 0, px.w, px.h, 0, 0, px.w, px.h);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const slices = 2 + Math.floor(rand(s.seed, tick, 4) * 6);
    for (let i = 0; i < slices; i++) {
      const y = Math.floor(rand(s.seed, tick * 13 + i, 5) * px.h);
      const hgt = Math.max(2, Math.floor(px.h * between(s.seed, tick * 13 + i, 6, 0.008, 0.1)));
      const dx = (rand(s.seed, tick * 13 + i, 7) - 0.5) * px.w * 0.14 * a;
      ctx.drawImage(copy.canvas, 0, y, px.w, hgt, dx, y, px.w, hgt);
    }
    // A couple of blocks of pure colour, the giveaway of a broken signal.
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 2; i++) {
      if (rand(s.seed, tick * 5 + i, 8) < 0.5) continue;
      ctx.fillStyle = i === 0 ? 'rgba(0,255,213,0.5)' : 'rgba(255,0,168,0.5)';
      ctx.fillRect(
        rand(s.seed, tick * 5 + i, 9) * px.w, rand(s.seed, tick * 5 + i, 10) * px.h,
        px.w * between(s.seed, tick * 5 + i, 11, 0.04, 0.2), px.h * between(s.seed, tick * 5 + i, 12, 0.005, 0.03),
      );
    }
    ctx.restore();
  },
};

const split: FrameEffectDef = {
  id: 'rgb-split',
  name: 'Colour split',
  category: 'Stylize',
  blurb: 'Red pulled away from blue and green — energetic, a little edgy.',
  defaultMs: null,
  defaultIntensity: 0.6,
  params: [
    { kind: 'number', key: 'pulse', label: 'Pulse', min: 0, max: 100, default: 40, suffix: '%' },
  ],
  draw(ctx, s, io) {
    const pulseRate = s.params.num('pulse') / 100;
    const pulse = pulseRate > 0 ? 0.5 + 0.5 * Math.sin((s.t / 1000) * Math.PI * 2 * (0.5 + pulseRate * 2)) : 1;
    const a = s.env * s.intensity * pulse;
    rgbSplit(ctx, io, io.px.w * 0.012 * a, io.px.h * 0.002 * a);
  },
};

let scanlineTile: AnyCanvas | null = null;

function scanlines(ctx: Ctx2D, io: FrameIO, alpha: number): void {
  if (!scanlineTile) {
    scanlineTile = makeCanvas(1, 4);
    const t = context2d(scanlineTile);
    if (!t) return;
    t.fillStyle = 'rgba(0,0,0,0.6)';
    t.fillRect(0, 2, 1, 2);
  }
  const pattern = ctx.createPattern(scanlineTile, 'repeat');
  if (!pattern) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, io.px.w, io.px.h);
  ctx.restore();
}

const vhs: FrameEffectDef = {
  id: 'vhs',
  name: 'VHS',
  category: 'Stylize',
  blurb: 'Tape-era scanlines, colour bleed and a rolling tracking band.',
  defaultMs: null,
  defaultIntensity: 0.8,
  params: [],
  draw(ctx, s, io) {
    const a = visible(s);
    if (a <= 0.002) return;
    rgbSplit(ctx, io, io.px.w * 0.0045 * a, 0);
    desaturate(ctx, s, a * 0.3);
    tint(ctx, s, '#4a2dff', a * 0.08, 'soft-light');

    // The tracking band rolls down the picture, smearing what it passes over.
    const { px } = io;
    const bandH = px.h * 0.05;
    const y = ((s.t * 0.00018) % 1.4 - 0.2) * px.h;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const jitter = (rand(s.seed, Math.floor(s.t / 50), 1) - 0.5) * px.w * 0.03 * a;
    const top = Math.max(0, Math.floor(y));
    const hgt = Math.max(1, Math.min(px.h - top, Math.floor(bandH)));
    if (hgt > 1 && top < px.h) {
      // Only the band is copied — the rest of the frame is not touched.
      const band = io.scratch(0);
      band.ctx.drawImage(io.source, 0, top, px.w, hgt, 0, 0, px.w, hgt);
      ctx.drawImage(band.canvas, 0, 0, px.w, hgt, jitter, top, px.w, hgt);
    }
    ctx.fillStyle = `rgba(255,255,255,${(0.08 * a).toFixed(3)})`;
    ctx.fillRect(0, top, px.w, hgt);
    ctx.restore();

    scanlines(ctx, io, 0.35 * a);
    drawGrain(ctx, s.design, 0.3 * a, s.t);
  },
};

const oldFilm: FrameEffectDef = {
  id: 'old-film',
  name: 'Old film',
  category: 'Stylize',
  blurb: 'Faded, flickering, scratched — a reel from another decade.',
  defaultMs: null,
  defaultIntensity: 0.85,
  params: [],
  camera(s) {
    const a = s.env * s.intensity;
    const k = Math.floor(s.t / 42);
    return {
      x: (rand(s.seed, k, 21) - 0.5) * s.unit * 0.003 * a,
      y: (rand(s.seed, k, 22) - 0.5) * s.unit * 0.005 * a,
      scale: 1,
      rotation: 0,
    };
  },
  draw(ctx, s) {
    const a = visible(s);
    if (a <= 0.002) return;
    const { w, h } = s.design;
    const u = s.unit;
    desaturate(ctx, s, a * 0.85);
    tint(ctx, s, '#a77b4f', a * 0.45);

    const k = Math.floor(s.t / 42);
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${((0.04 + rand(s.seed, k, 1) * 0.12) * a).toFixed(3)})`;
    ctx.fillRect(0, 0, w, h);

    // Scratches: a few fine vertical lines, a new set every frame of film.
    const scratches = Math.floor(rand(s.seed, k, 2) * 3);
    for (let i = 0; i < scratches; i++) {
      const x = rand(s.seed, k * 7 + i, 3) * w;
      ctx.strokeStyle = rand(s.seed, k * 7 + i, 4) < 0.5 ? `rgba(255,248,230,${(0.35 * a).toFixed(3)})` : `rgba(20,12,4,${(0.35 * a).toFixed(3)})`;
      ctx.lineWidth = u * 0.0012;
      ctx.beginPath();
      ctx.moveTo(x, rand(s.seed, k * 7 + i, 5) * h * 0.4);
      ctx.lineTo(x + (rand(s.seed, k * 7 + i, 6) - 0.5) * u * 0.01, h * (0.6 + rand(s.seed, k * 7 + i, 7) * 0.4));
      ctx.stroke();
    }
    // Dust specks.
    for (let i = 0; i < 6; i++) {
      if (rand(s.seed, k * 11 + i, 8) < 0.5) continue;
      ctx.fillStyle = `rgba(25,15,5,${(0.5 * a).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(rand(s.seed, k * 11 + i, 9) * w, rand(s.seed, k * 11 + i, 10) * h, u * between(s.seed, k * 11 + i, 11, 0.001, 0.004), 0, Math.PI * 2);
      ctx.fill();
    }
    // Burnt-in corners.
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) / 2);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(20,10,0,${(0.6 * a).toFixed(3)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    drawGrain(ctx, s.design, 0.45 * a, s.t);
  },
};

const fade: FrameEffectDef = {
  id: 'fade',
  name: 'Fade to colour',
  category: 'Stylize',
  blurb: 'Dip to black (or white, or your colour) and back — or fade in, or out.',
  defaultMs: 1_000,
  defaultIntensity: 1,
  params: [color('#000000'), modes()],
  draw(ctx, s) {
    const a = shaped(s) * s.intensity;
    if (a <= 0.002) return;
    ctx.save();
    ctx.fillStyle = withAlpha(s.params.color('color'), a);
    ctx.fillRect(0, 0, s.design.w, s.design.h);
    ctx.restore();
  },
};

const pixelate: FrameEffectDef = {
  id: 'pixelate',
  name: 'Pixelate',
  category: 'Stylize',
  blurb: 'Breaks the picture into blocks — a reveal, a censor, a retro moment.',
  defaultMs: 1_000,
  defaultIntensity: 0.8,
  params: [modes()],
  draw(ctx, s, io) {
    const a = shaped(s) * s.intensity;
    if (a <= 0.02) return;
    const { px } = io;
    const block = Math.max(1, Math.round(1 + px.w * 0.06 * a));
    if (block <= 1) return;
    const sw = Math.max(1, Math.round(px.w / block));
    const sh = Math.max(1, Math.round(px.h / block));
    const small = io.scratch(0);
    small.ctx.drawImage(io.source, 0, 0, px.w, px.h, 0, 0, sw, sh);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.globalCompositeOperation = 'copy';
    ctx.drawImage(small.canvas, 0, 0, sw, sh, 0, 0, px.w, px.h);
    ctx.restore();
  },
};

const softFocus: FrameEffectDef = {
  id: 'soft-focus',
  name: 'Soft focus',
  category: 'Stylize',
  blurb: 'A dreamy haze over the picture — or a focus pull in and out.',
  defaultMs: null,
  defaultIntensity: 0.6,
  params: [modes('steady')],
  draw(ctx, s, io) {
    const a = shaped(s) * s.intensity;
    if (a <= 0.002) return;
    const { px } = io;
    const mid = io.scratch(1);
    const mw = Math.max(2, Math.round(px.w / 4));
    const mh = Math.max(2, Math.round(px.h / 4));
    mid.ctx.drawImage(io.source, 0, 0, px.w, px.h, 0, 0, mw, mh);
    const small = io.scratch(0);
    const sw = Math.max(2, Math.round(px.w / 12));
    const sh = Math.max(2, Math.round(px.h / 12));
    small.ctx.drawImage(mid.canvas, 0, 0, mw, mh, 0, 0, sw, sh);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = Math.min(1, a * 0.85);
    ctx.drawImage(small.canvas, 0, 0, sw, sh, 0, 0, px.w, px.h);
    ctx.restore();
  },
};

export const STYLIZE: readonly FrameEffectDef[] = [
  blackWhite, sepia, colorTint, duotone, fade, softFocus, glitch, split, vhs, oldFilm, pixelate,
];
