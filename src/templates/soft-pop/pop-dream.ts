import { colorFill, type Keyframe, type Layer } from '@/core/types';
import type { SceneInputs } from '@/document/types';
import type { BuildContext } from '../buildContext';
import type { SceneTemplate } from '../schema';
import { FULL_BLEED_LOOK } from '../_shared/look';
import { fillSlots, photoProps } from '../_shared/photo';

import { POP_SLOTS, kf, popType } from '../_shared/pop';

const SLOTS = {
  headline: { ...POP_SLOTS.headline, placeholder: 'Breathe it in' },
  caption: { ...POP_SLOTS.caption, placeholder: 'A slow week away' },
};

/**
 * Dream Fade.
 *
 * Full frame, one photo after another. Each eases slowly back from close up for
 * the whole of its turn, and hands over to the next by *focus* rather than by
 * cut: the next photo arrives blurred and sharpens as it fades up, while the
 * one beneath it softens out of focus. The family's reel template — the one for
 * a story, a trip, a week, set to music.
 *
 * The incoming photo fades in *over* the outgoing one, and the outgoing one
 * stays fully opaque until it is completely covered. A conventional crossfade
 * fades both at once, and half-way through each is half transparent — the frame
 * dims and the background shows through, a small dip in the middle of every
 * transition that the eye reads as a stumble. Over-the-top is the dissolve
 * without the dip.
 *
 * The zoom never stops: every photo is on screen for its whole turn and is
 * easing back for all of it, through both of its transitions. That constant,
 * slow motion is most of what makes this feel like breathing rather than like a
 * slideshow.
 *
 * Blur is only ever on during a hand-over, so most frames cost nothing extra
 * (§14) — the renderer skips a blur pass entirely at zero.
 */
function build(inputs: SceneInputs, ctx: BuildContext): Layer[] {
  const { design, durationMs } = ctx;
  const unit = Math.min(design.w, design.h);
  const layers: Layer[] = [];

  const type = popType(ctx, inputs, { ...SLOTS, onPhoto: true });
  const count = Math.max(2, Math.min(inputs.photos.length || 4, 8));
  const photos = fillSlots(inputs.photos, count);
  const turnMs = durationMs / count;
  const fade = Math.min(1_600, turnMs * 0.45);
  const soft = unit * 0.022;
  // Oversized so the slow zoom never shows an edge.
  const size = Math.max(design.w, design.h) * 1.04;

  photos.forEach((photo, index) => {
    const startMs = index === 0 ? 0 : index * turnMs - fade;
    const endMs = (index + 1) * turnMs;
    const span = endMs - startMs;
    const last = index === count - 1;

    // In: sharpening as it fades up. The first photo fades up from the
    // background in the same way, so the loop opens the way every turn does.
    const opacity: Keyframe[] = [kf(0, 0, 'linear'), kf(fade, 1, 'inOutSine')];
    const blur: Keyframe[] = [kf(0, soft, 'linear'), kf(fade, 0, 'inOutSine')];

    // Out: softening beneath the next photo — or, for the last one, fading
    // back to the background so the loop can begin again from nothing.
    blur.push(kf(span - fade, 0, 'linear'), kf(span, soft, 'inOutSine'));
    if (last) opacity.push(kf(span - fade, 1, 'linear'), kf(span, 0, 'inOutSine'));

    layers.push({
      id: ctx.id('dream'),
      type: 'image',
      startMs,
      endMs,
      tracks: {
        x: [kf(0, design.w / 2)],
        y: [kf(0, design.h / 2)],
        scaleX: [kf(0, 1.14, 'linear'), kf(span, 1, 'linear')],
        scaleY: [kf(0, 1.14, 'linear'), kf(span, 1, 'linear')],
        opacity,
        blur,
      },
      props: photoProps(photo, size),
    });
  });

  // Type over a photograph needs ground of its own: a soft ramp at the top
  // and the bottom, deep enough for the words and gone well before the middle.
  const scrim = (atY: number, height: number, angle: number): Layer => ({
    id: ctx.id('dream-scrim'),
    type: 'gradient',
    startMs: 0,
    endMs: durationMs,
    tracks: { x: [kf(0, design.w / 2)], y: [kf(0, atY)] },
    props: {
      w: design.w,
      h: height,
      gradient: 'linear',
      angle,
      stops: [
        { at: 0, paint: colorFill('rgba(0,0,0,0.62)') },
        { at: 1, paint: colorFill('rgba(0,0,0,0)') },
      ],
    },
  });
  const band = design.h * 0.26;
  layers.push(scrim(band / 2, band, 90), scrim(design.h - band / 2, band, 270));

  layers.push(...type.layers);
  return layers;
}

const template: SceneTemplate = {
  kind: 'scene',
  id: 'pop-dream',
  name: 'Dream Fade',
  category: 'Soft Pop',
  mode: 'both',
  tier: 'free',
  isNew: true,
  designSize: { w: 1080, h: 1080 },
  supportedAspects: ['16:9', '4:3', '1:1', '4:5', '9:16'],
  defaultDurationMs: 14_000,
  minDurationMs: 4_000,
  maxDurationMs: 40_000,
  photoSlots: { min: 2, max: 8, default: 4 },
  textSlots: [SLOTS.headline, SLOTS.caption],
  supportsLogo: true,
  look: FULL_BLEED_LOOK,
  build,
};

export default template;
