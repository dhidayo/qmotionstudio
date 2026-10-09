import { roleFill, type Layer } from '@/core/types';
import type { SceneInputs } from '@/document/types';
import type { BuildContext } from '../buildContext';
import { pick, text, type SceneVariant } from '../catalog';
import type { SceneTemplate, TextSlotDef } from '../schema';
import { backgroundLayer } from '../_shared/chrome';
import { fillSlots } from '../_shared/photo';
import { cardCount, cardProps, clamp01, defineScene, depthGroup, easeInOut, easeOutBack, headlineAndStage, headlineSlot, isTall, kf, labelSlot, lerp, placeText, rect, sampled, type Pose } from './kit';

/**
 * Timeline (D-119): a story in milestones — a company's history, a project's
 * phases, a year in review. A line runs through the photographs and a
 * playhead travels it, bringing each milestone forward as it arrives, with
 * its label (a year, a phase) beside it.
 */

type Shape = 'track' | 'arc' | 'zigzag' | 'spine' | 'metro' | 'hang' | 'focus';

const SHAPES: readonly Shape[] = ['track', 'arc', 'zigzag', 'spine', 'metro', 'hang', 'focus'];

export function create(variant: SceneVariant): SceneTemplate {
  const p = variant.params;
  const shape = pick<Shape>(p, 'shape', SHAPES, 'track');
  const headline = headlineSlot(text(p, 'headline', 'Our journey'), {}, 50);
  const labels: TextSlotDef = labelSlot('milestones', 'Milestones, separated by commas', text(p, 'milestones', '2019, 2020, 2021, 2022, 2023, 2024, 2025'), {}, 140);

  const build = (inputs: SceneInputs, ctx: BuildContext): Layer[] => {
    const { durationMs, design } = ctx;
    const n = cardCount(inputs, variant, 3);
    const photos = fillSlots(inputs.photos, n);
    const { headline: head, stage } = headlineAndStage(ctx, inputs, headline);
    const u = Math.min(design.w, design.h);
    const vertical = shape === 'spine' || (isTall(stage) && shape !== 'arc' && shape !== 'hang');
    const words = (inputs.texts['milestones'] ?? labels.placeholder).split(',').map((w) => w.trim());

    // Where each milestone sits along the path, 0 → 1.
    const along = (i: number): number => (n === 1 ? 0.5 : i / (n - 1));
    const point = (s: number): { x: number; y: number; angle: number } => {
      if (vertical) return { x: stage.cx, y: lerp(stage.cy - stage.h * 0.42, stage.cy + stage.h * 0.42, s), angle: 90 };
      const x = lerp(stage.cx - stage.w * 0.44, stage.cx + stage.w * 0.44, s);
      if (shape === 'arc') return { x, y: stage.cy + stage.h * 0.25 - Math.sin(s * Math.PI) * stage.h * 0.45, angle: Math.cos(s * Math.PI) * -40 };
      if (shape === 'hang') return { x, y: stage.cy - stage.h * 0.25 + Math.sin(s * Math.PI) * stage.h * 0.12, angle: Math.cos(s * Math.PI) * 10 };
      return { x, y: stage.cy, angle: 0 };
    };

    // The playhead: travels the line once, moving to each milestone at the
    // start of its turn and resting there for the rest of it.
    const playhead = (ms: number): number => {
      const turn = durationMs / n;
      const k = Math.min(n - 1, Math.floor(ms / turn));
      const local = (ms - k * turn) / turn;
      const from = Math.max(0, k - 1) / Math.max(1, n - 1);
      const to = k / Math.max(1, n - 1);
      return lerp(from, to, easeInOut(local / 0.35));
    };

    const layers: Layer[] = [backgroundLayer(inputs, ctx)];

    // The line itself, drawn as short segments so it can bend.
    const segments = 40;
    for (let k = 0; k < segments; k++) {
      const a = point(k / segments);
      const b = point((k + 1) / segments);
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      layers.push(rect(ctx, 'line', {
        w: len + 1, h: Math.max(3, u * 0.006), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2,
        fill: shape === 'metro' ? roleFill('accent') : roleFill('ink', 0.3),
        tracks: { rotation: [kf(0, (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI)], opacity: [kf(k * 18, 0), kf(k * 18 + 200, 1)] },
      }));
    }

    // On a vertical line, as big as the gap between stops and half the width allow.
    const size = vertical
      ? Math.min(stage.w * 0.36, (stage.h * 0.84 / Math.max(1, n - 1)) * 1.25)
      : Math.min(stage.w, stage.h) * 0.22 * (shape === 'focus' ? 1.1 : 1);
    const cards: Layer[] = [];
    photos.forEach((photo, i) => {
      const s = along(i);
      const at = point(s);
      const side = shape === 'zigzag' || vertical ? (i % 2 === 0 ? -1 : 1) : -1;
      const offset = shape === 'hang' ? size * 0.62 : shape === 'metro' ? size * 0.75 : shape === 'track' || shape === 'focus' ? -size * 0.7 : size * 0.72 * side;
      const home = vertical ? { x: at.x + side * size * 0.85, y: at.y } : { x: at.x, y: at.y + (shape === 'zigzag' || shape === 'arc' ? (shape === 'arc' ? -size * 0.75 : offset) : offset) };
      const pose = (ms: number): Pose => {
        const head = playhead(ms);
        const near = 1 - Math.min(1, Math.abs(head - s) * Math.max(1, n - 1));
        const arrived = clamp01((head - s) * Math.max(1, n - 1) + 1);
        const pop = easeOutBack(arrived);
        const sway = shape === 'hang' ? Math.sin(ms / 700 + i) * 5 : 0;
        return {
          x: home.x,
          y: home.y + (shape === 'hang' ? 0 : -near * size * 0.08 * (vertical ? 0 : 1)),
          scale: (shape === 'focus' ? lerp(0.62, 1.15, near) : lerp(0.75, 1.08, near)) * Math.max(0.001, pop),
          rotation: (shape === 'hang' ? at.angle * 0.5 + sway : 0),
          opacity: clamp01(arrived * 2) * (shape === 'focus' ? lerp(0.55, 1, near) : 1),
          z: near,
        };
      };
      cards.push({ id: ctx.id('milestone'), type: 'image', startMs: 0, endMs: durationMs, tracks: sampled(0, durationMs, 70, pose), props: shape === 'hang' ? { ...cardProps(photo, size, inputs, u), border: { inset: 0, paint: roleFill('ink', 0.9), width: Math.max(5, u * 0.012) } } : cardProps(photo, size, inputs, u) });

      // The station, and its label.
      layers.push(rect(ctx, 'stop', {
        w: u * (shape === 'metro' ? 0.04 : 0.026), h: u * (shape === 'metro' ? 0.04 : 0.026), x: at.x, y: at.y, ellipse: true,
        fill: shape === 'metro' ? roleFill('bg') : roleFill('accent'), stroke: { paint: roleFill('accent'), width: Math.max(3, u * 0.006) },
        tracks: sampled(0, durationMs, 80, (ms) => { const near = 1 - Math.min(1, Math.abs(playhead(ms) - s) * Math.max(1, n - 1)); return { x: at.x, y: at.y, scale: 1 + near * 0.5 }; }),
      }));
      const label = placeText(ctx, labels, inputs, {
        sizePx: u * 0.034, maxWidthPx: size * 1.4,
        x: vertical ? at.x - side * u * 0.04 : at.x,
        y: vertical ? at.y - u * 0.02 : at.y + (offset < 0 || shape === 'arc' ? u * 0.03 : -u * 0.075),
        anchorX: vertical ? (side < 0 ? 0 : 1) : 0.5,
        fill: roleFill('accent'),
        reveal: { kind: 'kinetic', unit: 'line', motion: 'rise', startMs: Math.max(0, (durationMs / n) * i - 200), durationMs: 450, staggerMs: 0 },
      });
      // Each label shows its own milestone from the list; the list itself is
      // edited in the Text panel, so none of them is the editable original.
      layers.push(unslotted(label.layer, words[i] ?? ''));
    });

    layers.push(depthGroup(ctx, 'milestones', cards), head);
    return layers;
  };

  return defineScene(variant, { textSlots: [headline, labels], build });
}

function unslotted(layer: Layer, words: string): Layer {
  if (layer.type !== 'text') return layer;
  const { slot: _slot, ...props } = layer.props;
  return { ...layer, props: { ...props, text: words } };
}
