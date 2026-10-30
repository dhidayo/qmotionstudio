import { colorFill, type Ctx2D } from '@/core/types';
import { withAlpha } from '@/core/render/paint';
import type { StickerDef, StickerSample } from './types';
import {
  AMBER, FACE_INK, RED, TAU, bump, circlePath, cycle, deg, drawFace, easeInOutSine, easeOutCubic, faded,
  heartPath, lerp, ring, seg, sparklePath, springOut, tearPath, wrap,
} from './kit';

/**
 * Reactions (D-158): round faces that laugh, gasp, love, cry, fume and play
 * it cool. Drawn with paths and gradients, never an emoji glyph — emoji fonts
 * differ by device and the export worker may have none. The face is the main
 * colour; features are a warm dark brown so they read on any face colour.
 */

/** The face's radius as a share of the sticker's box. */
const R = 0.4;

/** Moves to the sticker's centre in units of its shorter side. */
function centre(ctx: Ctx2D, s: StickerSample): void {
  const k = Math.min(s.w, s.h);
  ctx.translate(s.w / 2, s.h / 2);
  ctx.scale(k, k);
}

/** Two dark oval eyes with a catch-light, `open` 0 (shut) to 1. */
function eyes(ctx: Ctx2D, y: number, spread: number, rx: number, ry: number, open = 1): void {
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * spread, y, rx, Math.max(0.004, ry * open), 0, 0, TAU);
    ctx.fillStyle = FACE_INK;
    ctx.fill();
    if (open > 0.5) {
      circlePath(ctx, side * spread + rx * 0.3, y - ry * 0.4 * open, rx * 0.32);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fill();
    }
  }
}

/** Brows as short round strokes at height `y`; `angle` tilts the inner ends (+ worried, − cross). */
function brows(ctx: Ctx2D, y: number, spread: number, half: number, angle: number, curve = 0.02): void {
  ctx.beginPath();
  for (const side of [-1, 1]) {
    const cx = side * spread;
    const dy = Math.sin(angle) * half;
    // Inner end is the one nearer the middle.
    ctx.moveTo(cx - side * half, y - dy);
    ctx.quadraticCurveTo(cx, y - curve, cx + side * half, y + dy);
  }
  ctx.strokeStyle = FACE_INK;
  ctx.lineCap = 'round';
  ctx.lineWidth = 0.032;
  ctx.stroke();
}

/** An open grin: a flat top, a round bottom, a tongue and a strip of teeth. */
function grin(ctx: Ctx2D, y: number, half: number, depth: number, tongue: string): void {
  const mouth = (): void => {
    ctx.beginPath();
    ctx.moveTo(-half, y);
    ctx.quadraticCurveTo(0, y + depth * 0.12, half, y);
    ctx.bezierCurveTo(half * 0.9, y + depth * 0.9, -half * 0.9, y + depth * 0.9, -half, y);
    ctx.closePath();
  };
  mouth();
  ctx.fillStyle = FACE_INK;
  ctx.fill();
  ctx.save();
  mouth();
  ctx.clip();
  ctx.beginPath();
  ctx.ellipse(0, y + depth * 0.82, half * 0.55, depth * 0.36, 0, 0, TAU);
  ctx.fillStyle = tongue;
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(-half, y - depth * 0.1, half * 2, depth * 0.26);
  ctx.restore();
}

