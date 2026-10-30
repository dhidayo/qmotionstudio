import { colorFill, roleFill, type Ctx2D } from '@/core/types';
import { between, rand } from '@/core/effects/random';
import type { StickerDef } from './types';
import {
  AMBER, RED, TAU, bump, circlePath, cursorPath, cycle, deg, easeInOutSine, easeOutBack, easeOutCubic, faded,
  gloss, labelOf, lerp, ring, seg, smoothstep, sparklePath, springOut, strokeSpan, wrap,
} from './kit';

/**
 * Pointers (D-158): things that send the eye somewhere — an arrow, a tapping
 * hand, a clicking cursor, a swipe-up cue, a scribbled circle — and a little
 * celebration: sparkles and confetti.
 */

/**
 * A rounded rectangle traced clockwise as one more sub-path of the current
 * path, without starting a new one, so several pieces fill as one shape.
 */
function roundBox(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number): void {
  const q = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + q, y);
  ctx.lineTo(x + w - q, y);
  ctx.arc(x + w - q, y + q, q, -Math.PI / 2, 0);
  ctx.lineTo(x + w, y + h - q);
  ctx.arc(x + w - q, y + h - q, q, 0, Math.PI / 2);
  ctx.lineTo(x + q, y + h);
  ctx.arc(x + q, y + h - q, q, Math.PI / 2, Math.PI);
  ctx.lineTo(x, y + q);
  ctx.arc(x + q, y + q, q, Math.PI, Math.PI * 1.5);
  ctx.closePath();
}

/** A chunky arrow pointing right that darts towards its tip and eases back. */
export const pointerArrow: StickerDef = {
  id: 'pointer-arrow',
  name: 'Arrow pointer',
  category: 'Pointers',
  keywords: ['arrow', 'point', 'look', 'here', 'direction', 'next', 'right'],
  aspect: 1.6,
  size: 0.3,
  loopMs: 1000,
  posterMs: 300,
  primary: roleFill('accent'),
  secondary: colorFill('#FFFFFF'),
  flippable: true,
  draw(ctx, s) {
    const { w: W, h: H, p } = s;
    const u = H;
    // Back a little (anticipation), dart forward, ease home.
    const dx = p < 0.18
      ? -0.04 * easeInOutSine(p / 0.18)
      : p < 0.36
        ? lerp(-0.04, 0.12, easeOutCubic(seg(p, 0.18, 0.36)))
        : 0.12 * (1 - easeInOutSine(seg(p, 0.36, 1)));
    const stretch = 1 + 0.06 * bump(seg(p, 0.18, 0.5));
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(u, u);
    // Speed lines behind it as it darts.
    const speed = bump(seg(p, 0.2, 0.55));
    faded(ctx, speed, () => {
      ctx.beginPath();
      for (const [y, len] of [[-0.14, 0.18], [0.0, 0.26], [0.14, 0.18]] as const) {
        ctx.moveTo(-0.72 + dx * 0.4, y);
        ctx.lineTo(-0.72 + dx * 0.4 + len * speed, y);
      }
      ctx.strokeStyle = s.primary;
      ctx.lineCap = 'round';
      ctx.lineWidth = 0.045;
      ctx.stroke();
    });
    ctx.translate(dx, 0);
    ctx.scale(stretch, 1 / Math.sqrt(stretch));
    ctx.beginPath();
    ctx.moveTo(-0.5, -0.13);
    ctx.lineTo(0.12, -0.13);
    ctx.lineTo(0.12, -0.36);
    ctx.lineTo(0.66, 0);
    ctx.lineTo(0.12, 0.36);
    ctx.lineTo(0.12, 0.13);
    ctx.lineTo(-0.5, 0.13);
    ctx.closePath();
    ctx.lineJoin = 'round';
    ctx.fillStyle = s.primary;
    ctx.fill();
    ctx.strokeStyle = s.primary;
    ctx.lineWidth = 0.1;
    ctx.stroke();
    gloss(ctx, -0.4, 0.05, 0.3);
    // A highlight along the shaft.
    ctx.beginPath();
    ctx.moveTo(-0.44, -0.06);
    ctx.lineTo(0.06, -0.06);
    ctx.save();
    ctx.globalAlpha *= 0.4;
    ctx.strokeStyle = s.secondary;
    ctx.lineCap = 'round';
    ctx.lineWidth = 0.04;
    ctx.stroke();
    ctx.restore();
    ctx.restore();
  },
};

