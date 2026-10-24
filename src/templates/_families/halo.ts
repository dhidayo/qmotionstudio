import { roleFill, type Layer } from '@/core/types';
import type { SceneInputs } from '@/document/types';
import type { BuildContext } from '../buildContext';
import { pick, text, type SceneVariant } from '../catalog';
import type { SceneTemplate } from '../schema';
import { backgroundLayer, contentFloor } from '../_shared/chrome';
import { fillSlots } from '../_shared/photo';
import { cardCount, cardProps, clamp01, defineScene, depthGroup, easeInOut, easeOutBack, FOCUS, glow, headlineSlot, lerp, measureSlot, placeText, sampled, sublineSlot, type Pose, type Stage } from './kit';
import { focusIn, heldTurns, loopTurns, roomyPoint, smoother, turned, type Box } from './emphasis';
import { hash } from '@/core/render/layers/kinetic';

/**
 * Photo Collage (D-119): an idea in the middle, photographs floating round it
 * like a mood board — drifting, assembling from the edges, orbiting, pulsing
 * one at a time, breathing, scattering and coming back.
 *
 * One photo is in focus at every moment (D-157): the photos take turns round
 * the halo, and the one whose turn it is grows, straightens and comes forward
 * while the rest darken. It grows outward, away from the words — the words
 * are drawn over the photos, so a photo in focus must never sit under them —
 * and stays inside the frame and above the content floor.
 */

type Shape = 'float' | 'assemble' | 'spin' | 'pulse' | 'breathe' | 'scatter' | 'cascade' | 'parallax';

const SHAPES: readonly Shape[] = ['float', 'assemble', 'spin', 'pulse', 'breathe', 'scatter', 'cascade', 'parallax'];

const PEAK = 1.35;

/** A centred rectangle the focused photo must keep clear of: the words. */
type Keepout = { readonly cx: number; readonly cy: number; readonly w: number; readonly h: number };

/**
 * Where a photo of `box` at `at` stands, and how large it may grow, when it is
 * in focus: the nearest spot clear of the words — outward from them, or
 * straight across or down — that is inside `area`; smaller if the frame has
 * no room for the full size. Failing all, it keeps its place and its size.
 */
function clearSpot(area: Stage, words: Keepout, at: { x: number; y: number }, box: Box, wanted: number): { x: number; y: number; peak: number } {
  const dx = at.x - words.cx;
  const dy = at.y - words.cy;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const sx = dx < 0 ? -1 : 1;
  const sy = dy < 0 ? -1 : 1;
  for (let peak = wanted; peak >= 0.9; peak -= 0.05) {
    const needX = (box.w * peak + words.w) / 2;
    const needY = (box.h * peak + words.h) / 2;
    const tx = Math.abs(ux) > 1e-3 ? (needX - Math.abs(dx)) / Math.abs(ux) : Number.POSITIVE_INFINITY;
    const ty = Math.abs(uy) > 1e-3 ? (needY - Math.abs(dy)) / Math.abs(uy) : Number.POSITIVE_INFINITY;
    const radial = [tx, ty].filter(Number.isFinite).map((t) => ({ x: at.x + ux * Math.max(0, t), y: at.y + uy * Math.max(0, t) }));
    const candidates = [...radial, { x: words.cx + sx * Math.max(needX, Math.abs(dx)), y: at.y }, { x: at.x, y: words.cy + sy * Math.max(needY, Math.abs(dy)) }]
      .map((c) => roomyPoint(area, c, box, peak))
      .filter((s) => Math.abs(s.x - words.cx) >= needX - 0.5 || Math.abs(s.y - words.cy) >= needY - 0.5)
      .filter((s) => Math.abs(s.x - area.cx) <= (area.w - box.w * peak) / 2 + 0.5 && Math.abs(s.y - area.cy) <= (area.h - box.h * peak) / 2 + 0.5)
      .sort((a, b) => Math.hypot(a.x - at.x, a.y - at.y) - Math.hypot(b.x - at.x, b.y - at.y));
    const spot = candidates[0];
    if (spot) return { ...spot, peak };
  }
  return { ...at, peak: FOCUS.rest };
}

