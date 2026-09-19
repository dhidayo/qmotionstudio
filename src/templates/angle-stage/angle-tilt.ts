import { colorFill, roleFill, type Keyframe, type Layer } from '@/core/types';
import { fontString } from '@/fonts/registry';
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
    placeholder: 'One after another',
    maxChars: 40,
    defaultStyle: { ...HEADLINE_STYLE, align: 'left' as const },
  },
  kicker: {
    id: 'kicker',
    label: 'Kicker',
    placeholder: 'New this season',
    maxChars: 28,
    defaultStyle: { ...BODY_STYLE, align: 'left' as const, letterSpacingPct: 12, weight: 600 as const },
  },
};

/**
 * Tilt Sweep.
 *
 * A tilted row travelling sideways, each photo scaling up as it passes the
 * centre so the row reads as though it is curving towards the viewer. There is
 * no 3D here — canvas has no perspective transform — the depth cue is entirely
 * scale, rotation and a touch of blur at the edges.
 *
 * The row wraps: it travels exactly one photo-pitch per turn and the photos
 * repeat, so the loop has no seam.
 */
function build(inputs: SceneInputs, ctx: BuildContext): Layer[] {
  const { design, safe, durationMs } = ctx;
  const unit = Math.min(design.w, design.h);
  const layers: Layer[] = [];

  const count = Math.max(2, Math.min(inputs.photos.length || 4, 6));
  const photos = fillSlots(inputs.photos, count);

  const kicker = textFor(SLOTS.kicker, inputs, {
    baseSizePx: unit * 0.024,
    maxWidthPx: safe.w * 0.8,
    reveal: { kind: 'fade', startMs: 180, durationMs: 420 },
    fallbackFill: roleFill('accent'),
  });
  const headline = textFor(SLOTS.headline, inputs, {
    baseSizePx: unit * 0.074,
    maxWidthPx: safe.w * 0.8,
    reveal: { kind: 'maskWipe', dir: 'right', startMs: 360, durationMs: 760 },
    lineHeight: 1.06,
  });

  const kickerRun = ctx.measure(specFor(kicker, fontString(kicker.fontId, kicker.fontSizePx, kicker.weight)));
  const headRun = ctx.measure(specFor(headline, fontString(headline.fontId, headline.fontSizePx, headline.weight)));

  const typeTop = safe.y;
  const typeH = kickerRun.height + headRun.height + unit * 0.022;
  const stageTop = typeTop + typeH + unit * 0.055;
  const stageH = Math.max(unit * 0.26, safe.y + safe.h - stageTop);
  const stageCentreY = stageTop + stageH / 2;

  const cardSize = Math.min(stageH * 0.82, unit * 0.44);
  // Pitch is the distance between neighbours. Wider than the card so the row
  // reads as separate photos rather than a filmstrip.
  const pitch = cardSize * 0.98;
  const rowSpan = pitch * count;

  layers.push(backgroundLayer(inputs, ctx));

  const centreX = design.w / 2;

  for (let i = 0; i < count; i++) {
    const photo = photos[i];
    if (!photo) continue;

    const props = photoProps(photo, cardSize, {
      cornerRadius: inputs.look.cornerRadius,
      shadow: { blur: unit * 0.055, offsetX: 0, offsetY: unit * 0.018, paint: colorFill('rgba(0,0,0,0.6)') },
    });

    // Sample the traverse rather than keyframing only the endpoints: scale and
    // rotation depend on *position*, and a straight interpolation between two
    // endpoints would miss the swell through the centre entirely.
    const STEPS = 24;
    const xTrack: Keyframe[] = [];
    const scaleTrack: Keyframe[] = [];
    const rotTrack: Keyframe[] = [];
    const blurTrack: Keyframe[] = [];
    const opacityTrack: Keyframe[] = [];

    for (let step = 0; step <= STEPS; step++) {
      const t = step / STEPS;
      const at = t * durationMs;

      // Start each photo at its own offset and travel exactly one full span,
      // so the arrangement at t=1 is identical to t=0.
      const raw = i * pitch - t * rowSpan;
      // Wrap into a window centred on the frame.
      const half = rowSpan / 2;
      const wrapped = ((((raw + half) % rowSpan) + rowSpan) % rowSpan) - half;

      const distance = Math.abs(wrapped) / half;
      const nearness = 1 - Math.min(1, distance);

      xTrack.push(kf(at, centreX + wrapped, 'linear'));
      scaleTrack.push(kf(at, 0.68 + nearness * 0.32, 'linear'));
      rotTrack.push(kf(at, -wrapped / half * 9, 'linear'));
      blurTrack.push(kf(at, (1 - nearness) * unit * 0.008, 'linear'));
      // Fade at the very edges so photos do not pop in and out at the wrap.
      opacityTrack.push(kf(at, distance > 0.88 ? 0 : Math.min(1, (1 - distance) * 4), 'linear'));
    }

    layers.push({
      id: ctx.id('card'),
      type: 'image',
      startMs: 0,
      endMs: durationMs,
      tracks: {
        x: xTrack,
        y: [kf(0, stageCentreY)],
        scaleX: scaleTrack,
        scaleY: scaleTrack,
        rotation: rotTrack,
        blur: blurTrack,
        opacity: opacityTrack,
      },
      props,
    });
  }

  layers.push({
    id: ctx.id('kicker'),
    type: 'text',
    startMs: 0,
    endMs: durationMs,
    anchorX: 0,
    anchorY: 0,
    tracks: { x: [kf(0, safe.x)], y: [kf(0, typeTop)] },
    props: kicker,
  });

  layers.push({
    id: ctx.id('headline'),
    type: 'text',
    startMs: 0,
    endMs: durationMs,
    anchorX: 0,
    anchorY: 0,
    tracks: { x: [kf(0, safe.x)], y: [kf(0, typeTop + kickerRun.height + unit * 0.022)] },
    props: headline,
  });

  layers.push(...logoLayers(inputs, ctx));

  return layers;
}

const template: SceneTemplate = {
  kind: 'scene',
  id: 'angle-tilt',
  name: 'Tilt Sweep',
  category: 'Angle Stage',
  mode: 'both',
  tier: 'pro',
  designSize: { w: 1080, h: 1080 },
  supportedAspects: ['16:9', '4:3', '1:1', '4:5', '9:16'],
  defaultDurationMs: 12_000,
  minDurationMs: 5_000,
  maxDurationMs: 30_000,
  photoSlots: { min: 2, max: 6, default: 4 },
  textSlots: [SLOTS.kicker, SLOTS.headline],
  supportsLogo: true,
  look: FULL_LOOK,
  build,
};

export default template;