/** A pointing hand, outlined so it reads on anything, that taps and sends out rings. */
export const pointerHand: StickerDef = {
  id: 'pointer-hand',
  name: 'Tap here',
  category: 'Pointers',
  keywords: ['tap', 'hand', 'finger', 'press', 'touch', 'click', 'here', 'point'],
  aspect: 0.9,
  size: 0.26,
  loopMs: 1400,
  posterMs: 380,
  primary: colorFill('#FFFFFF'),
  secondary: roleFill('accent'),
  draw(ctx, s) {
    const { w: W, h: H, p } = s;
    const k = Math.min(W, H);
    const press = easeInOutSine(seg(p, 0.12, 0.26)) * (1 - springOut(seg(p, 0.3, 0.7), 1.1, 4.5));
    const tip = { x: -0.04, y: -0.25 };
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(k, k);
    // Rings from the fingertip, after the tap.
    for (let i = 0; i < 2; i++) {
      const age = seg(p, 0.26 + i * 0.12, 0.86 + i * 0.12);
      if (age <= 0 || age >= 1) continue;
      faded(ctx, (1 - age) ** 1.5, () => {
        circlePath(ctx, tip.x, tip.y, 0.06 + 0.2 * easeOutCubic(age));
        ctx.strokeStyle = s.secondary;
        ctx.lineWidth = 0.035 * (1 - age * 0.5);
        ctx.stroke();
      });
    }
    // The press dot under the finger.
    faded(ctx, bump(seg(p, 0.2, 0.5)), () => {
      circlePath(ctx, tip.x, tip.y, 0.05);
      ctx.fillStyle = s.secondary;
      ctx.fill();
    });
    ctx.translate(0, 0.04 * press);
    ctx.scale(1 - 0.05 * press, 1 - 0.05 * press);
    ctx.translate(0.05, 0.09);
    ctx.scale(0.78, 0.78);
    ctx.beginPath();
    roundBox(ctx, -0.14, -0.48, 0.16, 0.6, 0.08);
    roundBox(ctx, 0.02, -0.15, 0.14, 0.32, 0.07);
    roundBox(ctx, 0.16, -0.11, 0.13, 0.3, 0.065);
    roundBox(ctx, 0.29, -0.05, 0.11, 0.25, 0.055);
    roundBox(ctx, -0.2, 0.02, 0.6, 0.34, 0.13);
    ctx.save();
    ctx.translate(-0.13, 0.12);
    ctx.rotate(deg(-38));
    roundBox(ctx, -0.22, -0.065, 0.26, 0.13, 0.065);
    ctx.restore();
    roundBox(ctx, -0.15, 0.38, 0.5, 0.12, 0.03);
    // Outline first, then the fill over it, so the pieces read as one hand.
    ctx.lineJoin = 'round';
    ctx.strokeStyle = s.onPrimary;
    ctx.lineWidth = 0.07;
    ctx.stroke();
    ctx.fillStyle = s.primary;
    ctx.fill();
    // Knuckle lines between the curled fingers.
    ctx.beginPath();
    for (const x of [0.02, 0.16, 0.29]) {
      ctx.moveTo(x, x === 0.02 ? -0.02 : 0.0);
      ctx.lineTo(x, 0.1);
    }
    ctx.strokeStyle = s.onPrimary;
    ctx.lineCap = 'round';
    ctx.lineWidth = 0.03;
    ctx.stroke();
    ctx.restore();
  },
};