/** Laughing so hard it cries: shakes with each laugh, squeezed-shut eyes, tears flying out. */
export const reactLaugh: StickerDef = {
  id: 'react-laugh',
  name: 'Laughing',
  category: 'Reactions',
  keywords: ['laugh', 'funny', 'lol', 'haha', 'joy', 'tears', 'face', 'reaction'],
  aspect: 1,
  size: 0.22,
  loopMs: 1200,
  posterMs: 150,
  primary: colorFill(AMBER),
  secondary: colorFill('#4FC3F7'),
  draw(ctx, s) {
    const p = s.p;
    // Two laughs a loop; each one shakes and bounces the face.
    const beat = bump(wrap(p * 2, 1));
    const tilt = deg(7) * cycle(p, 6) * (0.35 + 0.65 * beat);
    const lift = -0.025 * beat;
    ctx.save();
    centre(ctx, s);
    ctx.translate(0, lift);
    ctx.rotate(tilt);
    drawFace(ctx, R, s.primary);
    // Eyes squeezed shut: upturned arcs.
    ctx.beginPath();
    for (const side of [-1, 1]) {
      ctx.moveTo(side * 0.2 - 0.075, -0.07);
      ctx.quadraticCurveTo(side * 0.2, -0.15 - 0.01 * beat, side * 0.2 + 0.075, -0.07);
    }
    ctx.strokeStyle = FACE_INK;
    ctx.lineCap = 'round';
    ctx.lineWidth = 0.04;
    ctx.stroke();
    grin(ctx, 0.04, 0.24, 0.26 + 0.04 * beat, '#E85A70');
    // Tears from the outer corner of each eye, a pair each laugh.
    for (const side of [-1, 1]) {
      for (let i = 0; i < 2; i++) {
        const age = wrap(p * 2 - i * 0.5 - 0.05, 1);
        const a = Math.min(1, age / 0.12) * (1 - seg(age, 0.6, 0.9));
        if (a <= 0.001) continue;
        const x = side * (0.28 + 0.2 * easeOutCubic(age));
        const y = -0.07 - 0.08 * age + 0.36 * age * age;
        faded(ctx, a, () => {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(side * (deg(-60) + deg(110) * age));
          tearPath(ctx, 0, 0, 0.1 + 0.03 * age);
          ctx.fillStyle = s.secondary;
          ctx.fill();
          ctx.restore();
        });
      }
    }
    ctx.restore();
  },
};

/** Wow: brows jump, eyes widen, the mouth makes an O that pulses. */
export const reactWow: StickerDef = {
  id: 'react-wow',
  name: 'Wow',
  category: 'Reactions',
  keywords: ['wow', 'surprised', 'shock', 'amazed', 'omg', 'face', 'reaction'],
  aspect: 1,
  size: 0.22,
  loopMs: 1400,
  posterMs: 500,
  primary: colorFill(AMBER),
  secondary: colorFill('#3A2219'),
  draw(ctx, s) {
    const p = s.p;
    const gasp = springOut(seg(p, 0.08, 0.4), 1.2, 4) * (1 - easeInOutSine(seg(p, 0.78, 0.98)));
    const breathe = 1 + 0.06 * cycle(p, 2) * gasp;
    ctx.save();
    centre(ctx, s);
    ctx.scale(1 - 0.03 * gasp, 1 + 0.04 * gasp);
    drawFace(ctx, R, s.primary);
    brows(ctx, -0.2 - 0.06 * gasp, 0.15, 0.07, deg(-8) - deg(6) * gasp, 0.04);
    eyes(ctx, -0.06, 0.15, 0.05 + 0.012 * gasp, 0.068 + 0.02 * gasp);
    ctx.beginPath();
    ctx.ellipse(0, 0.19, (0.07 + 0.03 * gasp) * breathe, (0.075 + 0.05 * gasp) * breathe, 0, 0, TAU);
    ctx.fillStyle = s.secondary;
    ctx.fill();
    ctx.restore();
  },
};

