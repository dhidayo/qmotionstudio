import { colorFill, roleFill, type Keyframe, type Layer } from '@/core/types';
import { fontString } from '@/fonts/registry';
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
    placeholder: 'The collection',
    maxChars: 36,
    defaultStyle: HEADLINE_STYLE,
  },
};

/**
 * Card Stack.
 *
 * Photos stacked face-on, dealt forward one at a time and looping. Each photo
 * gets an equal turn; the one on top slides up and fades while the rest shuffle
 * forward a step.
 *
 * The loop is seamless because every card's keyframes are expressed relative to
 * its own turn and the stack positions repeat exactly after n turns — a scene
 * that jumps on loop is the single most obvious flaw in this kind of template.
 */
function build(inputs: SceneInputs, ctx: BuildContext): Layer[] {
  const { design, safe, durationMs } = ctx;
  const unit = Math.min(design.w, design.h);
  const layers: Layer[] = [];

  const count = Math.max(2, Math.min(inputs.photos.length || 4, 8));
  const photos = fillSlots(inputs.photos, count);
  const turnMs = durationMs / count;

  const headline = textFor(SLOTS.headline, inputs, {
    baseSizePx: unit * 0.062,
    maxWidthPx: safe.w * 0.85,
    reveal: { kind: 'maskWipe', dir: 'right', startMs: 300, durationMs: 700 },
    lineHeight: 1.1,
  });
  const headRun = ctx.measure(specFor(headline, fontString(headline.fontId, headline.fontSizePx, headline.weight)));

  const headTop = safe.y;
  const stageTop = headTop + headRun.height + unit * 0.05;
  const stageH = Math.max(unit * 0.3, safe.y + safe.h - stageTop);
  const stageCentreY = stageTop + stageH / 2;
  // Sized so the whole ladder fits, not just the top card: deeper cards step
  // down the frame, so the stack needs more room than one photo.
  const cardSize = Math.min(unit * 0.52, stageH * 0.58);

  layers.push(backgroundLayer(inputs, ctx));

  // Resting places in the stack: index 0 is on top, each one behind is a little
  // smaller, lower and rotated. Reused by every card as it cycles through.
  /**
   * Resting places in the stack. Index 0 is on top.
   *
   * The offset has to beat the scale shrink, or the card behind hides inside
   * the one in front: a card 7% shorter is already 3.5% of its height higher at
   * the bottom edge, so an offset of the same order peeks by almost nothing.
   * That is why the first two passes read as one card with a coloured fringe.
   * Shallow scale falloff, generous vertical step.
   */
  const cardH = cardSize / Math.sqrt(0.75);
  const restingAt = (slot: number): { y: number; scale: number; rotation: number; opacity: number } => ({
    y: stageCentreY + slot * cardH * 0.12,
    scale: 1 - slot * 0.05,
    rotation: (slot % 2 === 0 ? 1 : -1) * slot * 4,
    opacity: slot >= count ? 0 : 1 - slot * 0.14,
  });

  /**
   * Layers are SLOTS, not photos.
   *
   * The renderer draws layers in the order a template emits them, and that
   * order is fixed at build time. A stack whose cards cycle has a z-order that
   * *changes* — the card on top this turn is at the back two turns later — and
   * a fixed list cannot express that. Emitting one layer per photo produced a
   * stack that rendered correctly for one turn in four and painted rear cards
   * over the front one for the rest.
   *
   * So each slot gets its own layer at a fixed depth, and photos cycle through
   * the slots by appearing only during the turn they occupy one. Draw order
   * becomes slot order, which never changes, and the loop is seamless because
   * turn indices wrap.
   *
   * Cost is one layer per (slot, photo) pair — 64 at the eight-photo maximum.
   * Layers outside their time window cost a comparison each, so this is cheap.
   */
  for (let slot = count - 1; slot >= 0; slot--) {
    const rest = restingAt(slot);

    for (let photoIndex = 0; photoIndex < count; photoIndex++) {
      const photo = photos[photoIndex];
      if (!photo) continue;

      // The turn during which this photo sits in this slot.
      const turn = (photoIndex - slot + count) % count;
      const from = turn * turnMs;
      const to = from + turnMs;

      const props = photoProps(photo, cardSize, {
        cornerRadius: inputs.look.cornerRadius,
        shadow: { blur: unit * 0.06, offsetX: 0, offsetY: unit * 0.018, paint: colorFill('rgba(0,0,0,0.55)') },
        border: { inset: 0, paint: roleFill('ink', 0.1), width: Math.max(1, unit * 0.002) },
      });

      const isFront = slot === 0;
      const exitMs = Math.min(620, turnMs * 0.45);
      const leaves = turnMs - exitMs;

      // Keyframes are relative to the layer's own start (D-005), so each of
      // these reads as "during my turn" regardless of which turn that is.
      const yTrack: Keyframe[] = isFront
        ? [kf(0, rest.y), kf(leaves, rest.y, 'inCubic'), kf(turnMs, rest.y - cardH * 0.9, 'inCubic')]
        : [kf(0, rest.y)];

      const scaleTrack: Keyframe[] = isFront
        ? [kf(0, rest.scale), kf(leaves, rest.scale), kf(turnMs, rest.scale * 1.06, 'inCubic')]
        : [kf(0, rest.scale)];

      const rotationTrack: Keyframe[] = isFront
        ? [kf(0, rest.rotation), kf(leaves, rest.rotation), kf(turnMs, rest.rotation - 7, 'inCubic')]
        : [kf(0, rest.rotation)];

      // The deepest slot fades in rather than appearing, so a photo arriving at
      // the back of the stack does not pop into existence mid-frame.
      const fadeIn = Math.min(260, turnMs * 0.3);
      const opacityTrack: Keyframe[] = isFront
        ? [kf(0, rest.opacity), kf(leaves, rest.opacity), kf(turnMs, 0, 'inCubic')]
        : slot === count - 1 && count > 1
          ? [kf(0, 0), kf(fadeIn, rest.opacity)]
          : [kf(0, rest.opacity)];

      layers.push({
        id: ctx.id(`slot${slot}`),
        type: 'image',
        startMs: from,
        endMs: to,
        tracks: {
          x: [kf(0, design.w / 2)],
          y: yTrack,
          scaleX: scaleTrack,
          scaleY: scaleTrack,
          rotation: rotationTrack,
          opacity: opacityTrack,
        },
        props,
      });
    }
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
  id: 'depth-stack',
  name: 'Card Stack',
  category: 'Depth Stage',
  mode: 'both',
  tier: 'free',
  isNew: true,
  designSize: { w: 1080, h: 1080 },
  supportedAspects: ['1:1', '4:5', '9:16', '4:3'],
  defaultDurationMs: 12_000,
  minDurationMs: 4_000,
  maxDurationMs: 40_000,
  photoSlots: { min: 2, max: 8, default: 4 },
  textSlots: [SLOTS.headline],
  supportsLogo: true,
  look: FULL_LOOK,
  build,
};

export default template;
