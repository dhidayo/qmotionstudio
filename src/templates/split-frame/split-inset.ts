import { colorFill, roleFill, type Keyframe, type Layer } from '@/core/types';
import { fontString } from '@/fonts/registry';
import type { SceneInputs } from '@/document/types';
import type { BuildContext } from '../buildContext';
import type { SceneTemplate } from '../schema';
import { FULL_BLEED_LOOK, BODY_STYLE, HEADLINE_STYLE } from '../_shared/look';
import { fillSlots, photoProps } from '../_shared/photo';
import { specFor, textFor } from '../_shared/text';
import { contentFloor, logoLayers } from '../_shared/chrome';

const kf = (t: number, v: number, ease: Keyframe['ease'] = 'outCubic'): Keyframe => ({ t, v, ease });

const SLOTS = {
  headline: {
    id: 'headline',
    label: 'Headline',
    placeholder: 'And the details',
    maxChars: 40,
    defaultStyle: { ...HEADLINE_STYLE, align: 'left' as const },
  },
  caption: {
    id: 'caption',
    label: 'Caption',
    placeholder: 'Hand-stitched, edge-painted, numbered',
    maxChars: 60,
    defaultStyle: { ...BODY_STYLE, align: 'left' as const },
  },
};

/**
 * Picture in Picture.
 *
 * One photograph filling the frame and the rest of them inset along the bottom
 * edge, bordered and shadowed so they sit above it. The hero-and-details layout:
 * the wide shot establishes the thing and the insets prove it, which is how a
 * product listing, a room, or a place gets sold.
 *
 * Panels gives every photograph equal weight and Contact Sheet gives them all the
 * same size. This is the one arrangement in the category that is deliberately
 * unequal — there is a subject and there is evidence, and flattening that
 * hierarchy is what makes a set of photographs read as a contact sheet instead of
 * as an argument.
 *
 * The insets need no mask. An image layer covers its own declared box, so the
 * crop is already the inset's frame; a mask would buy nothing and cost a buffer.
 */