/** Heart eyes: a big smile, and two hearts for eyes that beat in turn. */
export const reactLove: StickerDef = {
  id: 'react-love',
  name: 'Heart eyes',
  category: 'Reactions',
  keywords: ['love', 'heart eyes', 'crush', 'adore', 'face', 'reaction', 'heart'],
  aspect: 1,
  size: 0.22,
  loopMs: 1200,
  posterMs: 120,
  primary: colorFill(AMBER),
  secondary: colorFill(RED),
  draw(ctx, s) {
    const p = s.p;
    const beat = (u: number): number => 1 + 0.22 * bump(seg(u, 0, 0.36));
    const sway = deg(4) * cycle(p, 1);
    ctx.save();
    centre(ctx, s);
    ctx.rotate(sway);
    drawFace(ctx, R, s.primary);
    grin(ctx, 0.08, 0.22, 0.22, '#E85A70');
    for (const side of [-1, 1]) {
      const scale = beat(side < 0 ? p : wrap(p - 0.5, 1));
      ctx.save();
      ctx.translate(side * 0.16, -0.08);
      ctx.rotate(side * deg(8));
      ctx.scale(scale, scale);
      heartPath(ctx, 0, 0, 0.2);
      ctx.fillStyle = s.secondary;
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(-0.045, -0.035, 0.022, 0.013, deg(-35), 0, TAU);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  },
};

/** Sad: worried brows, a wobbling frown, and a tear that wells up, runs down and falls. */
export const reactSad: StickerDef = {
  id: 'react-sad',
  name: 'Sad',
  category: 'Reactions',
  keywords: ['sad', 'cry', 'tear', 'upset', 'sorry', 'miss', 'face', 'reaction'],
  aspect: 1,
  size: 0.22,
  loopMs: 2000,
  posterMs: 700,
  primary: colorFill(AMBER),
  secondary: colorFill('#4FC3F7'),
  draw(ctx, s) {
    const p = s.p;
    const sniff = ring(seg(p, 0.62, 0.9), 2, 2);
    ctx.save();
    centre(ctx, s);
    ctx.translate(0, 0.012 * sniff);
    drawFace(ctx, R, s.primary);
    brows(ctx, -0.2, 0.15, 0.07, deg(22), -0.01);
    eyes(ctx, -0.06, 0.15, 0.05, 0.06);
    // The frown, trembling a little.
    ctx.beginPath();
    ctx.moveTo(-0.13, 0.22);
    ctx.quadraticCurveTo(0, 0.1 + 0.012 * sniff, 0.13, 0.22);
    ctx.strokeStyle = FACE_INK;
    ctx.lineCap = 'round';
    ctx.lineWidth = 0.04;
    ctx.stroke();
    // The tear: wells at the eye, runs down the cheek, drops off.
    const well = easeInOutSine(seg(p, 0.05, 0.3));
    const run = easeInOutSine(seg(p, 0.3, 0.62));
    const drop = seg(p, 0.62, 0.92);
    const size = 0.05 + 0.06 * well;
    const x = 0.2 + 0.02 * run;
    const y = -0.01 + 0.24 * run + 0.4 * drop * drop;
    const a = Math.min(1, well * 3) * (1 - seg(drop, 0.4, 1));
    faded(ctx, a, () => {
      tearPath(ctx, x, y, size);
      ctx.fillStyle = s.secondary;
      ctx.fill();
      circlePath(ctx, x - size * 0.1, y + size * 0.12, size * 0.1);
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fill();
    });
    ctx.restore();
  },
};

/** Angry: red rises from the chin, the brows clamp down, and the face trembles. */
export const reactAngry: StickerDef = {
  id: 'react-angry',
  name: 'Angry',
  category: 'Reactions',
  keywords: ['angry', 'mad', 'furious', 'rage', 'annoyed', 'face', 'reaction'],
  aspect: 1,
  size: 0.22,
  loopMs: 1000,
  posterMs: 500,
  primary: colorFill(AMBER),
  secondary: colorFill(RED),
  draw(ctx, s) {
    const p = s.p;
    const heat = 0.45 + 0.4 * bump(p);
    const shake = 0.012 * cycle(p, 14) * heat;
    ctx.save();
    centre(ctx, s);
    ctx.translate(shake, 0);
    drawFace(ctx, R, s.primary);
    // The red, rising from the chin.
    ctx.save();
    circlePath(ctx, 0, 0, R);
    ctx.clip();
    const top = lerp(R, -R, heat);
    const g = ctx.createLinearGradient(0, top, 0, R);
    g.addColorStop(0, withAlpha(s.secondary, 0));
    g.addColorStop(0.45, s.secondary);
    g.addColorStop(1, s.secondary);
    ctx.globalAlpha *= 0.9;
    ctx.fillStyle = g;
    ctx.fillRect(-R, top, R * 2, R - top);
    ctx.restore();
    brows(ctx, -0.15, 0.15, 0.08, deg(-24), 0);
    eyes(ctx, -0.04, 0.145, 0.045, 0.045);
    // A tight, downturned mouth.
    ctx.beginPath();
    ctx.moveTo(-0.11, 0.21);
    ctx.quadraticCurveTo(0, 0.14, 0.11, 0.21);
    ctx.strokeStyle = FACE_INK;
    ctx.lineCap = 'round';
    ctx.lineWidth = 0.04;
    ctx.stroke();
    ctx.restore();
  },
};

/** Cool: sunglasses slide down from the brow, a glint sweeps the lenses, then they go back up. */
export const reactCool: StickerDef = {
  id: 'react-cool',
  name: 'Cool',
  category: 'Reactions',
  keywords: ['cool', 'sunglasses', 'awesome', 'chill', 'boss', 'face', 'reaction'],
  aspect: 1,
  size: 0.22,
  loopMs: 2200,
  posterMs: 1100,
  primary: colorFill(AMBER),
  secondary: colorFill('#1E1E24'),
  draw(ctx, s) {
    const p = s.p;
    const down = p < 0.6 ? springOut(seg(p, 0.06, 0.32), 1.1, 4.5) : 1 - easeInOutSine(seg(p, 0.82, 0.97));
    const nod = 0.02 * ring(seg(p, 0.18, 0.5), 1, 3);
    ctx.save();
    centre(ctx, s);
    ctx.translate(0, nod);
    drawFace(ctx, R, s.primary);
    // Eyes behind the glasses, seen while the glasses are up.
    eyes(ctx, -0.06, 0.15, 0.045, 0.055);
    // A smirk.
    ctx.beginPath();
    ctx.moveTo(-0.12, 0.17);
    ctx.quadraticCurveTo(0.02, 0.27, 0.15, 0.13);
    ctx.strokeStyle = FACE_INK;
    ctx.lineCap = 'round';
    ctx.lineWidth = 0.04;
    ctx.stroke();
    // The glasses: from up on the brow to over the eyes.
    const y = lerp(-0.25, -0.07, down);
    const lens = (side: number): void => {
      const cx = side * 0.15;
      ctx.beginPath();
      ctx.moveTo(cx - 0.12, y - 0.055);
      ctx.lineTo(cx + 0.12, y - 0.055);
      ctx.quadraticCurveTo(cx + 0.12, y + 0.1, cx, y + 0.1);
      ctx.quadraticCurveTo(cx - 0.12, y + 0.1, cx - 0.12, y - 0.055);
      ctx.closePath();
    };
    ctx.beginPath();
    ctx.moveTo(-0.34, y - 0.045);
    ctx.lineTo(0.34, y - 0.045);
    ctx.strokeStyle = s.secondary;
    ctx.lineWidth = 0.035;
    ctx.stroke();
    for (const side of [-1, 1]) {
      lens(side);
      ctx.fillStyle = s.secondary;
      ctx.fill();
    }
    // The glint across both lenses once they are on.
    const sweep = seg(p, 0.38, 0.6);
    if (sweep > 0 && sweep < 1) {
      ctx.save();
      ctx.beginPath();
      for (const side of [-1, 1]) {
        const cx = side * 0.15;
        ctx.rect(cx - 0.12, y - 0.06, 0.24, 0.17);
      }
      ctx.clip();
      const x = lerp(-0.4, 0.4, easeInOutSine(sweep));
      ctx.beginPath();
      ctx.moveTo(x, y - 0.07);
      ctx.lineTo(x + 0.035, y - 0.07);
      ctx.lineTo(x - 0.045, y + 0.12);
      ctx.lineTo(x - 0.08, y + 0.12);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fill();
      ctx.restore();
    }
    const twinkle = bump(seg(p, 0.5, 0.7));
    faded(ctx, twinkle, () => {
      sparklePath(ctx, 0.27, y - 0.06, 0.06 * (0.5 + 0.5 * twinkle), 0, 0.18);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
    });
    ctx.restore();
  },
};

export const REACTIONS: readonly StickerDef[] = [reactLaugh, reactWow, reactLove, reactSad, reactAngry, reactCool];
