import { roleFill, type Layer } from '@/core/types';
import type { SceneInputs } from '@/document/types';
import type { BuildContext } from '../buildContext';
import { pick, text, type SceneVariant } from '../catalog';
import type { SceneTemplate } from '../schema';
import { backgroundLayer } from '../_shared/chrome';
import { fillSlots } from '../_shared/photo';
import { cardCount, cardProps, clamp01, defineScene, depthGroup, easeInOut, easeOutBack, glow, headlineSlot, lerp, measureSlot, placeText, sampled, sublineSlot, type Pose } from './kit';
import { hash } from '@/core/render/layers/kinetic';

/**
 * Photo Collage (D-119): an idea in the middle, photographs floating round it
 * like a mood board — drifting, assembling from the edges, orbiting, pulsing
 * one at a time, breathing, scattering and coming back.
 */

type Shape = 'float' | 'assemble' | 'spin' | 'pulse' | 'breathe' | 'scatter' | 'cascade' | 'parallax';

const SHAPES: readonly Shape[] = ['float', 'assemble', 'spin', 'pulse', 'breathe', 'scatter', 'cascade', 'parallax'];

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
    const top = cy - head.height / 2 - u * 0.02;

    const cards = photos.map((photo, i): Layer => {
      const base = (i / n) * Math.PI * 2 - Math.PI / 2;
      const size = u * (0.17 + hash(i, 81) * 0.09);
      const tilt = (hash(i, 82) - 0.5) * 22;
      const home = (ms: number, angleShift = 0, radiusScale = 1): { x: number; y: number } => ({
        x: cx + Math.cos(base + angleShift) * rx * radiusScale + (hash(i, 83) - 0.5) * u * 0.05,
        y: cy + Math.sin(base + angleShift) * ry * radiusScale + Math.sin(ms / 1500 + i) * u * 0.012,
      });
      const pose = (ms: number): Pose => {
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
          case 'pulse': {
            const turn = durationMs / n;
            const lit = Math.floor(ms / turn) % n === i ? Math.sin(((ms % turn) / turn) * Math.PI) : 0;
            return { ...home(ms), rotation: tilt * (1 - lit), scale: 1 + lit * 0.35, opacity: 0.75 + lit * 0.25, z: lit * 2 };
          }
          case 'breathe': {
            const b = 1 + Math.sin(t * Math.PI * 4) * 0.12;
            return { ...home(ms, 0, b), rotation: tilt, z: hash(i, 84) };
          }
          case 'scatter': {
            const out = Math.sin(clamp01((t - 0.3) / 0.4) * Math.PI);
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
      return { id: ctx.id('tile'), type: 'image', startMs: 0, endMs: durationMs, tracks: sampled(0, durationMs, 80, pose), props: cardProps(photo, size, inputs, u) };
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