/** A mouse pointer that comes in, clicks — lines flick out from its tip, a ring spreads — and drifts back. */
export const clickCursor: StickerDef = {
  id: 'click-cursor',
  name: 'Click',
  category: 'Pointers',
  keywords: ['click', 'cursor', 'mouse', 'pointer', 'press', 'link', 'here'],
  aspect: 0.8,
  size: 0.22,
  loopMs: 1200,
  posterMs: 470,
  primary: colorFill('#FFFFFF'),
  secondary: roleFill('accent'),
  draw(ctx, s) {
    const { w: W, h: H, p } = s;
    const k = Math.min(W, H);
    const arrive = p < 0.85 ? easeOutCubic(seg(p, 0, 0.3)) : 1 - easeInOutSine(seg(p, 0.85, 1));
    const press = easeOutCubic(seg(p, 0.3, 0.36)) * (1 - springOut(seg(p, 0.36, 0.62), 1.1, 4.5));
    const tip = { x: W * 0.36, y: H * 0.36 };
    ctx.save();
    ctx.translate(tip.x, tip.y);
    ctx.scale(k, k);
    const ringAge = seg(p, 0.34, 0.8);
    if (ringAge > 0 && ringAge < 1) {
      faded(ctx, (1 - ringAge) ** 1.5, () => {
        circlePath(ctx, 0, 0, 0.05 + 0.22 * easeOutCubic(ringAge));
        ctx.strokeStyle = s.secondary;
        ctx.lineWidth = 0.035;
        ctx.stroke();
      });
    }
    // Click lines flicking out above and to the left of the tip.
    const flick = seg(p, 0.34, 0.62);
    if (flick > 0 && flick < 1) {
      const out = easeOutCubic(flick);
      ctx.beginPath();
      for (const a of [deg(-180), deg(-135), deg(-90)]) {
        const r0 = 0.08 + 0.1 * out;
        const r1 = r0 + 0.12 * (1 - flick);
        ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
        ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
      }
      ctx.strokeStyle = s.secondary;
      ctx.lineCap = 'round';
      ctx.lineWidth = 0.045;
      ctx.stroke();
    }
    ctx.translate(lerp(0.2, 0, arrive), lerp(0.24, 0, arrive));
    const squeeze = 1 - 0.12 * press;
    ctx.scale(squeeze, squeeze);
    cursorPath(ctx, 0.62);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = s.onPrimary;
    ctx.lineWidth = 0.06;
    ctx.stroke();
    ctx.fillStyle = s.primary;
    ctx.fill();
    ctx.restore();
  },
};

/** Three four-point sparkles that twinkle in turn, and a few glints between them. */
export const sparkles: StickerDef = {
  id: 'sparkles',
  name: 'Sparkles',
  category: 'Pointers',
  keywords: ['sparkle', 'shine', 'magic', 'new', 'clean', 'glitter', 'stars', 'special'],
  aspect: 1,
  size: 0.22,
  loopMs: 1600,
  posterMs: 200,
  primary: colorFill(AMBER),
  secondary: colorFill('#FFFFFF'),
  draw(ctx, s) {
    const k = Math.min(s.w, s.h);
    const p = s.p;
    ctx.save();
    ctx.translate(s.w / 2, s.h / 2);
    ctx.scale(k, k);
    const stars: readonly (readonly [number, number, number, number])[] = [
      [-0.1, 0.06, 0.3, 0], [0.24, -0.22, 0.16, 0.33], [0.25, 0.27, 0.11, 0.66],
    ];
    for (const [x, y, r, phase] of stars) {
      const twinkle = bump(wrap(p - phase, 1));
      const scale = 0.62 + 0.38 * twinkle;
      const turn = deg(12) * cycle(p, 1, phase);
      sparklePath(ctx, x, y, r * scale, turn, 0.16);
      ctx.fillStyle = s.primary;
      ctx.fill();
      gloss(ctx, y - r, y + r * 0.2, 0.35);
      sparklePath(ctx, x, y, r * scale * 0.42, turn, 0.2);
      ctx.save();
      ctx.globalAlpha *= 0.5 + 0.5 * twinkle;
      ctx.fillStyle = s.secondary;
      ctx.fill();
      ctx.restore();
    }
    // Tiny glints that blink between the stars.
    for (let i = 0; i < 3; i++) {
      const a = bump(wrap(p * 2 - rand(s.seed, i, 5), 1));
      faded(ctx, a, () => {
        circlePath(ctx, between(s.seed, i, 6, -0.38, 0.38), between(s.seed, i, 7, -0.38, 0.38), 0.025 * a);
        ctx.fillStyle = s.primary;
        ctx.fill();
      });
    }
    ctx.restore();
  },
};

/**
 * Confetti falling and turning. Each piece falls a whole number of times a
 * loop, sways and spins a whole number of times, and fades at the top and
 * bottom of the box, so the loop has no seam.
 */
