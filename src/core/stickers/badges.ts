import { colorFill, roleFill, type Ctx2D } from '@/core/types';
import { between, rand } from '@/core/effects/random';
import type { StickerDef, StickerSample } from './types';
import {
  AMBER, RED, SHINE, TAU, bump, burstLines, circlePath, cycle, deg, easeInOutSine, easeOutBack, easeOutCubic,
  faded, gloss, labelOf, lerp, ring, roundedRect, seg, smoothstep, sparklePath, starPath, strokeOn, wrap,
} from './kit';

/**
 * Badges (D-158): the seals and tags that call something out — NEW, SALE,
 * LIVE, a tick, a flame. Like every sticker they never vanish inside their
 * loop: an Image rests on whatever moment it stops at, so every moment has to
 * show the badge whole.
 */

/**
 * A starburst seal: a back burst in the second colour, counter-turning, and
 * the front burst in the main one, each turning one point's step per loop so
 * the loop has no seam. Words stay level.
 */
function drawSeal(ctx: Ctx2D, s: StickerSample, points: number, pulse: number, swing: number): void {
  const k = Math.min(s.w, s.h);
  const step = TAU / points;
  ctx.save();
  ctx.translate(s.w / 2, s.h / 2);
  ctx.scale(k, k);
  ctx.rotate(swing);
  ctx.scale(pulse, pulse);
  ctx.lineJoin = 'round';
  starPath(ctx, 0, 0, 0.49, 0.41, points, step / 2 - s.p * step);
  ctx.fillStyle = s.secondary;
  ctx.fill();
  starPath(ctx, 0, 0, 0.45, 0.37, points, s.p * step);
  ctx.fillStyle = s.primary;
  ctx.fill();
  ctx.strokeStyle = s.primary;
  ctx.lineWidth = 0.02;
  ctx.stroke();
  circlePath(ctx, 0, 0, 0.37);
  gloss(ctx, -0.45, 0.1, 0.18);
  // A fine ring inside the edge, as on a printed seal.
  circlePath(ctx, 0, 0, 0.31);
  ctx.save();
  ctx.globalAlpha *= 0.45;
  ctx.strokeStyle = s.onPrimary;
  ctx.lineWidth = 0.012;
  ctx.setLineDash([0.025, 0.02]);
  ctx.stroke();
  ctx.restore();
  ctx.restore();
}

/** The word on a seal, level whatever the burst does. */
function sealWords(s: StickerSample, main: string, sub: string | null, scale: number, swing: number, ctx: Ctx2D): void {
  const k = Math.min(s.w, s.h);
  ctx.save();
  ctx.translate(s.w / 2, s.h / 2);
  ctx.rotate(swing);
  ctx.scale(scale, scale);
  if (sub === null) {
    s.text(main, 0, k * 0.01, k * 0.5, k * 0.2, s.onPrimary);
  } else {
    s.text(main, 0, -k * 0.045, k * 0.5, k * 0.17, s.onPrimary);
    s.text(sub, 0, k * 0.12, k * 0.44, k * 0.085, s.onPrimary);
  }
  ctx.restore();
}

/** The seal's beat: a quick swell with a little settle, once a loop. */
const sealPulse = (p: number): number => 1 + 0.07 * ring(seg(p, 0, 0.45), 1.5, 3) / 0.8;

export const burstNew: StickerDef = {
  id: 'burst-new',
  name: 'NEW burst',
  category: 'Badges',
  keywords: ['new', 'burst', 'seal', 'badge', 'launch', 'fresh', 'starburst'],
  aspect: 1,
  size: 0.26,
  loopMs: 2000,
  posterMs: 1400,
  labels: [{ key: 'label', name: 'Words', text: 'NEW', maxChars: 6 }],
  primary: roleFill('accent'),
  secondary: colorFill(AMBER),
  draw(ctx, s) {
    const pulse = sealPulse(s.p);
    drawSeal(ctx, s, 16, pulse, 0);
    sealWords(s, labelOf(s.labels, 'label', 'NEW'), null, 1 + (pulse - 1) * 1.6, 0, ctx);
  },
};

