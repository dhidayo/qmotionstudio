import type { Layer, Tracks } from '@/core/types';
import type { SceneInputs } from '@/document/types';
import type { BuildContext } from '../buildContext';
import type { SceneTemplate } from '../schema';
import { FULL_LOOK } from '../_shared/look';
import { fillSlots } from '../_shared/photo';
import { backgroundLayer } from '../_shared/chrome';
import { POP_SLOTS, SOFT_POP, cardLayers, kf, popCard, popGroup, popTurns, popType, type PopTurn } from '../_shared/pop';

const SLOTS = {
  headline: { ...POP_SLOTS.headline, placeholder: 'Let it all go' },
  caption: { ...POP_SLOTS.caption, placeholder: 'Light as anything' },
};

/**
 * Float Away.
 *
 * Each photo lifts off and drifts slowly upward — swaying a little, growing
 * smaller and softer as it goes, like a lantern released at dusk — while the
 * next rises gently into its place from below.
 *
 * The calmest of the family, because it has exactly one direction. Everything
 * travels upward: the arrival rises into place, the departure rises out of it,
 * and the two pass in the same direction rather than crossing.
 *
 * The departing photo shrinks and softens as it climbs, which is what reads as
 * *distance* rather than as sliding off the top of the frame. It is drawn
 * beneath the arriving one for the same reason: something receding is further
 * away than something approaching, and should be behind it.
 */
function build(inputs: SceneInputs, ctx: BuildContext): Layer[] {
  const { design, durationMs } = ctx;
  const unit = Math.min(design.w, design.h);
  const layers: Layer[] = [backgroundLayer(inputs, ctx)];

  const type = popType(ctx, inputs, SLOTS);
  const count = Math.max(2, Math.min(inputs.photos.length || 4, 8));
  const photos = fillSlots(inputs.photos, count);
  const turns = popTurns(count, durationMs, { enterMs: 1_150, exitMs: 1_900, overlapMs: 950 });
  const centre = { x: type.stage.cx, y: type.stage.cy };

  // Earliest first: what is leaving is further away than what is arriving.
  for (const turn of turns) {
    const photo = photos[turn.index];
    if (!photo) continue;

    const card = popCard(photo, type.stage, inputs);
    const softFrom = turn.exitAtMs + turn.exitMs * 0.4;

    layers.push(popGroup(ctx, card, turn, floatTracks(centre, turn, unit), cardLayers(ctx, card, {
      untilMs: turn.spanMs,
      settleMs: turn.exitAtMs,
      windowTracks: {
        blur: [kf(softFrom, 0, 'linear'), kf(turn.spanMs, unit * 0.008, 'inOutSine')],
      },
      haloTracks: {
        opacity: [kf(turn.exitAtMs, 1, 'linear'), kf(turn.exitAtMs + turn.exitMs * 0.55, 0, 'inOutSine')],
      },
    })));
  }

  layers.push(...type.layers);
  return layers;
}

/**
 * Up into place, a long still moment, then up and away.
 *
 * On the group, so a user's drag moves the whole flight with the photo.
 */
function floatTracks(at: { x: number; y: number }, turn: PopTurn, unit: number): Tracks {
  const { enterMs, exitAtMs, spanMs, exitMs } = turn;
  const rise = unit * 0.09;
  const climb = unit * 0.42;
  const sway = exitAtMs + exitMs * 0.45;

  return {
    x: [kf(0, at.x)],
    y: [
      kf(0, at.y + rise, 'linear'),
      kf(enterMs, at.y, 'outCubic'),
      kf(exitAtMs, at.y, 'linear'),
      kf(spanMs, at.y - climb, 'inOutSine'),
    ],
    scaleX: [kf(0, 0.95, 'linear'), kf(enterMs, 1, SOFT_POP), kf(exitAtMs, 1, 'linear'), kf(spanMs, 0.84, 'inOutSine')],
    scaleY: [kf(0, 0.95, 'linear'), kf(enterMs, 1, SOFT_POP), kf(exitAtMs, 1, 'linear'), kf(spanMs, 0.84, 'inOutSine')],
    rotation: [kf(exitAtMs, 0, 'linear'), kf(sway, 3.5, 'inOutSine'), kf(spanMs, -2, 'inOutSine')],
    opacity: [
      kf(0, 0, 'linear'),
      kf(enterMs * 0.7, 1, 'outQuad'),
      kf(exitAtMs + exitMs * 0.3, 1, 'linear'),
      kf(spanMs, 0, 'inOutSine'),
    ],
  };
}

const template: SceneTemplate = {
  kind: 'scene',
  id: 'pop-float',
  name: 'Float Away',
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
  look: FULL_LOOK,
  build,
};

export default template;
