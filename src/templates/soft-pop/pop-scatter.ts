import type { Layer } from '@/core/types';
import type { SceneInputs } from '@/document/types';
import type { BuildContext } from '../buildContext';
import type { SceneTemplate } from '../schema';
import { FULL_LOOK } from '../_shared/look';
import { fillSlots } from '../_shared/photo';
import { backgroundLayer } from '../_shared/chrome';
import {
  POP_SLOTS, cardLayers, jitter, kf, popCard, popGroup, popIn, popTiles, popTurns, popType, tileLayer,
} from '../_shared/pop';

const SLOTS = {
  headline: { ...POP_SLOTS.headline, placeholder: 'Little things, gently' },
  caption: { ...POP_SLOTS.caption, placeholder: 'Our week in pictures' },
};

/**
 * Scatter.
 *
 * Each photo comes apart into a dozen pieces that drift outward and away, as
 * if set down on water — and the next photo has already settled underneath
 * them by the time they have gone.
 *
 * Elegant rather than explosive, and the difference is all in the numbers.
 * The pieces leave from the *edges inward*, so the photo unravels instead of
 * bursting, and no piece ever crosses another on its way out. Each travels a
 * short way — a fifth of the frame at most — on a sine curve that starts and
 * ends at rest, turning a few degrees, shrinking a little, and fading only once
 * it is clearly moving. Everything drifts slightly upward as well, which is
 * what makes it read as weightless rather than as debris.
 *
 * The departing pieces are drawn *over* the arriving photo, so the scatter
 * happens in front of what replaces it — the arrival is the reveal.
 */
function build(inputs: SceneInputs, ctx: BuildContext): Layer[] {
  const { design, durationMs } = ctx;
  const unit = Math.min(design.w, design.h);
  const layers: Layer[] = [backgroundLayer(inputs, ctx)];

  const type = popType(ctx, inputs, SLOTS);
  const count = Math.max(2, Math.min(inputs.photos.length || 4, 8));
  const photos = fillSlots(inputs.photos, count);
  const turns = popTurns(count, durationMs, { enterMs: 950, exitMs: 1_500, overlapMs: 650 });
  const centre = { x: type.stage.cx, y: type.stage.cy };

  // Latest first, so whatever is leaving is drawn over whatever is arriving.
  for (const turn of [...turns].reverse()) {
    const photo = photos[turn.index];
    if (!photo) continue;

    const card = popCard(photo, type.stage, inputs);
    const wide = card.w >= card.h;
    const tiles = popTiles(card, wide ? 4 : 3, wide ? 3 : 4);

    const flight = turn.exitMs * 0.72;
    const spread = turn.exitMs - flight;
    const reach = Math.hypot(card.w / 2, card.h / 2);
    const salt = turn.index * 7;

    const pieces = tiles.map((tile) => {
      /*
       * Edges first, so the photo unravels rather than bursts — but only
       * mostly. A strictly radial order keeps the grid's rows intact all the
       * way out, which reads as a grid sliding apart; a share of each delay
       * left to chance is what breaks the rows up into pieces.
       */
      const fromCentre = Math.min(1, Math.hypot(tile.x, tile.y) / reach);
      const delay = ((1 - fromCentre) * 0.6 + jitter(tile.index, salt + 4) * 0.4) * spread;
      const end = delay + flight;

      // Outward along the line from the centre, bent a little so the pieces
      // do not leave in a perfect starburst — which reads as mechanical.
      const angle = Math.atan2(tile.y, tile.x) + (jitter(tile.index, salt + 1) - 0.5) * 0.9;
      const distance = unit * (0.1 + 0.14 * jitter(tile.index, salt + 2));
      const lean = jitter(tile.index, salt + 3);
      const spin = (lean < 0.5 ? -1 : 1) * (12 + 18 * Math.abs(lean - 0.5) * 2);
      const lift = unit * 0.035;

      return tileLayer(ctx, card, tile, { startMs: turn.exitAtMs, endMs: turn.spanMs }, {
        x: [kf(delay, tile.x, 'linear'), kf(end, tile.x + Math.cos(angle) * distance, 'inOutSine')],
        y: [kf(delay, tile.y, 'linear'), kf(end, tile.y + Math.sin(angle) * distance - lift, 'inOutSine')],
        rotation: [kf(delay, 0, 'linear'), kf(end, spin, 'inOutSine')],
        scaleX: [kf(delay, 1, 'linear'), kf(end, 0.8, 'inOutSine')],
        scaleY: [kf(delay, 1, 'linear'), kf(end, 0.8, 'inOutSine')],
        opacity: [kf(delay + flight * 0.25, 1, 'linear'), kf(end, 0, 'inOutSine')],
      });
    });

    layers.push(popGroup(ctx, card, turn, popIn(centre, turn.enterMs, unit), [
      ...cardLayers(ctx, card, {
        untilMs: turn.exitAtMs,
        settleMs: turn.exitAtMs,
        haloUntilMs: turn.spanMs,
        haloTracks: {
          opacity: [kf(turn.exitAtMs, 1, 'linear'), kf(turn.exitAtMs + turn.exitMs * 0.6, 0, 'inOutSine')],
        },
      }),
      ...pieces,
    ]));
  }

  layers.push(...type.layers);
  return layers;
}

const template: SceneTemplate = {
  kind: 'scene',
  id: 'pop-scatter',
  name: 'Scatter',
  category: 'Soft Pop',
  mode: 'both',
  tier: 'free',
  isNew: true,
  designSize: { w: 1080, h: 1080 },
  supportedAspects: ['16:9', '4:3', '1:1', '4:5', '9:16'],
  defaultDurationMs: 13_000,
  minDurationMs: 4_000,
  maxDurationMs: 40_000,
  photoSlots: { min: 2, max: 8, default: 4 },
  textSlots: [SLOTS.headline, SLOTS.caption],
  supportsLogo: true,
  look: FULL_LOOK,
  build,
};

export default template;