export const confetti: StickerDef = {
  id: 'confetti',
  name: 'Confetti',
  category: 'Pointers',
  keywords: ['confetti', 'party', 'celebrate', 'congrats', 'birthday', 'win', 'launch', 'celebration'],
  aspect: 1,
  size: 0.4,
  loopMs: 2400,
  posterMs: 600,
  primary: roleFill('accent'),
  secondary: colorFill(AMBER),
  draw(ctx, s) {
    const { w: W, h: H, p, seed } = s;
    const k = Math.min(W, H);
    const colours = [s.primary, s.secondary, s.primary, s.secondary, '#FF4D79', '#2EC4B6'];
    ctx.save();
    for (let i = 0; i < 26; i++) {
      const falls = 1 + Math.floor(rand(seed, i, 1) * 2);
      const yn = wrap(rand(seed, i, 2) + p * falls, 1);
      const a = smoothstep(0, 0.1, yn) * (1 - smoothstep(0.85, 1, yn));
      if (a <= 0.001) continue;
      const x = rand(seed, i, 3) * W + Math.sin(TAU * (p * (1 + (i % 2)) + rand(seed, i, 4))) * k * 0.05;
      const y = lerp(-0.02, 1.02, yn) * H;
      const spin = TAU * wrap(rand(seed, i, 5) + p * (i % 3 === 0 ? -1 : 1) * (1 + (i % 2)), 1);
      const flip = Math.cos(TAU * (p * (1 + (i % 3)) + rand(seed, i, 6)));
      const size = k * between(seed, i, 7, 0.035, 0.055);
      faded(ctx, a, () => {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(spin);
        ctx.scale(1, 0.25 + 0.75 * Math.abs(flip));
        ctx.fillStyle = colours[i % colours.length] ?? s.primary;
        const kind = i % 3;
        if (kind === 0) ctx.fillRect(-size, -size * 0.45, size * 2, size * 0.9);
        else if (kind === 1) {
          circlePath(ctx, 0, 0, size * 0.62);
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.moveTo(0, -size * 0.75);
          ctx.lineTo(size * 0.7, size * 0.5);
          ctx.lineTo(-size * 0.7, size * 0.5);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      });
    }
    ctx.restore();
  },
};

/** Chevrons that light from the bottom up, over the words "Swipe up". */
export const swipeUp: StickerDef = {
  id: 'swipe-up',
  name: 'Swipe up',
  category: 'Pointers',
  keywords: ['swipe', 'up', 'link', 'more', 'scroll', 'story', 'chevron', 'arrow'],
  aspect: 0.8,
  size: 0.26,
  loopMs: 1400,
  posterMs: 400,
  labels: [{ key: 'label', name: 'Words', text: 'Swipe up', maxChars: 16 }],
  primary: roleFill('ink'),
  secondary: roleFill('accent'),
  draw(ctx, s) {
    const { w: W, h: H, p } = s;
    const u = H;
    const bob = -0.02 * cycle(p, 1);
    ctx.save();
    ctx.translate(W / 2, 0);
    for (let i = 0; i < 3; i++) {
      // Bottom first: chevron 2 is lowest.
      const lit = bump(seg(wrap(p - (2 - i) * 0.16, 1), 0, 0.5));
      const y = (0.14 + i * 0.15 - 0.035 * lit + bob) * u;
      const half = 0.2 * u;
      ctx.beginPath();
      ctx.moveTo(-half, y + half * 0.55);
      ctx.lineTo(0, y);
      ctx.lineTo(half, y + half * 0.55);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 0.065 * u;
      faded(ctx, 0.35 + 0.65 * (1 - lit), () => {
        ctx.strokeStyle = s.primary;
        ctx.stroke();
      });
      faded(ctx, lit, () => {
        ctx.strokeStyle = s.secondary;
        ctx.stroke();
      });
    }
    s.text(labelOf(s.labels, 'label', 'Swipe up'), 0, (0.82 + bob * 0.5) * u, W * 0.96, 0.15 * u, s.primary);
    ctx.restore();
  },
};

/** A hand-drawn curved arrow that draws itself on, its head snapping in at the end. */
export const arrowCurve: StickerDef = {
  id: 'arrow-curve',
  name: 'Drawn arrow',
  category: 'Pointers',
  keywords: ['arrow', 'curved', 'drawn', 'scribble', 'look', 'here', 'point', 'hand drawn'],
  aspect: 1.2,
  size: 0.3,
  loopMs: 2400,
  posterMs: 1200,
  primary: colorFill(RED),
  secondary: colorFill('#000000'),
  flippable: true,
  draw(ctx, s) {
    const { w: W, h: H, p } = s;
    const u = H;
    // Drawn on at the start of the loop; wiped from the tail at the very end.
    const on = easeInOutSine(seg(p, 0, 0.32));
    const off = easeInOutSine(seg(p, 0.9, 1));
    const head = easeOutBack(seg(p, 0.28, 0.4), 2);
    const nudge = 0.025 * ring(seg(p, 0.4, 0.8), 1.5, 2.5);
    // The curve as points, from the tail at lower left to the tip at upper right.
    const n = 24;
    const pts: [number, number][] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = lerp(-0.46, 0.36, t) + 0.05 * Math.sin(t * Math.PI);
      const y = 0.3 - 0.62 * t + 0.36 * Math.sin(t * Math.PI) * (1 - t * 0.4);
      pts.push([x * u, y * u]);
    }
    const stroke = (dx: number, dy: number, color: string, alpha: number): void => {
      faded(ctx, alpha, () => {
        ctx.save();
        ctx.translate(dx, dy);
        strokeSpan(ctx, pts, off, on);
        ctx.strokeStyle = color;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 0.075 * u;
        ctx.stroke();
        const tip = pts[n] ?? [0, 0];
        const before = pts[n - 2] ?? [0, 0];
        if (head > 0 && off < 0.95) {
          const a = Math.atan2(tip[1] - before[1], tip[0] - before[0]);
          const len = 0.2 * u * head;
          ctx.beginPath();
          ctx.moveTo(tip[0] + Math.cos(a + deg(150)) * len, tip[1] + Math.sin(a + deg(150)) * len);
          ctx.lineTo(tip[0], tip[1]);
          ctx.lineTo(tip[0] + Math.cos(a - deg(150)) * len, tip[1] + Math.sin(a - deg(150)) * len);
          ctx.stroke();
        }
        ctx.restore();
      });
    };
    ctx.save();
    ctx.translate(W / 2 + nudge * u, H / 2 - nudge * u);
    stroke(0.02 * u, 0.03 * u, s.secondary, 0.22);
    stroke(0, 0, s.primary, 1);
    ctx.restore();
  },
};