function build(inputs: SceneInputs, ctx: BuildContext): Layer[] {
  const { design, safe, durationMs } = ctx;
  const unit = Math.min(design.w, design.h);
  const layers: Layer[] = [];

  const count = Math.max(2, Math.min(inputs.photos.length || 3, 4));
  const photos = fillSlots(inputs.photos, count);
  const [hero, ...details] = photos;

  if (hero) {
    const props = photoProps(hero, Math.max(design.w, design.h) * 1.16);
    layers.push({
      id: ctx.id('hero'),
      type: 'image',
      startMs: 0,
      endMs: durationMs,
      tracks: {
        x: [kf(0, design.w / 2)],
        y: [kf(0, design.h / 2)],
        // Pushing in slowly, so the insets arriving over it have something to
        // arrive over.
        scaleX: [kf(0, 1, 'inOutSine'), kf(durationMs, 1.11, 'inOutSine')],
        scaleY: [kf(0, 1, 'inOutSine'), kf(durationMs, 1.11, 'inOutSine')],
        opacity: [kf(0, 0), kf(420, 1)],
      },
      props,
    });
  }

  layers.push({
    id: ctx.id('scrim'),
    type: 'gradient',
    startMs: 0,
    endMs: durationMs,
    tracks: { x: [kf(0, design.w / 2)], y: [kf(0, design.h / 2)] },
    props: {
      w: design.w,
      h: design.h,
      gradient: 'linear',
      angle: 270,
      stops: [
        { at: 0, paint: colorFill('rgba(0,0,0,0.84)') },
        { at: 0.45, paint: colorFill('rgba(0,0,0,0.35)') },
        { at: 1, paint: colorFill('rgba(0,0,0,0.1)') },
      ],
    },
  });

  const headline = textFor(SLOTS.headline, inputs, {
    baseSizePx: unit * 0.06,
    maxWidthPx: safe.w * 0.62,
    reveal: { kind: 'perWord', startMs: 500, durationMs: 460, staggerMs: 74 },
    lineHeight: 1.06,
  });
  const caption = textFor(SLOTS.caption, inputs, {
    baseSizePx: unit * 0.022,
    maxWidthPx: safe.w * 0.56,
    reveal: { kind: 'fade', startMs: 1_050, durationMs: 620 },
    fallbackFill: roleFill('inkMuted'),
  });

  const headRun = ctx.measure(specFor(headline, fontString(headline.fontId, headline.fontSizePx, headline.weight)));
  const capRun = ctx.measure(specFor(caption, fontString(caption.fontId, caption.fontSizePx, caption.weight)));

  const insetCount = details.length;
  const gap = unit * 0.02;
  // Sized from whatever the row of them needs, capped so two insets do not
  // become two half-frames.
  const insetBase = insetCount > 0
    ? Math.min(unit * 0.2, (safe.w * 0.62 - gap * (insetCount - 1)) / insetCount)
    : 0;
  const insetH = insetBase * 1.06;

  const rowBottom = contentFloor(design, safe);
  const rowCentreY = rowBottom - insetH / 2;

  const typeBottom = insetCount > 0 ? rowCentreY - insetH / 2 - unit * 0.035 : rowBottom;
  const typeTop = typeBottom - capRun.height - unit * 0.022 - headRun.height;

  layers.push({
    id: ctx.id('headline'),
    type: 'text',
    startMs: 0,
    endMs: durationMs,
    anchorX: 0,
    anchorY: 0,
    tracks: {
      x: [kf(0, safe.x)],
      y: [kf(500, typeTop + unit * 0.016), kf(1_140, typeTop, 'outExpo')],
    },
    props: headline,
  });

  layers.push({
    id: ctx.id('caption'),
    type: 'text',
    startMs: 0,
    endMs: durationMs,
    anchorX: 0,
    anchorY: 0,
    tracks: {
      x: [kf(0, safe.x)],
      y: [kf(0, typeTop + headRun.height + unit * 0.022)],
    },
    props: caption,
  });

  details.forEach((photo, index) => {
    const x = safe.x + insetBase / 2 + index * (insetBase + gap);
    const delay = 1_300 + ctx.stagger(index, insetCount, 170, 'start');

    const props = photoProps(photo, insetBase, {
      cornerRadius: inputs.look.cornerRadius,
      shadow: { blur: unit * 0.045, offsetX: 0, offsetY: unit * 0.012, paint: colorFill('rgba(0,0,0,0.7)') },
      border: { inset: 0, paint: roleFill('ink', 0.85), width: Math.max(1, unit * 0.004) },
    });

    layers.push({
      id: ctx.id('inset'),
      type: 'image',
      startMs: 0,
      endMs: durationMs,
      tracks: {
        x: [kf(0, x)],
        y: [kf(delay, rowCentreY + insetH * 0.7), kf(delay + 760, rowCentreY, 'outExpo')],
        scaleX: [kf(delay, 0.9), kf(delay + 760, 1, { kind: 'spring', stiffness: 180, damping: 16, mass: 1 })],
        scaleY: [kf(delay, 0.9), kf(delay + 760, 1, { kind: 'spring', stiffness: 180, damping: 16, mass: 1 })],
        rotation: [kf(delay, (index % 2 === 0 ? -1 : 1) * 3), kf(delay + 760, 0, 'outExpo')],
        opacity: [kf(0, 0), kf(delay, 0), kf(delay + 240, 1)],
      },
      props,
    });
  });

  layers.push(...logoLayers(inputs, ctx));

  return layers;
}

const template: SceneTemplate = {
  kind: 'scene',
  id: 'split-inset',
  name: 'Picture in Picture',
  category: 'Split Frame',
  mode: 'both',
  tier: 'pro',
  isNew: true,
  designSize: { w: 1080, h: 1080 },
  supportedAspects: ['16:9', '4:3', '1:1', '4:5', '9:16'],
  defaultDurationMs: 8_000,
  minDurationMs: 4_000,
  maxDurationMs: 30_000,
  photoSlots: { min: 2, max: 4, default: 3 },
  textSlots: [SLOTS.headline, SLOTS.caption],
  supportsLogo: true,
  look: FULL_BLEED_LOOK,
  build,
};

export default template;
