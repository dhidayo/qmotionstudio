import { colorFill, roleFill, type Keyframe, type Layer } from '@/core/types';
import { fontString } from '@/fonts/registry';
import type { SceneInputs } from '@/document/types';
import type { BuildContext } from '../buildContext';
import type { SceneTemplate } from '../schema';
import { FULL_LOOK, BODY_STYLE, HEADLINE_STYLE } from '../_shared/look';
import { fillSlots, photoProps } from '../_shared/photo';
import { specFor, textFor } from '../_shared/text';
import { backgroundLayer, contentFloor, logoLayers } from '../_shared/chrome';

const kf = (t: number, v: number, ease: Keyframe['ease'] = 'outCubic'): Keyframe => ({ t, v, ease });

const SLOTS = {
  headline: {
    id: 'headline',
    label: 'Headline',
    placeholder: 'Turn it over',
    maxChars: 38,
    defaultStyle: { ...HEADLINE_STYLE, align: 'center' as const },
  },
  caption: {
    id: 'caption',
    label: 'Caption',
    placeholder: 'Every side of it',
    maxChars: 48,
    defaultStyle: { ...BODY_STYLE, align: 'center' as const, letterSpacingPct: 10, weight: 600 as const },
  },
};

/**
 * Flip Cards.
 *
 * One card in the middle of the frame, and the photographs turn through it on a
 * vertical axis. The move everyone already knows from a deck of cards being
 * turned over, which is why it needs no explaining: the card narrows to its
 * edge, and what comes back is the next photograph.
 *
 * Canvas has no perspective transform, so the turn is a horizontal squeeze. The
 * squeeze stops at 4% rather than at zero, and that detail is the whole illusion
 * — a card that vanishes at the axis reads as a card that was deleted, while a
 * sliver with a shadow on it reads as a card seen edge-on. It darkens on the way
 * in, because an edge catches almost no light.
 *
 * The handover needs no crossfade and no overlap. Each photograph's layer ends
 * at exactly the millisecond the next one's begins, both at the same sliver, so
 * the renderer's own time window does the swap and no frame ever holds two.
 *
 * The pips along the bottom are not decoration. A template that cycles without
 * saying how many there are leaves the viewer unsure whether it has finished,
 * and that is the difference between watching to the end and scrolling past.
 */
