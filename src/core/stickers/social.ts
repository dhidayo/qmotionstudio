import { colorFill, roleFill } from '@/core/types';
import { onAccent } from '@/core/render/paint';
import { between, rand } from '@/core/effects/random';
import type { StickerDef } from './types';
import {
  AMBER, RED, SHADE, SHINE, TAU, faded, gloss, bellBodyPath, bellClapperPath, bellKnobPath, bellLipPath, bump, burstLines, circlePath,
  cursorPath, deg, drawThumb, easeInOutCubic, easeInOutSine, easeOutBack, easeOutCubic, heartPath,
  labelOf, lerp, ring, roundedRect, seg, smoothstep, sparklePath, springOut, wrap,
} from './kit';

/**
 * Social stickers (D-158): the buttons and marks people put on a post to ask
 * for a follow, a like or a share. All generic — a red button, a thumbs-up, a
 * heart — never a platform's logo, wordmark or exact colours.
 */

/**
 * The red Subscribe button. A pointer glides in, the button lights, the
 * click pushes it down onto its base and a ripple spreads; it turns grey and
 * reads SUBSCRIBED while the bell rings; the pointer leaves, and it turns
 * back to red for the next pass.
 */
export const subscribe: StickerDef = {
  id: 'subscribe',
  name: 'Subscribe button',
  category: 'Social',
  keywords: ['subscribe', 'button', 'bell', 'channel', 'join', 'notify', 'click'],
  aspect: 3.2,
  size: 0.56,
  loopMs: 3000,
  posterMs: 820,
  labels: [
    { key: 'label', name: 'Button words', text: 'SUBSCRIBE', maxChars: 14 },
    { key: 'done', name: 'Words once clicked', text: 'SUBSCRIBED', maxChars: 14 },
  ],
  primary: colorFill(RED),
  secondary: colorFill('#56565E'),
  draw(ctx, s) {
    const { w: W, h: H, p } = s;
    const bx = W * 0.025;
    const bw = W * 0.95;
    const bh = H * 0.62;
    const by = H * 0.08;
    const depth = H * 0.075;
    const r = bh / 2;
    const doneInk = onAccent(s.secondary);

    // The click: down at 0.30, back up with a little bounce.
    const pressIn = easeOutCubic(seg(p, 0.3, 0.335));
    const release = springOut(seg(p, 0.335, 0.52), 1.2, 4.5);
    const down = depth * 0.8 * pressIn * (1 - release);
    // Grey from the click until the reset near the end of the loop.
    const into = easeInOutSine(seg(p, 0.335, 0.43));
    const back = easeInOutSine(seg(p, 0.86, 0.96));
    const done = into * (1 - back);
    const hover = smoothstep(0.22, 0.3, p) * (1 - smoothstep(0.3, 0.34, p));
    const faceY = by + down;

    ctx.save();
    // Base: the button's darker underside, which the click pushes it onto.
    roundedRect(ctx, bx, by + depth, bw, bh, r);
    ctx.fillStyle = s.primary;
    ctx.fill();
    if (done > 0) {
      ctx.save();
      ctx.globalAlpha *= done;
      ctx.fillStyle = s.secondary;
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fill();

    // Face.
    roundedRect(ctx, bx, faceY, bw, bh, r);
    ctx.fillStyle = s.primary;
    ctx.fill();
    if (done > 0) {
      ctx.save();
      ctx.globalAlpha *= done;
      ctx.fillStyle = s.secondary;
      ctx.fill();
      ctx.restore();
    }
    gloss(ctx, faceY, faceY + bh * 0.7, 0.16 + hover * 0.14);

    // The ripple from the click, inside the face.
    const tip = { x: W * 0.79, y: H * 0.47 };
    const rip = seg(p, 0.335, 0.62);
    if (rip > 0 && rip < 1) {
      ctx.save();
      roundedRect(ctx, bx, faceY, bw, bh, r);
      ctx.clip();
      circlePath(ctx, tip.x, tip.y, easeOutCubic(rip) * bw * 0.5);
      ctx.fillStyle = `rgba(255,255,255,${0.3 * (1 - rip) ** 1.5})`;
      ctx.fill();
      ctx.restore();
    }

    // The bell, which rings once subscribed.
    const bellSize = bh * 0.5;
    const bellX = bx + bh * 0.62;
    const swing = deg(30) * ring(seg(p, 0.37, 0.84), 3, 2.4);
    ctx.save();
    ctx.translate(bellX, faceY + bh / 2 - bellSize * 0.5);
    ctx.rotate(swing);
    const drawBell = (color: string): void => {
      ctx.fillStyle = color;
      bellClapperPath(ctx, bellSize, -swing * 0.25);
      ctx.fill();
      bellBodyPath(ctx, bellSize);
      ctx.fill();
      bellLipPath(ctx, bellSize);
      ctx.fill();
      bellKnobPath(ctx, bellSize);
      ctx.fill();
    };
    if (doneInk === s.onPrimary) {
      drawBell(s.onPrimary);
    } else {
      faded(ctx, 1 - done, () => { drawBell(s.onPrimary); });
      faded(ctx, done, () => { drawBell(doneInk); });
    }
    ctx.restore();

    // The words roll up when they change: out of the top, in from below.
    const textL = bx + bh * 1.02;
    const textR = bx + bw - bh * 0.42;
    const cx = (textL + textR) / 2;
    const cy = faceY + bh / 2;
    const maxW = textR - textL;
    const sizePx = bh * 0.36;
    const slide = bh * 0.55;
    const first = p < 0.6;
    const offA = first ? -into * slide : (1 - back) * slide;
    const offB = first ? (1 - into) * slide : -back * slide;
    ctx.save();
    roundedRect(ctx, bx, faceY, bw, bh, r);
    ctx.clip();
    const label = labelOf(s.labels, 'label', 'SUBSCRIBE');
    const doneLabel = labelOf(s.labels, 'done', 'SUBSCRIBED');
    faded(ctx, 1 - done, () => { s.text(label, cx, cy + offA, maxW, sizePx, s.onPrimary); });
    faded(ctx, done, () => { s.text(doneLabel, cx, cy + offB, maxW, sizePx, doneInk); });
    ctx.restore();

    // The pointer: in, click, out.
    const arrive = easeOutCubic(seg(p, 0.1, 0.3));
    const leave = easeInOutCubic(seg(p, 0.52, 0.68));
    const seen = smoothstep(0.1, 0.17, p) * (1 - smoothstep(0.56, 0.68, p));
    if (seen > 0) {
      const px = lerp(tip.x + W * 0.07, tip.x, arrive) + W * 0.05 * leave;
      const py = lerp(tip.y + H * 0.14, tip.y, arrive) + H * 0.1 * leave;
      const squeeze = 1 - 0.14 * pressIn * (1 - easeOutCubic(seg(p, 0.335, 0.42)));
      ctx.save();
      ctx.globalAlpha *= seen;
      ctx.translate(px, py);
      ctx.scale(squeeze, squeeze);
      cursorPath(ctx, H * 0.42);
      ctx.lineJoin = 'round';
      ctx.lineWidth = H * 0.035;
      ctx.strokeStyle = '#141418';
      ctx.stroke();
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  },
};

/**
 * A thumbs-up on a disc in the look's accent: it gathers itself, springs up
 * past full size with a flick of the wrist, and lines burst from the disc.
 */
export const like: StickerDef = {
  id: 'like',
  name: 'Like',
  category: 'Social',
  keywords: ['like', 'thumb', 'thumbs up', 'good', 'approve', 'yes'],
  aspect: 1,
  size: 0.26,
  loopMs: 1800,
  posterMs: 1100,
  primary: roleFill('accent'),
  secondary: colorFill('#FFFFFF'),
  draw(ctx, s) {
    const k = Math.min(s.w, s.h);
    const p = s.p;
    const gather = easeInOutSine(seg(p, 0.06, 0.2));
    const pop = springOut(seg(p, 0.2, 0.62), 1.2, 3.4);
    const disc = p < 0.2 ? 1 - 0.08 * gather : 0.92 + 0.08 * springOut(seg(p, 0.2, 0.5));
    const thumb = p < 0.2 ? 1 - 0.3 * gather : 0.7 + 0.3 * pop;
    const tilt = p < 0.2
      ? deg(12) * gather
      : p < 0.31
        ? lerp(deg(12), deg(-16), easeOutCubic(seg(p, 0.2, 0.31)))
        : deg(-16) * (1 - springOut(seg(p, 0.31, 0.72), 1.1, 4));

    ctx.save();
    ctx.translate(s.w / 2, s.h / 2);
    ctx.scale(k, k);
    // The burst, behind the disc.
    ctx.strokeStyle = s.primary;
    ctx.lineCap = 'round';
    ctx.lineWidth = 0.034;
    burstLines(ctx, 0, 0, 0.37, 0.12, 8, seg(p, 0.22, 0.54), Math.PI / 8);
    ctx.save();
    ctx.scale(disc, disc);
    circlePath(ctx, 0, 0, 0.36);
    ctx.fillStyle = s.primary;
    ctx.fill();
    gloss(ctx, -0.36, 0.1, 0.22);
    ctx.translate(0.0, 0.015);
    ctx.scale(thumb, thumb);
    drawThumb(ctx, 0.44, s.secondary, s.primary, tilt);
    ctx.restore();
    ctx.restore();
  },
};

/** A heartbeat: a heart thumps twice, and small hearts drift up behind it. */
export const love: StickerDef = {
  id: 'love',
  name: 'Love',
  category: 'Social',
  keywords: ['love', 'heart', 'like', 'favourite', 'favorite', 'romance'],
  aspect: 1,
  size: 0.26,
  loopMs: 1600,
  posterMs: 160,
  primary: colorFill('#FF3B5C'),
  secondary: colorFill('#FFFFFF'),
  draw(ctx, s) {
    const k = Math.min(s.w, s.h);
    const p = s.p;
    // Lub, then a smaller dub: each rises fast and eases off.
    const beat = (u: number): number => (u <= 0 || u >= 1 ? 0 : u < 0.3 ? easeOutCubic(u / 0.3) : 1 - easeInOutSine((u - 0.3) / 0.7));
    const scale = 1 + 0.15 * beat(seg(p, 0.03, 0.24)) + 0.1 * beat(seg(p, 0.24, 0.48));

    ctx.save();
    ctx.translate(s.w / 2, s.h / 2);
    ctx.scale(k, k);
    // Small hearts, each on its own part of the loop, rising from behind.
    for (let i = 0; i < 3; i++) {
      const life = 0.62;
      const age = wrap(p - i / 3 - rand(s.seed, i, 1) * 0.08, 1) / life;
      if (age >= 1) continue;
      const a = smoothstep(0, 0.18, age) * (1 - smoothstep(0.55, 1, age));
      if (a <= 0) continue;
      const x0 = between(s.seed, i, 2, -0.24, 0.24);
      const x = x0 + Math.sin(age * TAU * 0.75) * 0.05 * (x0 < 0 ? -1 : 1);
      const y = lerp(-0.02, -0.4, easeOutCubic(age));
      ctx.save();
      ctx.globalAlpha *= a;
      ctx.fillStyle = s.primary;
      heartPath(ctx, x, y, lerp(0.09, 0.15, age));
      ctx.fill();
      ctx.restore();
    }
    ctx.translate(0, 0.08);
    ctx.scale(scale, scale);
    heartPath(ctx, 0, 0, 0.66);
    ctx.fillStyle = s.primary;
    ctx.fill();
    const shade = ctx.createLinearGradient(0, -0.3, 0, 0.27);
    shade.addColorStop(0, 'rgba(0,0,0,0)');
    shade.addColorStop(1, 'rgba(0,0,0,0.16)');
    ctx.fillStyle = shade;
    ctx.fill();
    // A glint on the left lobe.
    ctx.save();
    ctx.globalAlpha *= 0.7;
    ctx.translate(-0.17, -0.16);
    ctx.rotate(deg(-35));
    ctx.beginPath();
    ctx.ellipse(0, 0, 0.075, 0.042, 0, 0, TAU);
    ctx.fillStyle = s.secondary;
    ctx.fill();
    ctx.restore();
    ctx.restore();
  },
};

/** A notification bell that swings from its top, clapper lagging, with a count that pops. */
export const bell: StickerDef = {
  id: 'bell',
  name: 'Notify bell',
  category: 'Social',
  keywords: ['bell', 'notification', 'notify', 'alert', 'ring', 'reminder'],
  aspect: 1,
  size: 0.24,
  loopMs: 2200,
  posterMs: 300,
  labels: [{ key: 'count', name: 'Number', text: '1', maxChars: 3 }],
  primary: colorFill(AMBER),
  secondary: colorFill(RED),
  draw(ctx, s) {
    const k = Math.min(s.w, s.h);
    const p = s.p;
    const u = seg(p, 0.06, 0.64);
    const swing = deg(26) * ring(u, 3, 2.2) / 0.8;
    const clapper = -0.16 * ring(seg(p, 0.1, 0.7), 3, 2.2);
    const size = 0.64;

    ctx.save();
    ctx.translate(s.w / 2, s.h / 2);
    ctx.save();
    ctx.scale(k, k);
    // Sound arcs either side while it rings.
    const sound = bump(seg(p, 0.06, 0.56));
    if (sound > 0.01) {
      ctx.save();
      ctx.globalAlpha *= sound;
      ctx.strokeStyle = s.primary;
      ctx.lineCap = 'round';
      ctx.lineWidth = 0.035;
      for (const side of [-1, 1]) {
        for (const [radius, span] of [[0.38, 0.42], [0.46, 0.36]] as const) {
          ctx.beginPath();
          const mid = side < 0 ? Math.PI : 0;
          ctx.arc(0, 0.04, radius, mid - span, mid + span);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
    ctx.translate(0, -0.33);
    ctx.rotate(swing);
    ctx.fillStyle = s.primary;
    bellClapperPath(ctx, size, clapper);
    ctx.fill();
    ctx.fillStyle = SHADE;
    ctx.fill();
    bellBodyPath(ctx, size);
    ctx.fillStyle = s.primary;
    ctx.fill();
    gloss(ctx, 0.1 * size, 0.8 * size, 0.28);
    // A highlight down the left of the dome.
    ctx.save();
    ctx.globalAlpha *= 0.5;
    ctx.beginPath();
    ctx.moveTo(-0.2 * size, 0.62 * size);
    ctx.quadraticCurveTo(-0.21 * size, 0.28 * size, -0.07 * size, 0.2 * size);
    ctx.strokeStyle = SHINE;
    ctx.lineCap = 'round';
    ctx.lineWidth = 0.06 * size;
    ctx.stroke();
    ctx.restore();
    bellLipPath(ctx, size);
    ctx.fillStyle = s.primary;
    ctx.fill();
    ctx.fillStyle = SHADE;
    ctx.fill();
    bellKnobPath(ctx, size);
    ctx.fillStyle = s.primary;
    ctx.fill();
    ctx.restore();

    // The count, which pops as the ringing starts.
    const pop = 1 + 0.3 * bump(seg(p, 0.05, 0.22));
    const dot = { x: 0.2 * k, y: -0.19 * k, r: 0.12 * k * pop };
    circlePath(ctx, dot.x, dot.y, dot.r);
    ctx.fillStyle = s.secondary;
    ctx.fill();
    s.text(labelOf(s.labels, 'count', '1'), dot.x, dot.y + dot.r * 0.04, dot.r * 1.4, dot.r * 1.25, onAccent(s.secondary));
    ctx.restore();
  },
};

/**
 * A Follow button: pressed, it flips to an outlined Following, its plus
 * turning into a tick; near the end of the loop it turns back.
 */
export const follow: StickerDef = {
  id: 'follow',
  name: 'Follow',
  category: 'Social',
  keywords: ['follow', 'button', 'add', 'friend', 'join', 'plus'],
  aspect: 3,
  size: 0.44,
  loopMs: 2600,
  posterMs: 300,
  labels: [
    { key: 'label', name: 'Button words', text: 'Follow', maxChars: 14 },
    { key: 'done', name: 'Words once pressed', text: 'Following', maxChars: 14 },
  ],
  primary: roleFill('accent'),
  secondary: roleFill('surface'),
  draw(ctx, s) {
    const { w: W, h: H, p } = s;
    const bh = H * 0.7;
    const bw = W * 0.94;
    const bx = (W - bw) / 2;
    const by = (H - bh) / 2;
    const r = bh / 2;
    const doneInk = onAccent(s.secondary);

    const pressIn = easeOutCubic(seg(p, 0.2, 0.245));
    const release = springOut(seg(p, 0.245, 0.5), 1.2, 4.5);
    const scale = 1 - 0.06 * pressIn * (1 - release);
    const into = easeInOutSine(seg(p, 0.245, 0.33));
    const back = easeInOutSine(seg(p, 0.84, 0.95));
    const done = into * (1 - back);
    // The plus turns a quarter and becomes a tick, overshooting a little.
    const morph = p < 0.6 ? easeOutBack(seg(p, 0.245, 0.45), 1.4) : 1 - easeInOutCubic(seg(p, 0.84, 0.95));

    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(scale, scale);
    ctx.translate(-W / 2, -H / 2);
    roundedRect(ctx, bx, by, bw, bh, r);
    ctx.fillStyle = s.primary;
    ctx.fill();
    if (done > 0) {
      ctx.save();
      ctx.globalAlpha *= done;
      ctx.fillStyle = s.secondary;
      ctx.fill();
      ctx.restore();
    }
    gloss(ctx, by, by + bh * 0.7, 0.16 * (1 - done));
    if (done > 0) {
      const lw = bh * 0.08;
      ctx.save();
      ctx.globalAlpha *= done;
      roundedRect(ctx, bx + lw / 2, by + lw / 2, bw - lw, bh - lw, r - lw / 2);
      ctx.strokeStyle = s.primary;
      ctx.lineWidth = lw;
      ctx.stroke();
      ctx.restore();
    }

    // The icon.
    const ix = bx + bh * 0.62;
    const cy = by + bh / 2;
    const a = bh * 0.19;
    const from: readonly (readonly [number, number])[] = [[-1, 0], [1, 0], [0, 1], [0, -1]];
    const to: readonly (readonly [number, number])[] = [[-0.85, 0.05], [-0.28, 0.6], [-0.28, 0.6], [0.88, -0.58]];
    const pt = (i: number): [number, number] => {
      const f = from[i] ?? [0, 0];
      const t = to[i] ?? [0, 0];
      return [lerp(f[0], t[0], morph) * a, lerp(f[1], t[1], morph) * a];
    };
    const drawIcon = (color: string): void => {
      ctx.save();
      ctx.translate(ix, cy);
      ctx.rotate(lerp(-Math.PI / 2, 0, morph));
      ctx.beginPath();
      ctx.moveTo(...pt(0));
      ctx.lineTo(...pt(1));
      ctx.moveTo(...pt(2));
      ctx.lineTo(...pt(3));
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = bh * 0.1;
      ctx.strokeStyle = color;
      ctx.stroke();
      ctx.restore();
    };
    faded(ctx, 1 - done, () => { drawIcon(s.onPrimary); });
    faded(ctx, done, () => { drawIcon(s.primary); });

    const textL = bx + bh * 1.0;
    const textR = bx + bw - bh * 0.42;
    const label = labelOf(s.labels, 'label', 'Follow');
    const doneLabel = labelOf(s.labels, 'done', 'Following');
    faded(ctx, 1 - done, () => { s.text(label, (textL + textR) / 2, cy, textR - textL, bh * 0.42, s.onPrimary); });
    faded(ctx, done, () => { s.text(doneLabel, (textL + textR) / 2, cy, textR - textL, bh * 0.42, doneInk); });
    ctx.restore();
  },
};

/** The curved share arrow on a disc: it draws back, darts forward with a trail, and springs home. */
export const share: StickerDef = {
  id: 'share',
  name: 'Share',
  category: 'Social',
  keywords: ['share', 'arrow', 'send', 'forward', 'repost'],
  aspect: 1,
  size: 0.24,
  loopMs: 1400,
  posterMs: 0,
  primary: roleFill('accent'),
  secondary: colorFill('#FFFFFF'),
  flippable: true,
  draw(ctx, s) {
    const k = Math.min(s.w, s.h);
    const p = s.p;
    const offset = (q: number): number => {
      if (q < 0.16) return 0;
      if (q < 0.3) return -0.045 * easeInOutSine(seg(q, 0.16, 0.3));
      if (q < 0.42) return lerp(-0.045, 0.1, easeOutCubic(seg(q, 0.3, 0.42)));
      return 0.1 * (1 - springOut(seg(q, 0.42, 0.84), 1.1, 4.5));
    };
    const tilt = deg(-9) * bump(seg(p, 0.28, 0.66));
    const disc = 1 + 0.04 * bump(seg(p, 0.3, 0.55));

    ctx.save();
    ctx.translate(s.w / 2, s.h / 2);
    ctx.scale(k, k);
    ctx.scale(disc, disc);
    circlePath(ctx, 0, 0, 0.44);
    ctx.fillStyle = s.primary;
    ctx.fill();
    gloss(ctx, -0.44, 0.15, 0.22);
    ctx.save();
    circlePath(ctx, 0, 0, 0.44);
    ctx.clip();
    const arrow = (dx: number, alpha: number): void => {
      if (alpha <= 0.002) return;
      ctx.save();
      ctx.globalAlpha *= alpha;
      ctx.translate(dx + 0.01, 0.02);
      ctx.rotate(tilt);
      ctx.fillStyle = s.secondary;
      ctx.strokeStyle = s.secondary;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      // Head.
      ctx.beginPath();
      ctx.moveTo(0.24, -0.08);
      ctx.lineTo(0.02, -0.27);
      ctx.lineTo(0.02, 0.11);
      ctx.closePath();
      ctx.lineWidth = 0.05;
      ctx.fill();
      ctx.stroke();
      // Stem, sweeping down to the left.
      ctx.beginPath();
      ctx.moveTo(0.06, -0.08);
      ctx.quadraticCurveTo(-0.22, -0.08, -0.23, 0.22);
      ctx.lineWidth = 0.13;
      ctx.stroke();
      ctx.restore();
    };
    const trail = bump(seg(p, 0.3, 0.52));
    arrow(offset(p - 0.06), 0.16 * trail);
    arrow(offset(p - 0.03), 0.3 * trail);
    arrow(offset(p), 1);
    ctx.restore();
    ctx.restore();
  },
};

/** A speech bubble with three dots bouncing in turn, as when someone is typing. */
export const comment: StickerDef = {
  id: 'comment',
  name: 'Comment',
  category: 'Social',
  keywords: ['comment', 'chat', 'message', 'typing', 'speech', 'bubble', 'reply'],
  aspect: 1.2,
  size: 0.26,
  loopMs: 1200,
  posterMs: 200,
  primary: roleFill('accent'),
  secondary: colorFill('#FFFFFF'),
  draw(ctx, s) {
    const k = Math.min(s.w, s.h);
    const p = s.p;
    ctx.save();
    ctx.translate(s.w / 2, s.h / 2);
    ctx.scale(k, k);
    ctx.fillStyle = s.primary;
    // The tail, then the body over it.
    ctx.beginPath();
    ctx.moveTo(-0.36, 0.16);
    ctx.quadraticCurveTo(-0.33, 0.36, -0.46, 0.45);
    ctx.quadraticCurveTo(-0.17, 0.43, -0.03, 0.22);
    ctx.closePath();
    ctx.fill();
    roundedRect(ctx, -0.54, -0.42, 1.08, 0.7, 0.3);
    ctx.fill();
    gloss(ctx, -0.42, 0.1, 0.22);
    ctx.fillStyle = s.secondary;
    for (let i = 0; i < 3; i++) {
      const lift = bump(seg(wrap(p - i * 0.15, 1), 0, 0.44));
      const r = 0.072 * (1 + 0.12 * lift);
      ctx.save();
      ctx.globalAlpha *= 0.55 + 0.45 * lift;
      circlePath(ctx, (i - 1) * 0.25, -0.07 - 0.085 * lift, r);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  },
};

/** A bookmark that fills from the top, pops with a glint, and clears for the next pass. */
export const save: StickerDef = {
  id: 'save',
  name: 'Save',
  category: 'Social',
  keywords: ['save', 'bookmark', 'keep', 'later', 'collection'],
  aspect: 0.8,
  size: 0.24,
  loopMs: 1600,
  posterMs: 900,
  primary: roleFill('accent'),
  secondary: colorFill('#FFFFFF'),
  draw(ctx, s) {
    const k = Math.min(s.w, s.h);
    const p = s.p;
    const level = easeInOutCubic(seg(p, 0.12, 0.42));
    const shown = 1 - easeInOutSine(seg(p, 0.84, 0.98));
    const pop = 1 + 0.13 * ring(seg(p, 0.4, 0.74), 1.5, 3) / 0.8;
    const mark = (): void => {
      const top = -0.4;
      const bottom = 0.4;
      const half = 0.27;
      const rr = 0.07;
      ctx.beginPath();
      ctx.moveTo(-half + rr, top);
      ctx.lineTo(half - rr, top);
      ctx.arcTo(half, top, half, top + rr, rr);
      ctx.lineTo(half, bottom);
      ctx.lineTo(0, bottom - 0.17);
      ctx.lineTo(-half, bottom);
      ctx.lineTo(-half, top + rr);
      ctx.arcTo(-half, top, -half + rr, top, rr);
      ctx.closePath();
    };
    ctx.save();
    ctx.translate(s.w / 2, s.h / 2);
    ctx.scale(k, k);
    ctx.translate(0, 0.02);
    ctx.scale(pop, pop);
    ctx.lineJoin = 'round';
    mark();
    ctx.save();
    ctx.globalAlpha *= 0.22;
    ctx.fillStyle = s.primary;
    ctx.fill();
    ctx.restore();
    if (level > 0 && shown > 0) {
      ctx.save();
      ctx.globalAlpha *= shown;
      mark();
      ctx.clip();
      ctx.fillStyle = s.primary;
      ctx.fillRect(-0.4, -0.45, 0.8, 0.9 * level + 0.01);
      ctx.restore();
    }
    mark();
    ctx.strokeStyle = s.primary;
    ctx.lineWidth = 0.065;
    ctx.stroke();
    // The glint as it lands.
    const glint = bump(seg(p, 0.42, 0.74)) * shown;
    if (glint > 0.01) {
      ctx.save();
      ctx.globalAlpha *= glint;
      sparklePath(ctx, 0.1, -0.2, 0.1 * (0.6 + 0.4 * glint), deg(15) * glint, 0.2);
      ctx.fillStyle = s.secondary;
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  },
};

export const SOCIAL: readonly StickerDef[] = [subscribe, like, love, bell, follow, share, comment, save];
