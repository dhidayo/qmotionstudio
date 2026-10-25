import { colorFill, roleFill, type Keyframe, type Layer } from '@/core/types';
import { fontString } from '@/fonts/registry';
import type { SceneInputs } from '@/document/types';
import type { BuildContext } from '../buildContext';
import type { SceneTemplate } from '../schema';
import { FULL_LOOK, BODY_STYLE, HEADLINE_STYLE } from '../_shared/look';
import { fillSlots, photoProps } from '../_shared/photo';
import { specFor, textFor } from '../_shared/text';
import { backgroundLayer, contentFloor } from '../_shared/chrome';
import { depthGroup, emphasise, focusCurve, linger, roomFor, sampled, wrapSteps, type Pose } from '../_families/kit';

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
 *
 * The photo at the centre is the one in focus (D-157): the row slows as each
 * photo reaches the middle, and there it grows, stands upright, sharpens and
 * comes in front of its neighbours, which settle back and darken.
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
  // Down to the content floor, so the photo in focus grows clear of the caption band.
  const stageH = Math.max(unit * 0.26, contentFloor(design, safe) - stageTop);
  const stageCentreY = stageTop + stageH / 2;

  const cardSize = Math.min(stageH * 0.82, unit * 0.44);
  // Pitch is the distance between neighbours. Wider than the card so the row
  // reads as separate photos rather than a filmstrip.
  const pitch = cardSize * 0.98;
  const rowSpan = pitch * count;

  layers.push(backgroundLayer(inputs, ctx));

  const centreX = design.w / 2;

  const stage = { cx: centreX, cy: stageCentreY, w: safe.w, h: stageH };
  const half = rowSpan / 2;
  const cards: Layer[] = [];

  for (let i = 0; i < count; i++) {
    const photo = photos[i];
    if (!photo) continue;

    const props = photoProps(photo, cardSize, {
      cornerRadius: inputs.look.cornerRadius,
      shadow: { blur: unit * 0.055, offsetX: 0, offsetY: unit * 0.018, paint: colorFill('rgba(0,0,0,0.6)') },
    });
    const peak = roomFor(stage, { x: stage.cx, y: stage.cy }, { w: props.w, h: props.h }, 1.3);

    // Sampled finely rather than keyframed at the ends: scale and rotation
    // depend on *position*, and the swell through the centre is the point.
    const tracks = sampled(0, durationMs, 70, (ms) => {
      // Each photo starts at its own offset and travels exactly one full span,
      // lingering as it reaches the middle, so the arrangement at the end is
      // identical to the start. The offset is in pitches, wrapped round the frame.
      const steps = wrapSteps(i - linger((ms / durationMs) * count), count);
      const wrapped = steps * pitch;
      const distance = Math.abs(wrapped) / half;
      const nearness = 1 - Math.min(1, distance);
      const base: Pose = {
        x: centreX + wrapped,
        y: stageCentreY,
        scale: 0.68 + nearness * 0.32,
        rotation: (-wrapped / half) * 9,
        blur: (1 - nearness) * unit * 0.008,
        // Fade at the very edges so photos do not pop in and out at the wrap.
        opacity: distance > 0.88 ? 0 : Math.min(1, (1 - distance) * 4),
        z: -Math.abs(steps),
      };
      return emphasise(base, focusCurve(steps), peak, { straighten: 1 });
    }, half);

    cards.push({ id: ctx.id('card'), type: 'image', startMs: 0, endMs: durationMs, tracks, props });
  }
  layers.push(depthGroup(ctx, 'row', cards));

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
