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
    placeholder: 'All of it',
    maxChars: 22,
    defaultStyle: { ...HEADLINE_STYLE, align: 'center' as const },
  },
  caption: {
    id: 'caption',
    label: 'Caption',
    placeholder: 'the full set',
    maxChars: 28,
    defaultStyle: { ...BODY_STYLE, align: 'center' as const, letterSpacingPct: 14, weight: 600 as const },
  },
};

/**
 * Pinwheel.
 *
 * Photographs set around a ring, each facing outward, the whole ring turning
 * slowly. Fan Out is an arc that springs open and sways in place; this is a
 * closed figure that never stops, and the closed figure is what leaves a hole in
 * the middle to put the message in. A composition that reads at any aspect ratio,
 * because a circle sized off the short edge is the same circle in all of them.
 *
 * Deliberately not built as a rotating group, even though a group is exactly
 * what a turning ring is. A group is a coordinate space, so a photograph inside
 * one has its user nudge applied along the *group's* axes — dragging a
 * photograph right on a ring turned 30° would send it off at 30°, which is
 * indefensible in a feature whose whole promise is that things go where you put
 * them. So the ring is sampled into each photograph's own tracks instead.
 *
 * Twenty samples, and they can be linear because the turn is: a pinwheel that
 * eases looks like one winding down. Rotation needs no sampling at all — a
 * linear turn is two keyframes — and the entrance is a spring on scale rather
 * than a flight out from the centre, which is what keeps the position tracks
 * pure orbit and cheap.
 *
 * The turn is exactly one photograph's worth of the ring, so the last frame
 * shows the same arrangement as the first and the scene loops without a jump.
 */
function build(inputs: SceneInputs, ctx: BuildContext): Layer[] {
  const { design, safe, durationMs } = ctx;
  const unit = Math.min(design.w, design.h);
  const layers: Layer[] = [backgroundLayer(inputs, ctx)];

  const count = Math.max(3, Math.min(inputs.photos.length || 6, 8));
  const photos = fillSlots(inputs.photos, count);

  const shortSafe = Math.min(safe.w, safe.h);
  const cx = safe.x + safe.w / 2;
  const cy = safe.y + safe.h / 2;

  const radius = shortSafe * 0.37;
  const photoBase = Math.min(shortSafe * 0.27, ((2 * Math.PI * radius) / count) * 0.95);

  const pitchDeg = 360 / count;
  const SAMPLES = 20;

  photos.forEach((photo, index) => {
    const baseDeg = -90 + index * pitchDeg;

    const xTrack: Keyframe[] = [];
    const yTrack: Keyframe[] = [];
    for (let s = 0; s <= SAMPLES; s++) {
      const at = (durationMs * s) / SAMPLES;
      const radians = ((baseDeg + pitchDeg * (s / SAMPLES)) * Math.PI) / 180;
      xTrack.push(kf(at, cx + Math.cos(radians) * radius, 'linear'));
      yTrack.push(kf(at, cy + Math.sin(radians) * radius, 'linear'));
    }

    const delay = 200 + ctx.stagger(index, count, 90, 'start');
    const props = photoProps(photo, photoBase, {
      cornerRadius: inputs.look.cornerRadius,
      shadow: { blur: unit * 0.04, offsetX: 0, offsetY: unit * 0.01, paint: colorFill('rgba(0,0,0,0.5)') },
    });

    layers.push({
      id: ctx.id('spoke'),
      type: 'image',
      startMs: 0,
      endMs: durationMs,
      tracks: {
        x: xTrack,
        y: yTrack,
        // +90 is what "facing outward" means: the photograph's own up points
        // away from the hub.
        rotation: [kf(0, baseDeg + 90), kf(durationMs, baseDeg + 90 + pitchDeg, 'linear')],
        scaleX: [kf(0, 0), kf(delay, 0), kf(delay + 720, 1, { kind: 'spring', stiffness: 180, damping: 16, mass: 1 })],
        scaleY: [kf(0, 0), kf(delay, 0), kf(delay + 720, 1, { kind: 'spring', stiffness: 180, damping: 16, mass: 1 })],
        opacity: [kf(0, 0), kf(delay, 0), kf(delay + 200, 1)],
      },
      props,
    });
  });

  const headline = textFor(SLOTS.headline, inputs, {
    baseSizePx: unit * 0.052,
    maxWidthPx: shortSafe * 0.28,
    reveal: { kind: 'perWord', startMs: 700, durationMs: 460, staggerMs: 90 },
    lineHeight: 1.04,
  });
  const caption = textFor(SLOTS.caption, inputs, {
    baseSizePx: unit * 0.019,
    maxWidthPx: shortSafe * 0.28,
    reveal: { kind: 'fade', startMs: 1_200, durationMs: 560 },
    fallbackFill: roleFill('accent'),
  });

  const headRun = ctx.measure(specFor(headline, fontString(headline.fontId, headline.fontSizePx, headline.weight)));
  const capRun = ctx.measure(specFor(caption, fontString(caption.fontId, caption.fontSizePx, caption.weight)));

  const hubH = headRun.height + capRun.height + unit * 0.018;
  const hubTop = cy - hubH / 2;

  // A disc under the hub, so the message reads whatever the ring is doing behind
  // it. Sized from the clearance the photographs leave rather than from the type,
  // because it is the hole in the ring that it is filling.
  const hubRadius = radius - photoBase * 0.6;
  layers.push({
    id: ctx.id('hub'),
    type: 'gradient',
    startMs: 0,
    endMs: durationMs,
    tracks: {
      x: [kf(0, cx)],
      y: [kf(0, cy)],
      opacity: [kf(0, 0), kf(600, 1)],
    },
    props: {
      w: hubRadius * 2.5,
      h: hubRadius * 2.5,
      gradient: 'radial',
      stops: [
        { at: 0, paint: roleFill('bg', 0.92) },
        { at: 0.6, paint: roleFill('bg', 0.75) },
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
    tracks: { x: [kf(0, cx)], y: [kf(0, hubTop)] },
    props: headline,
  });

  layers.push({
    id: ctx.id('caption'),
    type: 'text',
    startMs: 0,
    endMs: durationMs,
    anchorX: 0.5,
    anchorY: 0,
    tracks: { x: [kf(0, cx)], y: [kf(0, hubTop + headRun.height + unit * 0.018)] },
    props: caption,
  });

  layers.push(...logoLayers(inputs, ctx));

  return layers;
}

const template: SceneTemplate = {
  kind: 'scene',
  id: 'angle-pinwheel',
  name: 'Pinwheel',
  category: 'Angle Stage',
  mode: 'both',
  tier: 'pro',
  isNew: true,
  designSize: { w: 1080, h: 1080 },
  supportedAspects: ['16:9', '4:3', '1:1', '4:5', '9:16'],
  defaultDurationMs: 8_000,
  minDurationMs: 4_000,
  maxDurationMs: 30_000,
  photoSlots: { min: 3, max: 8, default: 6 },
  textSlots: [SLOTS.headline, SLOTS.caption],
  supportsLogo: true,
  look: FULL_LOOK,
  build,
};

export default template;
