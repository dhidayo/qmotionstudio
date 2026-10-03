import { roleFill, type Layer } from '@/core/types';
import type { SceneInputs } from '@/document/types';
import type { BuildContext } from '../buildContext';
import type { SceneTemplate } from '../schema';
import { FULL_LOOK } from '../_shared/look';
import { fillSlots } from '../_shared/photo';
import { backgroundLayer } from '../_shared/chrome';
import {
  POP_SLOTS, cardLayers, jitter, kf, popCard, popGroup, popIn, popTurns, popType, type PopCard, type PopTurn,
} from '../_shared/pop';

const SLOTS = {
  headline: { ...POP_SLOTS.headline, placeholder: 'Moments that glow' },
  caption: { ...POP_SLOTS.caption, placeholder: 'Evenings worth keeping' },
};

/** How many motes each photo gives off. Shapes are cheap; this is about calm. */
const MOTES = 26;

/**
 * Fizzle.
 *
 * Each photo softens out of focus and fades, and as it goes, small points of
 * light rise from it and drift up, the way embers lift off a fire or bubbles
 * leave a glass. The next photo has settled underneath by the time the last
 * of them has gone.
 *
 * The photo and its light leave at different speeds on purpose. The photo is
 * gone within most of the exit; the motes are born across its first half and
 * each lives for over half a second more, so the last thing on screen is a few
 * points of light still rising after the picture has dissolved. That tail is
 * the whole effect — without it this is just a fade.
 *
 * The motes take the palette's accent and ink, so they glow warm on Ember,
 * green on Forest, and so on, and never clash with whatever is beneath.
 */
function build(inputs: SceneInputs, ctx: BuildContext): Layer[] {
  const { design, durationMs } = ctx;
  const unit = Math.min(design.w, design.h);
  const layers: Layer[] = [backgroundLayer(inputs, ctx)];

  const type = popType(ctx, inputs, SLOTS);
  const count = Math.max(2, Math.min(inputs.photos.length || 4, 8));
  const photos = fillSlots(inputs.photos, count);
  const turns = popTurns(count, durationMs, { enterMs: 950, exitMs: 1_600, overlapMs: 750 });
  const centre = { x: type.stage.cx, y: type.stage.cy };

  for (const turn of [...turns].reverse()) {
    const photo = photos[turn.index];
    if (!photo) continue;

    const card = popCard(photo, type.stage, inputs);
    const fadeEnd = turn.exitAtMs + turn.exitMs * 0.8;

    layers.push(popGroup(ctx, card, turn, popIn(centre, turn.enterMs, unit), [
      ...cardLayers(ctx, card, {
        untilMs: turn.spanMs,
        settleMs: turn.exitAtMs,
        windowTracks: {
          opacity: [kf(turn.exitAtMs, 1, 'linear'), kf(fadeEnd, 0, 'inOutSine')],
          blur: [kf(turn.exitAtMs, 0, 'linear'), kf(fadeEnd, unit * 0.016, 'inOutSine')],
          scaleX: [kf(turn.exitAtMs, 1, 'linear'), kf(fadeEnd, 1.035, 'inOutSine')],
          scaleY: [kf(turn.exitAtMs, 1, 'linear'), kf(fadeEnd, 1.035, 'inOutSine')],
        },
        // Ahead of the photo: shade under something that is already half gone
        // reads as a stain, not a shadow.
        haloTracks: {
          opacity: [kf(turn.exitAtMs, 1, 'linear'), kf(turn.exitAtMs + turn.exitMs * 0.45, 0, 'inOutSine')],
        },
      }),
      ...motes(ctx, card, turn, unit),
    ]));
  }

  layers.push(...type.layers);
  return layers;
}

/** The points of light, all inside the photo's group so they follow a drag. */
function motes(ctx: BuildContext, card: PopCard, turn: PopTurn, unit: number): Layer[] {
  const salt = turn.index * 13;
  const layers: Layer[] = [];

  for (let i = 0; i < MOTES; i++) {
    const r = (k: number): number => jitter(i, salt + k);

    const born = turn.exitAtMs + r(1) * turn.exitMs * 0.5;
    const life = Math.min(turn.exitMs * (0.55 + 0.3 * r(2)), turn.spanMs - born);
    if (life < 120) continue;

    const x = (r(3) - 0.5) * card.w * 0.9;
    const y = (r(4) - 0.5) * card.h * 0.9;
    const rise = unit * (0.07 + 0.13 * r(5));
    const sway = unit * 0.03 * (r(6) - 0.5);
    const size = unit * (0.008 + 0.011 * r(7));
    const warm = r(8) < 0.6;

    layers.push({
      id: ctx.id('pop-mote'),
      type: 'shape',
      startMs: born,
      endMs: born + life,
      tracks: {
        x: [kf(0, x, 'linear'), kf(life * 0.5, x + sway, 'inOutSine'), kf(life, x + sway * 0.4, 'inOutSine')],
        // Decelerating as it rises, as anything warm drifting up does.
        y: [kf(0, y, 'linear'), kf(life, y - rise, 'outCubic')],
        scaleX: [kf(0, 0.4, 'linear'), kf(life * 0.35, 1, 'outCubic'), kf(life, 0.5, 'inOutSine')],
        scaleY: [kf(0, 0.4, 'linear'), kf(life * 0.35, 1, 'outCubic'), kf(life, 0.5, 'inOutSine')],
        opacity: [kf(0, 0, 'linear'), kf(life * 0.3, 0.9, 'outQuad'), kf(life, 0, 'inOutSine')],
      },
      props: {
        shape: 'ellipse',
        w: size,
        h: size,
        fill: warm ? roleFill('accent') : roleFill('ink', 0.9),
        // The glow is a shadow with no offset: a soft halo of the mote's own
        // colour, which is what makes a dot read as a point of light.
        shadow: { blur: size * 2.4, offsetX: 0, offsetY: 0, paint: warm ? roleFill('accent', 0.9) : roleFill('ink', 0.7) },
      },
    });
  }

  return layers;
}

const template: SceneTemplate = {
  kind: 'scene',
  id: 'pop-fizzle',
  name: 'Fizzle',
  category: 'Soft Pop',
  mode: 'both',
  tier: 'pro',
  isNew: true,
  designSize: { w: 1080, h: 1080 },
  supportedAspects: ['16:9', '4:3', '1:1', '4:5', '9:16'],
  defaultDurationMs: 14_000,
  minDurationMs: 4_000,
  maxDurationMs: 40_000,
  photoSlots: { min: 2, max: 8, default: 4 },
  textSlots: [SLOTS.headline, SLOTS.caption],
  supportsLogo: true,
  look: FULL_LOOK,
  build,
};

export default template;