export const burstSale: StickerDef = {
  id: 'burst-sale',
  name: 'SALE burst',
  category: 'Badges',
  keywords: ['sale', 'offer', 'discount', 'deal', 'percent', 'off', 'price', 'burst', 'seal'],
  aspect: 1,
  size: 0.28,
  loopMs: 2000,
  posterMs: 1400,
  labels: [
    { key: 'label', name: 'Words', text: 'SALE', maxChars: 6 },
    { key: 'sub', name: 'Small words', text: '50% OFF', maxChars: 10 },
  ],
  primary: colorFill(RED),
  secondary: colorFill('#FFFFFF'),
  draw(ctx, s) {
    // A shop sign's wobble: a tilt that swings and settles each loop.
    const swing = deg(9) * ring(seg(s.p, 0.02, 0.62), 2, 2.4);
    const pulse = sealPulse(s.p);
    drawSeal(ctx, s, 14, pulse, swing);
    sealWords(s, labelOf(s.labels, 'label', 'SALE'), labelOf(s.labels, 'sub', '50% OFF'), pulse, swing, ctx);
  },
};

/** A plump star that throws out rays and glints, then settles. */
export const starBurst: StickerDef = {
  id: 'star-burst',
  name: 'Star burst',
  category: 'Badges',
  keywords: ['star', 'favourite', 'favorite', 'best', 'top', 'rating', 'shine', 'award'],
  aspect: 1,
  size: 0.24,
  loopMs: 1500,
  posterMs: 900,
  primary: colorFill(AMBER),
  secondary: colorFill('#FFFFFF'),
  draw(ctx, s) {
    const k = Math.min(s.w, s.h);
    const p = s.p;
    const squash = easeInOutSine(seg(p, 0, 0.14));
    const pop = 1 - 0.08 * squash * (1 - seg(p, 0.14, 0.15)) + 0.12 * ring(seg(p, 0.14, 0.7), 1.3, 3) / 0.8;
    const turn = deg(8) * ring(seg(p, 0.14, 0.8), 1, 2);
    ctx.save();
    ctx.translate(s.w / 2, s.h / 2);
    ctx.scale(k, k);
    ctx.strokeStyle = s.primary;
    ctx.lineCap = 'round';
    ctx.lineWidth = 0.035;
    burstLines(ctx, 0, 0, 0.36, 0.12, 10, seg(p, 0.15, 0.6), TAU / 20);
    ctx.rotate(turn);
    ctx.scale(pop, pop);
    ctx.lineJoin = 'round';
    starPath(ctx, 0, 0.015, 0.36, 0.17, 5);
    ctx.fillStyle = s.primary;
    ctx.fill();
    ctx.strokeStyle = s.primary;
    ctx.lineWidth = 0.07;
    ctx.stroke();
    gloss(ctx, -0.36, 0.2, 0.3);
    // A bevel: a lighter star inside.
    starPath(ctx, 0, 0.015, 0.2, 0.095, 5);
    ctx.fillStyle = SHINE;
    ctx.fill();
    const glint = bump(seg(p, 0.18, 0.62));
    if (glint > 0.001) {
      ctx.save();
      ctx.globalAlpha *= glint;
      sparklePath(ctx, -0.13, -0.11, 0.09 * (0.5 + 0.5 * glint), deg(20) * glint, 0.18);
      ctx.fillStyle = s.secondary;
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  },
};

/**
 * A green tick in a circle. The circle is always there; once a loop it pulses
 * and the tick draws itself on again, so whatever moment a picture rests on
 * shows it ticked or ticking.
 */
export const check: StickerDef = {
  id: 'check',
  name: 'Check tick',
  category: 'Badges',
  keywords: ['tick', 'done', 'yes', 'correct', 'approved', 'check'],
  aspect: 1,
  loopMs: 2200,
  posterMs: 1200,
  primary: colorFill('#2E7D32'),
  secondary: colorFill('#FFFFFF'),
  draw(ctx, s) {
    const k = Math.min(s.w, s.h);
    const p = s.p;
    // 0.86–1 the tick wipes away; 0–0.3 it draws on as the circle pops.
    const on = p >= 0.86 ? 1 - easeInOutSine(seg(p, 0.86, 0.98)) : easeOutCubic(seg(p, 0.06, 0.32));
    const pop = 1 + 0.1 * ring(seg(p, 0, 0.5), 1.4, 3) / 0.8;
    ctx.save();
    ctx.translate(s.w / 2, s.h / 2);
    ctx.scale(k, k);
    ctx.scale(pop, pop);
    circlePath(ctx, 0, 0, 0.45);
    ctx.fillStyle = s.primary;
    ctx.fill();
    gloss(ctx, -0.45, 0.1, 0.2);
    // The ring that goes out as the tick lands.
    const wave = seg(p, 0.2, 0.6);
    if (wave > 0 && wave < 1) {
      ctx.save();
      ctx.globalAlpha *= 0.5 * (1 - wave);
      circlePath(ctx, 0, 0, 0.36 + 0.06 * easeOutCubic(wave));
      ctx.strokeStyle = s.secondary;
      ctx.lineWidth = 0.02;
      ctx.stroke();
      ctx.restore();
    }
    strokeOn(ctx, [[-0.2, 0.01], [-0.055, 0.155], [0.215, -0.135]], on);
    ctx.lineWidth = 0.075;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = s.secondary;
    ctx.stroke();
    ctx.restore();
  },
};

/** A LIVE tag: a dot that beats with rings going out from it. */
export const live: StickerDef = {
  id: 'live',
  name: 'LIVE',
  category: 'Badges',
  keywords: ['live', 'broadcast', 'stream', 'on air', 'now', 'recording'],
  aspect: 2.6,
  size: 0.34,
  loopMs: 1400,
  posterMs: 300,
  labels: [{ key: 'label', name: 'Words', text: 'LIVE', maxChars: 10 }],
  primary: colorFill(RED),
  secondary: colorFill('#FFFFFF'),
  draw(ctx, s) {
    const { w: W, h: H, p } = s;
    const bh = H * 0.8;
    const by = (H - bh) / 2;
    const bx = W * 0.02;
    const bw = W * 0.96;
    const r = bh * 0.28;
    const dot = { x: bx + bh * 0.55, y: by + bh / 2, r: bh * 0.15 };
    ctx.save();
    roundedRect(ctx, bx, by, bw, bh, r);
    ctx.fillStyle = s.primary;
    ctx.fill();
    gloss(ctx, by, by + bh * 0.8, 0.18);
    ctx.save();
    roundedRect(ctx, bx, by, bw, bh, r);
    ctx.clip();
    ctx.strokeStyle = s.secondary;
    ctx.lineWidth = bh * 0.045;
    for (let i = 0; i < 2; i++) {
      const age = wrap(p - i * 0.5, 1);
      // Each ring fades in as it is born, so a new one never pops.
      faded(ctx, 0.85 * smoothstep(0, 0.08, age) * (1 - age) ** 2, () => {
        circlePath(ctx, dot.x, dot.y, dot.r * (1.2 + 1.9 * easeOutCubic(age)));
        ctx.stroke();
      });
    }
    ctx.restore();
    const beat = 1 + 0.16 * bump(wrap(p * 2, 1));
    circlePath(ctx, dot.x, dot.y, dot.r * beat);
    ctx.fillStyle = s.secondary;
    ctx.fill();
    const textL = bx + bh * 0.95;
    const textR = bx + bw - bh * 0.3;
    s.text(labelOf(s.labels, 'label', 'LIVE'), (textL + textR) / 2, by + bh / 2 + bh * 0.02, textR - textL, bh * 0.46, s.onPrimary);
    ctx.restore();
  },
};

/**
 * A flame that flickers: tongues swayed by sines that repeat a whole number
 * of times a loop, an inner flame in the second colour, a hot core, and
 * embers rising.
 */
export const fire: StickerDef = {
  id: 'fire',
  name: 'Hot',
  category: 'Badges',
  keywords: ['fire', 'hot', 'flame', 'trending', 'popular', 'lit', 'burn'],
  aspect: 0.8,
  size: 0.26,
  loopMs: 1000,
  posterMs: 0,
  primary: colorFill('#FF5722'),
  secondary: colorFill(AMBER),
  draw(ctx, s) {
    const { w: W, h: H, p } = s;
    const k = Math.min(W, H / 1.25);
    const flame = (scale: number, phase: number): void => {
      const sway = 0.06 * cycle(p, 2, phase) + 0.025 * cycle(p, 3, phase + 0.3);
      const tall = 1 + 0.06 * cycle(p, 4, phase + 0.1);
      const left = 0.06 * cycle(p, 3, phase + 0.55);
      const right = 0.06 * cycle(p, 2, phase + 0.8);
      const pt = (x: number, y: number): [number, number] => [x * scale, y * scale * (y < -0.45 ? tall : 1)];
      ctx.beginPath();
      ctx.moveTo(...pt(0, 0));
      ctx.bezierCurveTo(...pt(-0.4, 0), ...pt(-0.46, -0.3), ...pt(-0.36, -0.5));
      ctx.bezierCurveTo(...pt(-0.32, -0.58), ...pt(-0.3 + left, -0.66 - left), ...pt(-0.3 + left, -0.74 - left));
      ctx.bezierCurveTo(...pt(-0.2, -0.66), ...pt(-0.14, -0.62), ...pt(-0.12, -0.62));
      ctx.bezierCurveTo(...pt(-0.14, -0.8), ...pt(-0.04 + sway, -0.9), ...pt(sway, -1));
      ctx.bezierCurveTo(...pt(0.1 + sway * 0.5, -0.86), ...pt(0.22, -0.8), ...pt(0.2, -0.68));
      ctx.bezierCurveTo(...pt(0.26, -0.7), ...pt(0.3 + right, -0.72 - right), ...pt(0.32 + right, -0.78 - right));
      ctx.bezierCurveTo(...pt(0.46, -0.6), ...pt(0.44, -0.3), ...pt(0.4, -0.2));
      ctx.bezierCurveTo(...pt(0.36, -0.06), ...pt(0.24, 0), ...pt(0, 0));
      ctx.closePath();
    };
    ctx.save();
    ctx.translate(W / 2, H / 2 + k * 0.56);
    ctx.scale(k, k);
    // Embers.
    for (let i = 0; i < 4; i++) {
      const age = wrap(p * (i % 2 === 0 ? 1 : 2) + rand(s.seed, i, 3), 1);
      const x = between(s.seed, i, 4, -0.26, 0.26) + 0.03 * Math.sin(age * TAU);
      ctx.save();
      ctx.globalAlpha *= smoothstep(0, 0.2, age) * (1 - smoothstep(0.6, 1, age));
      circlePath(ctx, x, lerp(-0.7, -1.1, age), 0.022 * (1 - age * 0.5));
      ctx.fillStyle = s.secondary;
      ctx.fill();
      ctx.restore();
    }
    flame(1, 0);
    ctx.fillStyle = s.primary;
    ctx.fill();
    const glow = ctx.createLinearGradient(0, -1, 0, 0);
    glow.addColorStop(0, 'rgba(0,0,0,0.12)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fill();
    ctx.translate(0, -0.02);
    flame(0.66, 0.4);
    ctx.fillStyle = s.secondary;
    ctx.fill();
    ctx.translate(0, -0.01);
    flame(0.34, 0.7);
    ctx.fillStyle = 'rgba(255,255,240,0.75)';
    ctx.fill();
    ctx.restore();
  },
};

/** A LIMITED tag, slightly tilted, with a shine sweeping across it. */
export const limited: StickerDef = {
  id: 'limited',
  name: 'Limited tag',
  category: 'Badges',
  keywords: ['limited', 'offer', 'last chance', 'exclusive', 'few left', 'tag', 'label', 'hurry'],
  aspect: 2.8,
  size: 0.4,
  loopMs: 2400,
  posterMs: 0,
  labels: [{ key: 'label', name: 'Words', text: 'LIMITED', maxChars: 14 }],
  primary: roleFill('ink'),
  secondary: roleFill('accent'),
  draw(ctx, s) {
    const { w: W, h: H, p } = s;
    const bh = H * 0.66;
    const bw = W * 0.88;
    const nudge = 1 + 0.05 * ring(seg(p, 0, 0.4), 1.5, 3) / 0.8;
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(deg(-4));
    ctx.scale(nudge, nudge);
    const tag = (): void => {
      // A luggage-tag point on the left.
      const x0 = -bw / 2;
      const y0 = -bh / 2;
      const r = bh * 0.14;
      ctx.beginPath();
      ctx.moveTo(x0 + bh * 0.42, y0);
      ctx.lineTo(bw / 2 - r, y0);
      ctx.arcTo(bw / 2, y0, bw / 2, y0 + r, r);
      ctx.lineTo(bw / 2, bh / 2 - r);
      ctx.arcTo(bw / 2, bh / 2, bw / 2 - r, bh / 2, r);
      ctx.lineTo(x0 + bh * 0.42, bh / 2);
      ctx.lineTo(x0, 0);
      ctx.closePath();
    };
    // A shadow of the tag in the second colour, offset like a print misregister.
    ctx.save();
    ctx.translate(bh * 0.08, bh * 0.1);
    tag();
    ctx.fillStyle = s.secondary;
    ctx.fill();
    ctx.restore();
    tag();
    ctx.fillStyle = s.primary;
    ctx.fill();
    ctx.save();
    ctx.clip();
    const sweep = easeInOutSine(seg(p, 0.35, 0.75));
    if (sweep > 0 && sweep < 1) {
      const x = lerp(-bw * 0.75, bw * 0.75, sweep);
      ctx.beginPath();
      ctx.moveTo(x - bh * 0.3, -bh);
      ctx.lineTo(x + bh * 0.05, -bh);
      ctx.lineTo(x - bh * 0.25, bh);
      ctx.lineTo(x - bh * 0.6, bh);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fill();
    }
    ctx.restore();
    // The hole of the tag.
    circlePath(ctx, -bw / 2 + bh * 0.3, 0, bh * 0.07);
    ctx.fillStyle = s.secondary;
    ctx.fill();
    const textL = -bw / 2 + bh * 0.5;
    const textR = bw / 2 - bh * 0.22;
    s.text(labelOf(s.labels, 'label', 'LIMITED'), (textL + textR) / 2, bh * 0.02, textR - textL, bh * 0.44, s.onPrimary);
    ctx.restore();
  },
};

/** Five stars filling one after another, a rating landing, then a glint. */
export const rating: StickerDef = {
  id: 'rating',
  name: 'Five stars',
  category: 'Badges',
  keywords: ['rating', 'stars', 'review', 'five', '5', 'score', 'testimonial', 'quality'],
  aspect: 4.2,
  size: 0.5,
  loopMs: 2600,
  posterMs: 1600,
  primary: colorFill(AMBER),
  secondary: roleFill('inkMuted'),
  draw(ctx, s) {
    const { w: W, h: H, p } = s;
    const gap = W / 5;
    const r = Math.min(gap * 0.44, H * 0.44);
    ctx.save();
    ctx.lineJoin = 'round';
    for (let i = 0; i < 5; i++) {
      const cx = gap * (i + 0.5);
      const cy = H / 2;
      // Each star fills in turn, and all five empty together near the end.
      const fill = p >= 0.88 ? 1 - easeInOutSine(seg(p, 0.88, 0.98)) : easeOutBack(seg(p, 0.06 + i * 0.07, 0.16 + i * 0.07), 2.2);
      ctx.save();
      ctx.translate(cx, cy);
      starPath(ctx, 0, r * 0.06, r, r * 0.48, 5);
      ctx.save();
      ctx.globalAlpha *= 0.35;
      ctx.fillStyle = s.secondary;
      ctx.fill();
      ctx.restore();
      if (fill > 0.001) {
        ctx.scale(fill, fill);
        starPath(ctx, 0, r * 0.06, r, r * 0.48, 5);
        ctx.fillStyle = s.primary;
        ctx.fill();
        ctx.strokeStyle = s.primary;
        ctx.lineWidth = r * 0.14;
        ctx.stroke();
        gloss(ctx, -r, r * 0.4, 0.3);
      }
      ctx.restore();
    }
    // A glint across the last star once the row is full.
    const glint = bump(seg(p, 0.46, 0.7));
    if (glint > 0.001) {
      ctx.save();
      ctx.globalAlpha *= glint;
      sparklePath(ctx, gap * 4.5 + r * 0.45, H / 2 - r * 0.55, r * 0.42 * (0.5 + 0.5 * glint), deg(25) * glint, 0.18);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  },
};

export const BADGES: readonly StickerDef[] = [burstNew, burstSale, starBurst, check, live, fire, limited, rating];
