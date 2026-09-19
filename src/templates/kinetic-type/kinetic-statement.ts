import { colorFill, roleFill, type Keyframe, type Layer } from '@/core/types';
import { fontString } from '@/fonts/registry';
import type { SceneInputs } from '@/document/types';
import type { BuildContext } from '../buildContext';
import type { SceneTemplate } from '../schema';
import { FULL_BLEED_LOOK, BODY_STYLE, HEADLINE_STYLE } from '../_shared/look';
import { fillSlots, photoProps } from '../_shared/photo';
import { specFor, textFor } from '../_shared/text';

const kf = (t: number, v: number, ease: Keyframe['ease'] = 'outCubic'): Keyframe => ({ t, v, ease });

const SLOTS = {
  headline: {
    id: 'headline',
    label: 'Headline',
    placeholder: 'Say the thing that matters',
    maxChars: 70,
    defaultStyle: { ...HEADLINE_STYLE, align: 'left' as const },
  },
  footer: {
    id: 'footer',
    label: 'Footer',
    placeholder: 'yourname.com',
    maxChars: 40,
    defaultStyle: { ...BODY_STYLE, align: 'left' as const, letterSpacingPct: 10, weight: 600 as const },
  },
};

/**
 * Statement.
 *
 * One photo, full bleed, under a headline that types itself in. The photo
 * drifts and scales slowly — a Ken Burns move — so a still image still reads as
 * footage rather than as a slide.
 *
 * The scrim is a gradient rather than a flat overlay: darkening the whole frame
 * to make text legible kills the photo, whereas a bottom-weighted ramp keeps
 * the upper two thirds intact.
 */
function build(inputs: SceneInputs, ctx: BuildContext): Layer[] {
  const { design, safe, durationMs } = ctx;
  const unit = Math.min(design.w, design.h);
  const layers: Layer[] = [];

  const [photo] = fillSlots(inputs.photos, 1);
  if (!photo) return layers;

  // Oversized on purpose: the Ken Burns move scales and pans, and a
  // frame-sized photo would show its own edges doing it.
  const bleed = 1.22;
  const props = photoProps(photo, Math.max(design.w, design.h) * bleed);

  layers.push({
    id: ctx.id('photo'),
    type: 'image',
    startMs: 0,
    endMs: durationMs,
    tracks: {
      x: [
        kf(0, design.w / 2 - unit * 0.03, 'inOutSine'),
        kf(durationMs, design.w / 2 + unit * 0.03, 'inOutSine'),
      ],
      y: [
        kf(0, design.h / 2 + unit * 0.02, 'inOutSine'),
        kf(durationMs, design.h / 2 - unit * 0.02, 'inOutSine'),
      ],
      scaleX: [kf(0, 1, 'inOutSine'), kf(durationMs, 1.09, 'inOutSine')],
      scaleY: [kf(0, 1, 'inOutSine'), kf(durationMs, 1.09, 'inOutSine')],
      opacity: [kf(0, 0), kf(700, 1)],
    },
    props: { ...props, w: props.w, h: props.h },
  });

  // Bottom-weighted scrim.
  layers.push({
    id: ctx.id('scrim'),
    type: 'gradient',
    startMs: 0,
    endMs: durationMs,
    anchorX: 0,
    anchorY: 0,
    tracks: {},
    props: {
      w: design.w,
      h: design.h,
      gradient: 'linear',
      angle: 90,
      stops: [
        { at: 0, paint: colorFill('rgba(0,0,0,0)') },
        { at: 0.42, paint: colorFill('rgba(0,0,0,0.12)') },
        { at: 0.78, paint: colorFill('rgba(0,0,0,0.62)') },
        { at: 1, paint: colorFill('rgba(0,0,0,0.86)') },
      ],
    },
  });

  const headline = textFor(SLOTS.headline, inputs, {
    baseSizePx: unit * 0.092,
    maxWidthPx: safe.w * 0.94,
    reveal: { kind: 'perWord', startMs: 620, durationMs: 520, staggerMs: 86 },
    lineHeight: 1.04,
  });
  const footer = textFor(SLOTS.footer, inputs, {
    baseSizePx: unit * 0.024,
    maxWidthPx: safe.w * 0.8,
    reveal: { kind: 'fade', startMs: 1500, durationMs: 700 },
    fallbackFill: roleFill('accent'),
  });

  const headRun = ctx.measure(specFor(headline, fontString(headline.fontId, headline.fontSizePx, headline.weight)));
  const footRun = ctx.measure(specFor(footer, fontString(footer.fontId, footer.fontSizePx, footer.weight)));

  const footTop = safe.y + safe.h - footRun.height;
  const headTop = footTop - unit * 0.045 - headRun.height;

  // A short accent rule above the headline, wiping in with it.
  layers.push({
    id: ctx.id('rule'),
    type: 'shape',
    startMs: 0,
    endMs: durationMs,
    anchorX: 0,
    anchorY: 0.5,
    tracks: {
      x: [kf(0, safe.x)],
      y: [kf(0, headTop - unit * 0.038)],
      scaleX: [kf(420, 0), kf(1000, 1, 'outExpo')],
    },
    props: {
      shape: 'rect',
      w: unit * 0.12,
      h: Math.max(2, unit * 0.007),
      fill: roleFill('accent'),
    },
  });

  layers.push({
    id: ctx.id('headline'),
    type: 'text',
    startMs: 0,
    endMs: durationMs,
    anchorX: 0,
    anchorY: 0,
    tracks: { x: [kf(0, safe.x)], y: [kf(0, headTop)] },
    props: headline,
  });

  layers.push({
    id: ctx.id('footer'),
    type: 'text',
    startMs: 0,
    endMs: durationMs,
    anchorX: 0,
    anchorY: 0,
    tracks: { x: [kf(0, safe.x)], y: [kf(0, footTop)] },
    props: footer,
  });

  return layers;
}

const template: SceneTemplate = {
  kind: 'scene',
  id: 'kinetic-statement',
  name: 'Statement',
  category: 'Kinetic Type',
  mode: 'both',
  tier: 'free',
  designSize: { w: 1080, h: 1080 },
  supportedAspects: ['16:9', '4:3', '1:1', '4:5', '9:16'],
  defaultDurationMs: 8_000,
  minDurationMs: 3_000,
  maxDurationMs: 30_000,
  photoSlots: { min: 1, max: 1, default: 1 },
  textSlots: [SLOTS.headline, SLOTS.footer],
  supportsLogo: true,
  look: FULL_BLEED_LOOK,
  build,
};

export default template;