/** The moments a photo is fully in focus, matching `turn` in `create`. */
function turnPeaks(shape: Shape, i: number, n: number, durationMs: number): number[] {
  if (shape === 'assemble') return [((i + 0.5) * durationMs) / n];
  if (shape === 'cascade') {
    const turn = (durationMs - 200) / (n * 2);
    return [200 + (i + 0.5) * turn, 200 + (i + n + 0.5) * turn];
  }
  return [(i * durationMs) / n, ...(i === 0 ? [durationMs] : [])];
}

export function create(variant: SceneVariant): SceneTemplate {
  const p = variant.params;
  const shape = pick<Shape>(p, 'shape', SHAPES, 'float');
  const headline = headlineSlot(text(p, 'headline', 'Big ideas start here'), {}, 50);
  const subline = sublineSlot(text(p, 'subline', 'A studio for bold brands'));

  const build = (inputs: SceneInputs, ctx: BuildContext): Layer[] => {
    const { durationMs, design, safe } = ctx;
    const n = cardCount(inputs, variant, 4);
    const photos = fillSlots(inputs.photos, n);
    const u = Math.min(design.w, design.h);
    const cx = design.w / 2;
    const cy = design.h / 2;
    const rx = safe.w * 0.4;
    const ry = safe.h * 0.36;

    // The words in the middle, where the halo leaves room for them.
    const size = u * 0.075;
    const head = measureSlot(ctx, headline, inputs, size, u * 0.56);
    const sub = measureSlot(ctx, subline, inputs, u * 0.03, u * 0.5);
    const top = cy - head.height / 2 - u * 0.02;
    const wordsBottom = top + head.height + u * 0.025 + sub.height;
    const wordsW = Math.max(head.width, sub.width) + u * 0.04;
    const words: Keepout = { cx, cy: (top + wordsBottom) / 2, w: wordsW, h: wordsBottom - top + u * 0.04 };
    // The photo in focus stays inside the safe area and above the content floor.
    const floor = contentFloor(design, safe);
    const area: Stage = { cx: safe.x + safe.w / 2, cy: (safe.y + floor) / 2, w: safe.w, h: floor - safe.y };

    const cards = photos.map((photo, i): Layer => {
      const base = (i / n) * Math.PI * 2 - Math.PI / 2;
      const props = cardProps(photo, u * (0.17 + hash(i, 81) * 0.09), inputs, u);
      const box: Box = { w: props.w, h: props.h };
      const tilt = (hash(i, 82) - 0.5) * 22;
      const home = (ms: number, angleShift = 0, radiusScale = 1): { x: number; y: number } => ({
        x: cx + Math.cos(base + angleShift) * rx * radiusScale + (hash(i, 83) - 0.5) * u * 0.05,
        y: cy + Math.sin(base + angleShift) * ry * radiusScale + Math.sin(ms / 1500 + i) * u * 0.012,
      });
      /** The photo's turn round the halo: one turn each, starting with the first. */
      const turn = (ms: number): number => {
        if (shape === 'assemble') return heldTurns(ms, i, n, 0, durationMs);
        if (shape === 'cascade') {
          // A turn as each photo appears, then a second round once all are in.
          return Math.max(heldTurns(ms, i, n * 2, 200, durationMs), heldTurns(ms, i + n, n * 2, 200, durationMs));
        }
        return loopTurns(ms, i, n, durationMs);
      };
      const pose = (ms: number, f: number): Pose => {
        const t = ms / durationMs;
        switch (shape) {
          case 'float':
            return { ...home(ms), rotation: tilt + Math.sin(ms / 2000 + i) * 3, z: hash(i, 84) };
          case 'assemble': {
            // In from beyond the edges, settle, then away again at the end.
            const come = easeOutBack(clamp01((ms - i * 140) / 900));
            const go = easeInOut((t - 0.86) / 0.14);
            const at = home(ms);
            const away = { x: cx + Math.cos(base) * design.w, y: cy + Math.sin(base) * design.h };
            return { x: lerp(away.x, at.x, come) + (away.x - at.x) * go, y: lerp(away.y, at.y, come) + (away.y - at.y) * go, rotation: tilt * come, z: hash(i, 84) };
          }
          case 'spin':
            return { ...home(ms, t * Math.PI * 2 * 0.5), rotation: tilt, z: hash(i, 84) };
          case 'pulse':
            // Each photo lifts forward in turn: the turn is the pulse.
            return { ...home(ms), rotation: tilt, z: 0 };
          case 'breathe': {
            const b = 1 + Math.sin(t * Math.PI * 4) * 0.12;
            return { ...home(ms, 0, b), rotation: tilt, z: hash(i, 84) };
          }
          case 'scatter': {
            // The photo in focus holds its place while the others fly out.
            const out = Math.sin(clamp01((t - 0.3) / 0.4) * Math.PI) * (1 - f);
            const at = home(ms, 0, 1 + out * 0.6);
            return { ...at, rotation: tilt + out * (hash(i, 85) - 0.5) * 120, opacity: 1 - out * 0.4, z: hash(i, 84) };
          }
          case 'cascade': {
            const shown = easeOutBack(clamp01((ms - 200 - i * (durationMs * 0.5) / n) / 600));
            return { ...home(ms), rotation: tilt, scale: Math.max(0.001, shown), opacity: clamp01(shown * 2), z: i };
          }
          case 'parallax': {
            const depth = hash(i, 86);
            const drift = Math.sin(t * Math.PI * 2) * u * 0.06 * (0.3 + depth);
            const at = home(ms);
            return { x: at.x + drift, y: at.y + drift * 0.4, rotation: tilt, scale: lerp(0.75, 1.2, depth), z: depth, opacity: lerp(0.7, 1, depth) };
          }
        }
      };
      // Where the photo stands in focus is worked out once per turn, at the
      // turn's height, and kept as an offset for the whole turn, so a photo
      // that drifts as it is featured never jumps from one spot to another.
      // While the halo keeps moving, the photo in focus holds its place in
      // it, then rejoins the others as it gives way.
      const peaks = turnPeaks(shape, i, n, durationMs);
      const holds = shape !== 'assemble' && shape !== 'cascade';
      const nearest = (ms: number): number => peaks.reduce((best, p2) => (Math.abs(p2 - ms) < Math.abs(best - ms) ? p2 : best), peaks[0] ?? 0);
      const spots = new Map<number, { dx: number; dy: number; peak: number }>();
      const spotFor = (c: number): { dx: number; dy: number; peak: number } => {
        const known = spots.get(c);
        if (known) return known;
        // An assembling photo is judged where it settles, not on its way out.
        const still = pose(shape === 'assemble' ? Math.min(c, durationMs * 0.8) : c, 1);
        const spot = clearSpot(area, words, still, turned(box, (still.rotation ?? 0) * 0.4), PEAK);
        const found = { dx: spot.x - still.x, dy: spot.y - still.y, peak: spot.peak };
        spots.set(c, found);
        return found;
      };
      const at = (ms: number): Pose => {
        const f = turn(ms);
        if (f <= 0.001) return focusIn(pose(ms, f), 0, area, box, PEAK);
        const c = nearest(ms);
        const spot = spotFor(c);
        // It reaches its clear spot early and leaves it late, while it is still
        // small, so it never crosses the words on the way.
        const away = smoother(f * 2.5);
        const rest = pose(holds ? lerp(ms, c, away) : ms, f);
        const moved = { ...rest, x: rest.x + spot.dx * away, y: rest.y + spot.dy * away };
        const shown = focusIn(moved, f, area, box, spot.peak, { straighten: 0.6 });
        // An arrival (the cascade) still scales the photo as it appears.
        const presence = shape === 'cascade' ? Math.min(1, rest.scale ?? 1) : 1;
        return { ...shown, scaleX: (shown.scaleX ?? 1) * presence, scaleY: (shown.scaleY ?? 1) * presence };
      };
      return { id: ctx.id('tile'), type: 'image', startMs: 0, endMs: durationMs, tracks: sampled(0, durationMs, 80, at), props };
    });

    return [
      backgroundLayer(inputs, ctx),
      glow(ctx, { x: cx, y: cy }, u * 1.1, 0.25),
      depthGroup(ctx, 'halo', cards),
      placeText(ctx, headline, inputs, { sizePx: size, maxWidthPx: u * 0.56, x: cx, y: top, reveal: { kind: 'kinetic', unit: 'word', motion: 'focus', startMs: 400, durationMs: 800, staggerMs: 90 } }).layer,
      placeText(ctx, subline, inputs, { sizePx: u * 0.03, maxWidthPx: u * 0.5, x: cx, y: top + head.height + u * 0.025, fill: roleFill('inkMuted'), reveal: { kind: 'kinetic', unit: 'line', motion: 'rise', startMs: 1200, durationMs: 600, staggerMs: 100 } }).layer,
    ];
  };

  return defineScene(variant, { textSlots: [headline, subline], build });
}
