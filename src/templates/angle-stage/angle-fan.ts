import { colorFill, roleFill, type Keyframe, type Layer } from '@/core/types';
import { fontString } from '@/fonts/registry';
import { SPRINGS } from '@/core/anim/spring';
import type { SceneInputs } from '@/document/types';
import type { BuildContext } from '../buildContext';
import type { SceneTemplate } from '../schema';
import { FULL_LOOK, HEADLINE_STYLE } from '../_shared/look';
import { fillSlots, photoProps } from '../_shared/photo';
import { specFor, textFor } from '../_shared/text';
import { backgroundLayer, logoLayers } from '../_shared/chrome';

const kf = (t: number, v: number, ease: Keyframe['ease'] = 'outCubic'): Keyframe => ({ t, v, ease });

const SLOTS = {
  headline: {
    id: 'headline',
    label: 'Headline',
    placeholder: 'All of it, at once',
    maxChars: 40,
    defaultStyle: HEADLINE_STYLE,
  },
};

/**
 * Fan Out.
 *
 * Photos fanned across an arc, springing out from the centre and then swaying
 * gently. Every photo's position comes from ctx.arc and its delay from
 * ctx.stagger, so three photos and eight photos are the same code — which is
 * the entire point of §3B's generator model.
 *
 * Depth-sorted from the middle outwards, so the fan reads as overlapping cards
 * rather than as a flat row.
 */
function build(inputs: SceneInputs, ctx: BuildContext): Layer[] {
  const { design, safe, durationMs } = ctx;
  const unit = Math.min(design.w, design.h);
  const layers: Layer[] = [];

  const count = Math.max(3, Math.min(inputs.photos.length || 5, 8));
  const photos = fillSlots(inputs.photos, count);

  const headline = textFor(SLOTS.headline, inputs, {
    baseSizePx: unit * 0.072,
    maxWidthPx: safe.w * 0.86,
    reveal: { kind: 'perChar', startMs: 220, durationMs: 400, staggerMs: 24 },
    lineHeight: 1.08,
  });
  const headRun = ctx.measure(specFor(headline, fontString(headline.fontId, headline.fontSizePx, headline.weight)));

  const headTop = safe.y;
  const stageTop = headTop + headRun.height + unit * 0.05;
  const stageBottom = safe.y + safe.h;
  const stageH = Math.max(unit * 0.3, stageBottom - stageTop);

  // Sweep narrows as photos are added, so eight cards do not wrap into a circle.
  const sweep = Math.max(74, 132 - count * 6);
  const startAngle = 270 - sweep / 2;

  /**
   * Fit the fan to the stage.
   *
   * The arc spans the top of a circle, so its vertical extent is not the
   * radius: it runs from `cy - r` at the apex down to `cy + sin(start)·r` at
   * the ends, plus half a card at each edge. Placing the pivot by eye — a
   * fraction of the radius below the stage — overshoots at short aspects and
   * crops the outer cards, which is exactly what it did at 16:9.
   */
  const endSin = Math.sin((startAngle * Math.PI) / 180);
  let radius = Math.min(safe.w * 0.44, stageH * 0.62);
  let cardSize = Math.min(radius * 0.72, stageH * 0.52);

  const extentOf = (r: number, card: number): number => r * (1 + endSin) + card / Math.sqrt(0.75);
  if (extentOf(radius, cardSize) > stageH) {
    const shrink = stageH / extentOf(radius, cardSize);
    radius *= shrink;
    cardSize *= shrink;
  }

  const cardH = cardSize / Math.sqrt(0.75);
  const arcHeight = extentOf(radius, cardSize);
  // Centre the fan's own extent in the stage rather than the circle's centre.
  const cy = stageTop + (stageH - arcHeight) / 2 + radius + cardH / 2;

  const placements = ctx.arc(count, {
    radius,
    startAngle,
    endAngle: startAngle + sweep,
    cx: design.w / 2,
    cy,
    faceOutward: true,
  });

  layers.push(backgroundLayer(inputs, ctx));

  const middle = (count - 1) / 2;
  const ordered = ctx.depthSort(
    ctx.repeat(photos, (photo, i) => ({ photo, i, placement: placements[i] })),
    ({ i }) => -Math.abs(i - middle),
  );

  for (const { photo, i, placement } of ordered) {
    if (!placement) continue;

    const delay = ctx.stagger(i, count, 62, 'center');
    const props = photoProps(photo, cardSize, {
      cornerRadius: inputs.look.cornerRadius,
      shadow: { blur: unit * 0.05, offsetX: 0, offsetY: unit * 0.014, paint: colorFill('rgba(0,0,0,0.55)') },
      border: { inset: 0, paint: roleFill('ink', 0.12), width: Math.max(1, unit * 0.0022) },
    });

    // The sway is phase-shifted per card so the fan breathes rather than
    // moving as one rigid object.
    const phase = (i / Math.max(1, count)) * Math.PI * 2;
    const sway = Math.sin(phase) * 1.8;

    layers.push({
      id: ctx.id('card'),
      type: 'image',
      startMs: 0,
      endMs: durationMs,
      tracks: {
        x: [kf(0, placement.x)],
        y: [kf(delay, placement.y + unit * 0.1), kf(delay + 760, placement.y, SPRINGS.snappy)],
        rotation: [
          kf(delay, placement.rotation - 14),
          kf(delay + 760, placement.rotation + sway, SPRINGS.gentle),
          kf(durationMs / 2, placement.rotation - sway, 'inOutSine'),
          kf(durationMs, placement.rotation + sway, 'inOutSine'),
        ],
        scaleX: [kf(delay, 0.72), kf(delay + 760, 1, SPRINGS.bouncy)],
        scaleY: [kf(delay, 0.72), kf(delay + 760, 1, SPRINGS.bouncy)],
        opacity: [kf(delay, 0), kf(delay + 240, 1)],
      },
      props,
    });
  }

  layers.push({
    id: ctx.id('headline'),
    type: 'text',
    startMs: 0,
    endMs: durationMs,
    anchorX: 0.5,
    anchorY: 0,
    tracks: { x: [kf(0, design.w / 2)], y: [kf(0, headTop)] },
    props: headline,
  });

  layers.push(...logoLayers(inputs, ctx));

  return layers;
}

const template: SceneTemplate = {
  kind: 'scene',
  id: 'angle-fan',
  name: 'Fan Out',
  category: 'Angle Stage',
  mode: 'both',
  tier: 'free',
  designSize: { w: 1080, h: 1080 },
  supportedAspects: ['16:9', '4:3', '1:1', '4:5', '9:16'],
  defaultDurationMs: 10_000,
  minDurationMs: 4_000,
  maxDurationMs: 30_000,
  photoSlots: { min: 3, max: 8, default: 5 },
  textSlots: [SLOTS.headline],
  supportsLogo: true,
  look: FULL_LOOK,
  build,
};

export default template;
