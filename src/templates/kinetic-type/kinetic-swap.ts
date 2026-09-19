import { colorFill, roleFill, type Keyframe, type Layer } from '@/core/types';
import { fontString } from '@/fonts/registry';
import { SPRINGS } from '@/core/anim/spring';
import type { SceneInputs } from '@/document/types';
import type { BuildContext } from '../buildContext';
import type { SceneTemplate } from '../schema';
import { FULL_LOOK, BODY_STYLE, HEADLINE_STYLE } from '../_shared/look';
import { fillSlots, photoProps } from '../_shared/photo';
import { specFor, textFor } from '../_shared/text';
import { backgroundLayer, logoLayers } from '../_shared/chrome';

const kf = (t: number, v: number, ease: Keyframe['ease'] = 'outCubic'): Keyframe => ({ t, v, ease });

const SLOTS = {
  headline: {
    id: 'headline',
    label: 'Headline',
    placeholder: 'Built for makers',
    maxChars: 34,
    defaultStyle: HEADLINE_STYLE,
    supportsAlt: true,
  },
  alt: {
    id: 'alt',
    label: 'Alt phrase',
    placeholder: 'Built for you',
    maxChars: 34,
    defaultStyle: HEADLINE_STYLE,
  },
  support: {
    id: 'support',
    label: 'Supporting line',
    placeholder: 'Everything renders on your device.',
    maxChars: 70,
    defaultStyle: BODY_STYLE,
  },
};

/**
 * Phrase Swap.
 *
 * Two phrases trading places over a photo held in a soft mask. Photos cycle
 * through the mask on the same beat as the phrase swap, so the two changes
 * land together rather than fighting each other for attention.
 *
 * The swap uses §6.3's `swap` reveal, which crossfades the primary text and the
 * alt phrase. Because the two strings measure differently, the layout is
 * anchored on the centre rather than on either string's width.
 */
function build(inputs: SceneInputs, ctx: BuildContext): Layer[] {
  const { design, safe, durationMs } = ctx;
  const unit = Math.min(design.w, design.h);
  const layers: Layer[] = [];

  const count = Math.max(1, Math.min(inputs.photos.length || 2, 3));
  const photos = fillSlots(inputs.photos, count);
  const turnMs = durationMs / count;

  const headline = textFor(SLOTS.headline, inputs, {
    baseSizePx: unit * 0.086,
    maxWidthPx: safe.w * 0.9,
    reveal: {
      kind: 'swap',
      altText: (inputs.texts[SLOTS.alt.id] ?? SLOTS.alt.placeholder).slice(0, SLOTS.alt.maxChars),
      atMs: durationMs * 0.45,
      durationMs: 900,
    },
    lineHeight: 1.04,
  });
  const support = textFor(SLOTS.support, inputs, {
    baseSizePx: unit * 0.026,
    maxWidthPx: safe.w * 0.7,
    reveal: { kind: 'fade', startMs: 800, durationMs: 700 },
    fallbackFill: roleFill('inkMuted'),
    lineHeight: 1.45,
  });

  const headRun = ctx.measure(specFor(headline, fontString(headline.fontId, headline.fontSizePx, headline.weight)));
  const supportRun = ctx.measure(specFor(support, fontString(support.fontId, support.fontSizePx, support.weight)));

  const supportTop = safe.y + safe.h - supportRun.height;
  const headTop = supportTop - unit * 0.05 - headRun.height;
  const stageBottom = headTop - unit * 0.06;
  const stageH = Math.max(unit * 0.24, stageBottom - safe.y);
  const maskSize = Math.min(stageH * 0.92, safe.w * 0.76, unit * 0.68);
  const maskCentreY = safe.y + stageH / 2;

  layers.push(backgroundLayer(inputs, ctx));

  // A ring behind the mask, slowly counter-rotating.
  layers.push({
    id: ctx.id('ring'),
    type: 'shape',
    startMs: 0,
    endMs: durationMs,
    tracks: {
      x: [kf(0, design.w / 2)],
      y: [kf(0, maskCentreY)],
      rotation: [kf(0, 0, 'linear'), kf(durationMs, -360, 'linear')],
      opacity: [kf(0, 0), kf(900, 1)],
    },
    props: {
      shape: 'ellipse',
      w: maskSize * 1.14,
      h: maskSize * 1.14,
      fill: colorFill('rgba(0,0,0,0)'),
      stroke: { paint: roleFill('accent', 0.55), width: Math.max(1, unit * 0.004) },
    },
  });

  // ── Photos cycling through the mask ───────────────────────────────────────
  const children: Layer[] = photos.map((photo, i) => {
    const props = photoProps(photo, maskSize * 1.08);
    const at = i * turnMs;
    const fade = Math.min(520, turnMs * 0.35);

    return {
      id: ctx.id('maskphoto'),
      type: 'image' as const,
      startMs: 0,
      endMs: durationMs,
      tracks: {
        x: [kf(0, 0)],
        y: [kf(0, 0)],
        // Each photo is visible only during its own turn, crossfading with its
        // neighbours. The last one also has to be present at t=0 so the loop
        // has no gap.
        opacity:
          count === 1
            ? [kf(0, 1)]
            : [
                kf(Math.max(0, at - fade), i === 0 ? 1 : 0),
                kf(at, 1),
                kf(at + turnMs - fade, 1),
                kf(at + turnMs, i === count - 1 ? 1 : 0),
              ],
        // A slow push, so the photo is never entirely still behind the type.
        scaleX: [kf(at, 1.04, 'inOutSine'), kf(at + turnMs, 1.12, 'inOutSine')],
        scaleY: [kf(at, 1.04, 'inOutSine'), kf(at + turnMs, 1.12, 'inOutSine')],
      },
      props,
    };
  });

  layers.push({
    id: ctx.id('mask'),
    type: 'mask',
    startMs: 0,
    endMs: durationMs,
    tracks: {
      x: [kf(0, design.w / 2)],
      y: [kf(0, maskCentreY)],
      scaleX: [kf(0, 0.6), kf(900, 1, SPRINGS.snappy)],
      scaleY: [kf(0, 0.6), kf(900, 1, SPRINGS.snappy)],
      opacity: [kf(0, 0), kf(420, 1)],
    },
    props: { shape: 'ellipse', w: maskSize, h: maskSize },
    children,
  });

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

  layers.push({
    id: ctx.id('support'),
    type: 'text',
    startMs: 0,
    endMs: durationMs,
    anchorX: 0.5,
    anchorY: 0,
    tracks: { x: [kf(0, design.w / 2)], y: [kf(0, supportTop)] },
    props: support,
  });

  layers.push(...logoLayers(inputs, ctx));

  return layers;
}

const template: SceneTemplate = {
  kind: 'scene',
  id: 'kinetic-swap',
  name: 'Phrase Swap',
  category: 'Kinetic Type',
  mode: 'both',
  tier: 'pro',
  isNew: true,
  designSize: { w: 1080, h: 1080 },
  supportedAspects: ['1:1', '4:5', '9:16', '16:9'],
  defaultDurationMs: 10_000,
  minDurationMs: 4_000,
  maxDurationMs: 30_000,
  photoSlots: { min: 1, max: 3, default: 2 },
  textSlots: [SLOTS.headline, SLOTS.alt, SLOTS.support],
  supportsLogo: true,
  look: FULL_LOOK,
  build,
};

export default template;
