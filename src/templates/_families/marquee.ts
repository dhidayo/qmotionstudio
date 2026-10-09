import { roleFill, type Layer } from '@/core/types';
import type { SceneInputs } from '@/document/types';
import type { BuildContext } from '../buildContext';
import { flag, num, pick, text, type SceneVariant } from '../catalog';
import type { SceneTemplate } from '../schema';
import { backgroundLayer } from '../_shared/chrome';
import { fillSlots, untagged } from '../_shared/photo';
import { cardCount, cardProps, defineScene, depthGroup, headlineAndStage, headlineSlot, kf, rect, sampled } from './kit';

/**
 * Marquee (D-119): rows and columns of photographs that never stop — a
 * ticker, a tilted wall, a film strip, columns drifting at their own pace.
 *
 * A row is longer than the frame and wraps; the wrap is a cut (see
 * `sampled`), so no card ever streaks back across. Only the first copy of each
 * photo is the selectable original; the copies that fill the rows repeat it.
 */

type Shape = 'ticker' | 'tilted' | 'mosaic' | 'columns' | 'wall' | 'pillar' | 'filmstrip';

const SHAPES: readonly Shape[] = ['ticker', 'tilted', 'mosaic', 'columns', 'wall', 'pillar', 'filmstrip'];

export function create(variant: SceneVariant): SceneTemplate {
  const p = variant.params;
  const shape = pick<Shape>(p, 'shape', SHAPES, 'ticker');
  const headline = headlineSlot(text(p, 'headline', 'Always something new'), {}, 50);

  const build = (inputs: SceneInputs, ctx: BuildContext): Layer[] => {
    const { durationMs, design } = ctx;
    const n = cardCount(inputs, variant);
    const photos = fillSlots(inputs.photos, n);
    const { headline: head, stage } = headlineAndStage(ctx, inputs, headline, { bottom: flag(p, 'textBelow') });
    const u = Math.min(design.w, design.h);
    const vertical = shape === 'columns' || shape === 'wall' || shape === 'pillar';
    const lanes = shape === 'ticker' || shape === 'filmstrip' || shape === 'pillar' ? 1 : num(p, 'lanes', shape === 'wall' ? 4 : 3);
    const angle = shape === 'tilted' ? num(p, 'angle', -12) : 0;
    const rad = (angle * Math.PI) / 180;

    // Lane geometry: lanes across the short way, cards along the long way.
    const across = vertical ? stage.w : stage.h;
    // A single horizontal row in a tall frame is limited by the width, or one
    // card fills the screen.
    const single = shape === 'ticker' || shape === 'filmstrip';
    const laneSize = Math.min(
      (across / lanes) * (single ? 0.62 : shape === 'pillar' ? 0.5 : 0.9),
      single ? stage.w * 0.42 : Number.POSITIVE_INFINITY,
    );
    const card = laneSize * 0.92;
    const step = card * (shape === 'filmstrip' ? 1.08 : 1.12);
    const along = (vertical ? design.h : Math.hypot(design.w, design.h)) + step * 2;
    const perLane = Math.ceil(along / step) + 1;
    const span = perLane * step;
    const cycleMs = durationMs / Math.max(1, Math.round(num(p, 'loops', 1)));

    const layers: Layer[] = [backgroundLayer(inputs, ctx)];
    if (shape === 'filmstrip') {
      // The strip itself, with sprocket holes along both edges.
      const stripH = card * 1.32;
      layers.push(rect(ctx, 'strip', { w: design.w * 1.2, h: stripH, x: stage.cx, y: stage.cy, fill: roleFill('surface') }));
      const holes = Math.ceil(design.w / (u * 0.05)) + 2;
      for (const edge of [-1, 1]) {
        for (let h = 0; h < holes; h++) {
          const baseX = h * u * 0.05;
          layers.push(rect(ctx, 'hole', {
            w: u * 0.024, h: u * 0.018, x: 0, y: stage.cy + edge * stripH * 0.42, radius: u * 0.004, fill: roleFill('bg'),
            tracks: sampled(0, durationMs, 100, (ms) => ({ x: ((baseX - (ms / cycleMs) * span) % (holes * u * 0.05) + holes * u * 0.05) % (holes * u * 0.05) - u * 0.05, y: stage.cy + edge * stripH * 0.42 }), u * 0.5),
          }));
        }
      }
    }

    const cards: Layer[] = [];
    let k = 0;
    for (let lane = 0; lane < lanes; lane++) {
      const offsetAcross = (lane - (lanes - 1) / 2) * (across / lanes);
      const direction = shape === 'wall' || shape === 'mosaic' || shape === 'tilted' ? (lane % 2 === 0 ? 1 : -1) : shape === 'pillar' ? -1 : 1;
      const speed = shape === 'columns' ? 0.6 + (lane % 3) * 0.3 : shape === 'mosaic' ? 0.8 + (lane % 2) * 0.4 : 1;
      const stagger = shape === 'mosaic' || shape === 'wall' || shape === 'columns' ? (lane % 2) * step * 0.5 : 0;
      for (let c = 0; c < perLane; c++) {
        const photo = photos[k % n];
        if (!photo) continue;
        const original = k < n;
        k += 1;
        const start = c * step + stagger;
        const tracks = sampled(0, durationMs, 80, (ms) => {
          const travelled = direction * (ms / cycleMs) * span * speed;
          const pos = ((start + travelled) % span + span) % span - span / 2;
          const ax = vertical ? stage.cx + offsetAcross : stage.cx + pos * Math.cos(rad) - offsetAcross * Math.sin(rad);
          const ay = vertical ? stage.cy + pos : stage.cy + pos * Math.sin(rad) + offsetAcross * Math.cos(rad);
          return { x: ax, y: ay, rotation: angle };
        }, step * 3);
        const props = cardProps(photo, card, inputs, u, shape !== 'filmstrip');
        cards.push({
          id: ctx.id('tile'),
          type: 'image',
          startMs: 0,
          endMs: durationMs,
          tracks: { ...tracks, opacity: [kf(0, 0), kf(400 + lane * 120, 1)] },
          props: original ? props : untagged(props),
        });
      }
    }
    layers.push(depthGroup(ctx, 'lanes', cards));
    // Rows that run edge to edge pass under the headline: a band of the
    // background behind it keeps the words legible.
    const bandBottom = stage.cy - stage.h / 2;
    layers.push(rect(ctx, 'headBand', { w: design.w, h: bandBottom, x: 0, y: 0, anchorX: 0, anchorY: 0, fill: roleFill('bg', 0.82) }));
    layers.push(head);
    return layers;
  };

  return defineScene(variant, { textSlots: [headline], build });
}
