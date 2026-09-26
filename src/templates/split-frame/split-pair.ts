import { colorFill, roleFill, type Keyframe, type Layer } from '@/core/types';
import { fontString } from '@/fonts/registry';
import type { SceneInputs } from '@/document/types';
import type { BuildContext } from '../buildContext';
import type { SceneTemplate } from '../schema';
import { FULL_BLEED_LOOK, BODY_STYLE, HEADLINE_STYLE } from '../_shared/look';
import { fillSlots, photoProps } from '../_shared/photo';
import { specFor, textFor } from '../_shared/text';
import { logoLayers } from '../_shared/chrome';

const kf = (t: number, v: number, ease: Keyframe['ease'] = 'outCubic'): Keyframe => ({ t, v, ease });

const SLOTS = {
  headline: {
    id: 'headline',
    label: 'Headline',
    placeholder: 'Before and after',
    maxChars: 46,
    defaultStyle: { ...HEADLINE_STYLE, align: 'center' as const },
  },
  caption: {
    id: 'caption',
    label: 'Caption',
    placeholder: 'Six weeks apart',
    maxChars: 60,
    defaultStyle: { ...BODY_STYLE, align: 'center' as const },
  },
};

/**
 * Split Pair.
 *
 * Two photographs meeting on a hard seam, arriving from opposite edges. The
 * comparison shot: before and after, two products, two places — the layout
 * people reach for most often and the one the library did not have.
 *
 * The seam is the whole idea, so it is drawn rather than implied: a thin rule
 * in the accent colour sits on the join and grows out from the centre as the
 * halves land. Without it, two photographs of similar tone read as one badly
 * cropped picture.
 *
 * The split follows the frame: side by side when there is width to spare,
 * stacked when there is not. A 9:16 frame cut vertically gives two slivers
 * nobody can read.
 */
