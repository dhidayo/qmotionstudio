import type { Ctx2D, KineticMotion, KineticOrder, KineticReveal, TextProps } from '@/core/types';
import type { GlyphRun, TextAlign } from '@/core/text/layout';
import { applyEase } from '@/core/anim/easings';
import { progress } from '@/core/math/geometry';

/**
 * Kinetic type (D-118).
 *
 * Every unit — a letter, a word or a line — has its own clock: it arrives over
 * `durationMs`, `staggerMs` after the one before it in `order`, and, given an
 * exit, leaves the same way later. What "arrives" means is the motion: rising
 * into place, dropping, popping with overshoot, flying in from scattered
 * offsets, sharpening out of a soft blur, and so on.
 *
 * All of it is drawn from the measured run the text layer already has, so the
 * letters land exactly where the static text would sit, and nothing is
 * measured per frame.
 */

type Unit = {
  readonly text: string;
  /** Left edge and baseline, in the block's coordinates. */
  readonly x: number;
  readonly baseline: number;
  readonly width: number;
  /** Position in the reading order, before `order` is applied. */
  readonly index: number;
};

export function unitsOf(
  reveal: KineticReveal,
  run: GlyphRun,
  x: number,
  y: number,
  blockWidth: number,
  fontSizePx: number,
  align: TextAlign,
): Unit[] {
  const units: Unit[] = [];
  run.lines.forEach((line, lineIndex) => {
    const offsetX = x + (align === 'left' ? 0 : align === 'right' ? blockWidth - line.width : (blockWidth - line.width) / 2);
    const baseline = y + line.y + fontSizePx * 0.8;
    if (reveal.unit === 'line') {
      units.push({ text: line.text, x: offsetX, baseline, width: line.width, index: lineIndex });
    } else if (reveal.unit === 'word') {
      for (const word of line.words) units.push({ text: word.text, x: offsetX + word.x, baseline, width: word.width, index: word.index });
    } else {
      for (const char of line.chars) {
        if (char.char.trim().length === 0) continue;
        units.push({ text: char.char, x: offsetX + char.x, baseline, width: char.width, index: char.index });
      }
    }
  });
  return units;
}

/** Where each unit falls in the stagger, by the reveal's order. */
function rankOf(units: readonly Unit[], order: KineticOrder): (unit: Unit, i: number) => number {
  const n = units.length;
  switch (order) {
    case 'end':
      return (_, i) => n - 1 - i;
    case 'center':
      return (_, i) => Math.abs(i - (n - 1) / 2);
    case 'random':
      return (unit) => Math.floor(hash(unit.index) * n);
    case 'start':
      return (_, i) => i;
  }
}

/** A stable pseudo-random number in [0, 1) for a unit, so scatter is the same every frame and in export. */
export function hash(i: number, salt = 0): number {
  let h = (i * 2654435761 + salt * 40503) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519) >>> 0;
  h ^= h >>> 13;
  // XOR leaves a signed 32-bit integer: back to unsigned, or half the results are negative.
  return ((h >>> 0) % 10_000) / 10_000;
}

/** How a unit looks part way in: offsets in ems, a scale, a turn, and its opacity. */
type Pose = { dx: number; dy: number; scaleX: number; scaleY: number; rotation: number; alpha: number; soft: number; ghost: number };

const REST: Pose = { dx: 0, dy: 0, scaleX: 1, scaleY: 1, rotation: 0, alpha: 1, soft: 0, ghost: 0 };

/** `u` runs 0 → 1 as the unit arrives; leaving reuses this with `u` running back to 0. */
function poseFor(motion: KineticMotion, u: number, unit: Unit, ordinal: number, n: number, localMs: number): Pose {
  const out = 1 - u;
  const eased = applyEase('outCubic', u);
  const away = 1 - eased;
  switch (motion) {
    case 'rise':
      return { ...REST, dy: away * 0.55, alpha: eased };
    case 'drop':
      return { ...REST, dy: -away * 0.9, alpha: eased };
    case 'pop': {
      const s = applyEase('outBack', u);
      return { ...REST, scaleX: s, scaleY: s, alpha: Math.min(1, u * 3) };
    }
    case 'scatter': {
      const angle = hash(unit.index, 1) * Math.PI * 2;
      const reach = 1.2 + hash(unit.index, 2) * 1.6;
      return {
        ...REST,
        dx: Math.cos(angle) * reach * away,
        dy: Math.sin(angle) * reach * away,
        rotation: (hash(unit.index, 3) - 0.5) * 120 * away,
        alpha: eased,
      };
    }
    case 'wave': {
      // Arrives on a rising wave, then keeps breathing gently on it.
      const swell = Math.sin(localMs / 340 + unit.index * 0.55) * 0.07 * eased;
      return { ...REST, dy: away * 0.8 + swell, alpha: eased };
    }
    case 'focus':
      return { ...REST, scaleX: 1 + away * 0.08, scaleY: 1 + away * 0.08, alpha: eased, soft: away };
    case 'slideLeft':
      return { ...REST, dx: away * 1.4, alpha: eased };
    case 'slideRight':
      return { ...REST, dx: -away * 1.4, alpha: eased };
    case 'split':
      return { ...REST, dx: (ordinal < n / 2 ? -1 : 1) * away * 2.2, alpha: eased };
    case 'flip':
      return { ...REST, scaleY: Math.max(0.02, eased), dy: away * 0.15, alpha: Math.min(1, u * 2.5) };
    case 'stretch':
      return { ...REST, scaleX: 1 + away * 1.6, alpha: eased };
    case 'zoom': {
      const s = 1 + away * 2.4;
      return { ...REST, scaleX: s, scaleY: s, alpha: eased };
    }
    case 'tilt':
      return { ...REST, rotation: away * -14, dy: away * 0.3, alpha: eased };
    case 'glitch': {
      // Flickers in with its colour channels apart, then locks.
      const flick = u >= 1 ? 1 : hash(unit.index + Math.floor(localMs / 45), 7) > 0.35 ? 1 : 0.15;
      return { ...REST, dx: (hash(unit.index + Math.floor(localMs / 60), 5) - 0.5) * 0.3 * out, alpha: Math.min(flick, Math.max(0.15, u * 1.5)), ghost: out };
    }
    case 'typewriter':
      return { ...REST, alpha: u > 0 ? 1 : 0 };
  }
}