function build(inputs: SceneInputs, ctx: BuildContext): Layer[] {
  const { design, safe, durationMs } = ctx;
  const unit = Math.min(design.w, design.h);
  const layers: Layer[] = [backgroundLayer(inputs, ctx)];

  const count = Math.max(2, Math.min(inputs.photos.length || 3, 6));
  const photos = fillSlots(inputs.photos, count);
  const turnMs = durationMs / count;
  const flipMs = Math.min(460, turnMs * 0.3);

  const headline = textFor(SLOTS.headline, inputs, {
    baseSizePx: unit * 0.06,
    maxWidthPx: safe.w * 0.86,
    reveal: { kind: 'perWord', startMs: 200, durationMs: 440, staggerMs: 72 },
    lineHeight: 1.08,
  });
  const caption = textFor(SLOTS.caption, inputs, {
    baseSizePx: unit * 0.021,
    maxWidthPx: safe.w * 0.7,
    reveal: { kind: 'fade', startMs: 700, durationMs: 560 },
    fallbackFill: roleFill('accent'),
  });

  const headRun = ctx.measure(specFor(headline, fontString(headline.fontId, headline.fontSizePx, headline.weight)));
  const capRun = ctx.measure(specFor(caption, fontString(caption.fontId, caption.fontSizePx, caption.weight)));

  const pipH = Math.max(3, unit * 0.007);
  const pipW = unit * 0.026;
  const pipGap = unit * 0.014;
  const pipY = contentFloor(design, safe) - pipH / 2;

  const capTop = pipY - pipH - unit * 0.03 - capRun.height;
  const stageTop = safe.y + headRun.height + unit * 0.04;
  const stageH = Math.max(unit * 0.26, capTop - unit * 0.03 - stageTop);

  const cardBase = Math.min(safe.w * 0.78, stageH * 0.88, unit * 0.62);
  const cardX = design.w / 2;
  const cardY = stageTop + stageH / 2;

  /** How far the card closes at its edge. Never zero — see the note above. */
  const EDGE = 0.04;
  const EDGE_DIM = 0.5;

  photos.forEach((photo, index) => {
    const from = index * turnMs;
    const props = photoProps(photo, cardBase, {
      cornerRadius: inputs.look.cornerRadius,
      shadow: { blur: unit * 0.06, offsetX: 0, offsetY: unit * 0.018, paint: colorFill('rgba(0,0,0,0.6)') },
    });

    layers.push({
      id: ctx.id('card'),
      type: 'image',
      startMs: from,
      endMs: from + turnMs,
      tracks: {
        x: [kf(0, cardX)],
        y: [kf(0, cardY)],
        scaleX: [
          kf(0, EDGE),
          kf(flipMs, 1, 'outQuad'),
          kf(turnMs - flipMs, 1),
          kf(turnMs, EDGE, 'inQuad'),
        ],
        // A touch of lift as the card faces the viewer, so the turn has weight.
        scaleY: [kf(0, 0.97), kf(flipMs, 1, 'outQuad'), kf(turnMs - flipMs, 1), kf(turnMs, 0.97, 'inQuad')],
        rotation: [kf(0, -5), kf(flipMs, 0, 'outQuad'), kf(turnMs - flipMs, 0), kf(turnMs, 5, 'inQuad')],
        opacity: [
          kf(0, EDGE_DIM),
          kf(flipMs, 1, 'outQuad'),
          kf(turnMs - flipMs, 1),
          kf(turnMs, EDGE_DIM, 'inQuad'),
        ],
      },
      props,
    });
  });

  // Pips: a resting row for the whole scene, then a lit one per turn on top.
  const pipsW = count * pipW + (count - 1) * pipGap;
  const pipX = (index: number): number => design.w / 2 - pipsW / 2 + pipW / 2 + index * (pipW + pipGap);

  const pip = (index: number, lit: boolean, startMs: number, endMs: number): Layer => ({
    id: ctx.id(lit ? 'pip-lit' : 'pip'),
    type: 'shape',
    startMs,
    endMs,
    tracks: {
      x: [kf(0, pipX(index))],
      y: [kf(0, pipY)],
      opacity: lit ? [kf(0, 0), kf(180, 1)] : [kf(0, 0), kf(600, 0.26)],
    },
    props: {
      shape: 'rect',
      w: pipW,
      h: pipH,
      fill: lit ? roleFill('accent') : roleFill('ink'),
      cornerRadius: pipH / 2,
    },
  });

  for (let index = 0; index < count; index++) layers.push(pip(index, false, 0, durationMs));
  for (let index = 0; index < count; index++) {
    layers.push(pip(index, true, index * turnMs, index * turnMs + turnMs));
  }

  layers.push({
    id: ctx.id('headline'),
    type: 'text',
    startMs: 0,
    endMs: durationMs,
    anchorX: 0.5,
    anchorY: 0,
    tracks: { x: [kf(0, design.w / 2)], y: [kf(0, safe.y)] },
    props: headline,
  });

  layers.push({
    id: ctx.id('caption'),
    type: 'text',
    startMs: 0,
    endMs: durationMs,
    anchorX: 0.5,
    anchorY: 0,
    tracks: { x: [kf(0, design.w / 2)], y: [kf(0, capTop)] },
    props: caption,
  });

  layers.push(...logoLayers(inputs, ctx));

  return layers;
}

const template: SceneTemplate = {
  kind: 'scene',
  id: 'angle-flip',
  name: 'Flip Cards',
  category: 'Angle Stage',
  mode: 'both',
  tier: 'free',
  isNew: true,
  designSize: { w: 1080, h: 1080 },
  supportedAspects: ['16:9', '4:3', '1:1', '4:5', '9:16'],
  defaultDurationMs: 9_000,
  minDurationMs: 4_000,
  maxDurationMs: 30_000,
  photoSlots: { min: 2, max: 6, default: 3 },
  textSlots: [SLOTS.headline, SLOTS.caption],
  supportsLogo: true,
  look: FULL_LOOK,
  build,
};

export default template;