function build(inputs: SceneInputs, ctx: BuildContext): Layer[] {
  const { design, safe, durationMs } = ctx;
  const unit = Math.min(design.w, design.h);
  const layers: Layer[] = [];

  const photos = fillSlots(inputs.photos, 2);
  const [first, second] = photos;
  if (!first || !second) return layers;

  const sideBySide = design.w >= design.h;
  const halfW = sideBySide ? design.w / 2 : design.w;
  const halfH = sideBySide ? design.h : design.h / 2;

  // Each half is oversized so the slide-in never exposes an edge, and cropped
  // by its own position rather than by a mask — two image layers meeting on a
  // seam is cheaper than a mask and does not need a buffer.
  const bleed = 1.12;

  photos.forEach((photo, index) => {
    const props = photoProps(photo, Math.max(halfW, halfH) * bleed);
    const home = sideBySide
      ? { x: halfW * (index === 0 ? 0.5 : 1.5), y: design.h / 2 }
      : { x: design.w / 2, y: halfH * (index === 0 ? 0.5 : 1.5) };

    // Opposite directions, so the two halves close on the seam together.
    const from = sideBySide
      ? { x: home.x + (index === 0 ? -unit * 0.34 : unit * 0.34), y: home.y }
      : { x: home.x, y: home.y + (index === 0 ? -unit * 0.34 : unit * 0.34) };

    const settle = 760;

    layers.push({
      id: ctx.id('half'),
      type: 'image',
      startMs: 0,
      endMs: durationMs,
      tracks: {
        x: [kf(0, from.x), kf(settle, home.x, 'outExpo')],
        y: [kf(0, from.y), kf(settle, home.y, 'outExpo')],
        // A slow drift afterwards, so the frame never becomes a still.
        scaleX: [kf(0, 1.06, 'inOutSine'), kf(durationMs, 1, 'inOutSine')],
        scaleY: [kf(0, 1.06, 'inOutSine'), kf(durationMs, 1, 'inOutSine')],
        opacity: [kf(0, 0), kf(320, 1)],
      },
      props,
    });
  });

  // The seam, growing out of the centre as the halves arrive.
  const seamThickness = Math.max(2, unit * 0.005);
  layers.push({
    id: ctx.id('seam'),
    type: 'shape',
    startMs: 0,
    endMs: durationMs,
    tracks: {
      x: [kf(0, design.w / 2)],
      y: [kf(0, design.h / 2)],
      scaleX: sideBySide
        ? [kf(0, 1)]
        : [kf(300, 0), kf(1_000, 1, 'outExpo')],
      scaleY: sideBySide
        ? [kf(300, 0), kf(1_000, 1, 'outExpo')]
        : [kf(0, 1)],
      opacity: [kf(0, 0), kf(300, 1)],
    },
    props: {
      shape: 'rect',
      w: sideBySide ? seamThickness : design.w,
      h: sideBySide ? design.h : seamThickness,
      fill: roleFill('accent'),
    },
  });

  // Type sits over the join, on a scrim of its own so it reads against either
  // photograph — a caption legible on one half and lost on the other is the
  // usual way this layout fails.
  const headline = textFor(SLOTS.headline, inputs, {
    baseSizePx: unit * 0.072,
    maxWidthPx: safe.w * 0.8,
    reveal: { kind: 'perWord', startMs: 900, durationMs: 460, staggerMs: 70 },
    lineHeight: 1.08,
  });
  const caption = textFor(SLOTS.caption, inputs, {
    baseSizePx: unit * 0.026,
    maxWidthPx: safe.w * 0.7,
    reveal: { kind: 'fade', startMs: 1_400, durationMs: 620 },
    fallbackFill: roleFill('inkMuted'),
  });

  const headRun = ctx.measure(specFor(headline, fontString(headline.fontId, headline.fontSizePx, headline.weight)));
  const capRun = ctx.measure(specFor(caption, fontString(caption.fontId, caption.fontSizePx, caption.weight)));

  const blockH = headRun.height + capRun.height + unit * 0.028;
  const blockTop = design.h / 2 - blockH / 2;
  const padY = unit * 0.05;

  layers.push({
    id: ctx.id('type-scrim'),
    type: 'gradient',
    startMs: 0,
    endMs: durationMs,
    tracks: {
      // Centred on the type block. Without a position it defaults to the
      // origin, which on a centre-anchored layer is the top-left corner —
      // so the scrim sat in the corner and the type had nothing behind it.
      x: [kf(0, design.w / 2)],
      y: [kf(0, blockTop + blockH / 2)],
      opacity: [kf(500, 0), kf(1_000, 1)],
    },
    props: {
      w: design.w,
      h: blockH + padY * 2,
      gradient: 'linear',
      angle: 90,
      stops: [
        { at: 0, paint: colorFill('rgba(0,0,0,0)') },
        { at: 0.5, paint: colorFill('rgba(0,0,0,0.68)') },
        { at: 1, paint: colorFill('rgba(0,0,0,0)') },
      ],
    },
  });

  layers.push({
    id: ctx.id('headline'),
    type: 'text',
    startMs: 0,
    endMs: durationMs,
    anchorX: 0.5,
    anchorY: 0,
    tracks: { x: [kf(0, design.w / 2)], y: [kf(0, blockTop)] },
    props: headline,
  });

  layers.push({
    id: ctx.id('caption'),
    type: 'text',
    startMs: 0,
    endMs: durationMs,
    anchorX: 0.5,
    anchorY: 0,
    tracks: { x: [kf(0, design.w / 2)], y: [kf(0, blockTop + headRun.height + unit * 0.028)] },
    props: caption,
  });

  layers.push(...logoLayers(inputs, ctx));

  return layers;
}

const template: SceneTemplate = {
  kind: 'scene',
  id: 'split-pair',
  name: 'Split Pair',
  category: 'Split Frame',
  mode: 'both',
  tier: 'free',
  isNew: true,
  designSize: { w: 1080, h: 1080 },
  supportedAspects: ['16:9', '4:3', '1:1', '4:5', '9:16'],
  defaultDurationMs: 7_000,
  minDurationMs: 3_000,
  maxDurationMs: 30_000,
  photoSlots: { min: 2, max: 2, default: 2 },
  textSlots: [SLOTS.headline, SLOTS.caption],
  supportsLogo: true,
  look: FULL_BLEED_LOOK,
  build,
};

export default template;