/** A marker circle scribbled round something, overshooting where it closes, as on a thumbnail. */
export const circleScribble: StickerDef = {
  id: 'circle-scribble',
  name: 'Scribbled circle',
  category: 'Pointers',
  keywords: ['circle', 'scribble', 'highlight', 'drawn', 'marker', 'look', 'thumbnail', 'ring'],
  aspect: 1.6,
  size: 0.44,
  loopMs: 2400,
  posterMs: 1200,
  primary: colorFill(RED),
  secondary: colorFill('#000000'),
  draw(ctx, s) {
    const { w: W, h: H, p } = s;
    const on = easeInOutSine(seg(p, 0, 0.3));
    const off = easeInOutSine(seg(p, 0.9, 1));
    const pulse = 1 + 0.02 * bump(seg(p, 0.3, 0.6));
    const n = 48;
    const pts: [number, number][] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      // A little over one turn, the radius drifting so the ends do not meet.
      const a = deg(200) + t * TAU * 1.12;
      const drift = 1 - 0.07 * t + 0.03 * Math.sin(t * TAU * 2);
      pts.push([Math.cos(a) * W * 0.44 * drift, Math.sin(a) * H * 0.4 * drift]);
    }
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(deg(-4));
    ctx.scale(pulse, pulse);
    const lw = Math.min(W, H) * 0.06;
    for (const [dx, dy, color, alpha] of [[lw * 0.3, lw * 0.4, s.secondary, 0.2], [0, 0, s.primary, 1]] as const) {
      faded(ctx, alpha, () => {
        ctx.save();
        ctx.translate(dx, dy);
        strokeSpan(ctx, pts, off, on);
        ctx.strokeStyle = color;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = lw;
        ctx.stroke();
        ctx.restore();
      });
    }
    ctx.restore();
  },
};

export const POINTERS: readonly StickerDef[] = [
  pointerArrow, pointerHand, clickCursor, swipeUp, arrowCurve, circleScribble, sparkles, confetti,
];