export type KineticPaint = {
  readonly ctx: Ctx2D;
  readonly props: TextProps;
  readonly fill: string;
  readonly outline: string | null;
  /** The accent, for a glitch's colour fringes. */
  readonly accent: string;
};

export function drawKinetic(
  paint: KineticPaint,
  reveal: KineticReveal,
  units: readonly Unit[],
  localMs: number,
): void {
  const { ctx, props } = paint;
  const em = props.fontSizePx;
  const rank = rankOf(units, reveal.order ?? 'start');
  const n = units.length;
  let caretAt: { x: number; baseline: number } | null = null;

  for (let i = 0; i < units.length; i++) {
    const unit = units[i];
    if (!unit) continue;
    const ordinal = rank(unit, i);
    const from = reveal.startMs + ordinal * reveal.staggerMs;
    let u = progress(localMs, from, from + reveal.durationMs);
    let motion: KineticMotion | 'fade' = reveal.motion;

    if (reveal.exit && localMs >= reveal.exit.atMs) {
      const leave = reveal.exit.atMs + ordinal * reveal.exit.staggerMs;
      const v = progress(localMs, leave, leave + reveal.exit.durationMs);
      if (v > 0) {
        u = Math.min(u, 1 - v);
        motion = reveal.exit.motion;
      }
    }
    if (u <= 0) continue;

    if (reveal.motion === 'typewriter') caretAt = { x: unit.x + unit.width, baseline: unit.baseline };

    const pose = motion === 'fade'
      ? { ...REST, alpha: applyEase('outCubic', u) }
      : poseFor(motion, u, unit, ordinal, n, localMs);
    if (pose.alpha <= 0.001) continue;

    const cx = unit.x + unit.width / 2;
    const cy = unit.baseline - em * 0.35;
    ctx.save();
    ctx.globalAlpha *= pose.alpha;
    ctx.translate(cx + pose.dx * em, cy + pose.dy * em);
    if (pose.rotation !== 0) ctx.rotate((pose.rotation * Math.PI) / 180);
    if (pose.scaleX !== 1 || pose.scaleY !== 1) ctx.scale(pose.scaleX, pose.scaleY);
    const atX = -unit.width / 2;
    const atY = em * 0.35;

    if (pose.ghost > 0.01) {
      // The glitch's split channels: an accent copy and an ink copy, pulled apart.
      const pull = pose.ghost * em * 0.12;
      ctx.save();
      ctx.globalAlpha *= 0.7;
      ctx.fillStyle = paint.accent;
      ctx.fillText(unit.text, atX - pull, atY);
      ctx.fillStyle = paint.fill;
      ctx.globalAlpha *= 0.6;
      ctx.fillText(unit.text, atX + pull, atY);
      ctx.restore();
    }

    if (pose.soft > 0.01) {
      // A soft focus without `ctx.filter` (not in Safari's canvas): a few
      // faint copies spread round the letter, drawn under it.
      const r = pose.soft * em * 0.12;
      ctx.save();
      ctx.globalAlpha *= 0.28;
      for (const [ox, oy] of [[r, 0], [-r, 0], [0, r], [0, -r]] as const) ctx.fillText(unit.text, atX + ox, atY + oy);
      ctx.restore();
      ctx.globalAlpha *= 1 - pose.soft * 0.6;
    }

    if (paint.outline !== null && props.outline) {
      ctx.lineWidth = props.outline.width;
      ctx.strokeStyle = paint.outline;
      ctx.lineJoin = 'round';
      ctx.strokeText(unit.text, atX, atY);
    }
    ctx.fillText(unit.text, atX, atY);
    ctx.restore();
  }

  const caret = caretAt;
  if (reveal.caret === true && caret !== null) {
    // Solid while typing, then blinking.
    const typing = localMs < reveal.startMs + (n - 1) * reveal.staggerMs + reveal.durationMs;
    const on = typing || Math.floor(localMs / 480) % 2 === 0;
    if (on) {
      ctx.save();
      ctx.fillStyle = paint.fill;
      ctx.fillRect(caret.x + em * 0.06, caret.baseline - em * 0.78, Math.max(2, em * 0.07), em * 0.92);
      ctx.restore();
    }
  }
}

/**
 * A count-up (D-118): every number in the line runs from zero to its value,
 * keeping its decimals and thousands separators — "2,500+" counts through
 * "1,250+" on its way.
 */
export function countedText(text: string, p: number): string {
  const eased = applyEase('outCubic', p);
  return text.replace(/\d[\d,]*(\.\d+)?/g, (match) => {
    const decimals = match.includes('.') ? (match.split('.')[1] ?? '').length : 0;
    const grouped = match.includes(',');
    const target = Number(match.replace(/,/g, ''));
    if (!Number.isFinite(target)) return match;
    const value = target * eased;
    const fixed = value.toFixed(decimals);
    if (!grouped) return fixed;
    const [whole = '0', fraction] = fixed.split('.');
    const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return fraction === undefined ? withCommas : `${withCommas}.${fraction}`;
  });
}
