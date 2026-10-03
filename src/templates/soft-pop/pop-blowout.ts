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
  headline: { ...POP_SLOTS.headline, placeholder: 'Carried on the breeze' },
  caption: { ...POP_SLOTS.caption, placeholder: 'Summer, in passing' },
};

/**
 * Blowout.
 *
 * Each photo is lifted away in fine pieces by a breeze that crosses it from
 * left to right, the pieces rising, turning and thinning out as they go —
 * sand off a dune, seeds off a dandelion.
 *
 * What keeps it gentle is the *sweep*. The breeze takes the left edge first
 * and reaches the right edge most of a second later, so the photo is never
 * gone all at once; at any moment part of it is still whole, and the eye
 * follows the edge of the wind across the frame rather than being asked to
 * watch thirty-five things at once.
 *
 * Every piece flies for the same length of time, however late it sets off.
 * Letting the late ones hurry to finish with the early ones would put the
 * fastest motion in the whole family at the very end of the exit — the moment
 * it should be quietest.
 *
 * Thirty-five pieces is the ceiling, and it is a cost decision: each piece
 * draws the whole photo through its own window, so the count is paid in full
 * for every frame of the exit (§14).
 */
function build(inputs: SceneInputs, ctx: BuildContext): Layer[] {
  const { design, durationMs } = ctx;
  const unit = Math.min(design.w, design.h);
  const layers: Layer[] = [backgroundLayer(inputs, ctx)];

  const type = popType(ctx, inputs, SLOTS);
  const count = Math.max(2, Math.min(inputs.photos.length || 4, 8));
  const photos = fillSlots(inputs.photos, count);
  const turns = popTurns(count, durationMs, { enterMs: 950, exitMs: 1_700, overlapMs: 700 });
  const centre = { x: type.stage.cx, y: type.stage.cy };

  for (const turn of [...turns].reverse()) {
    const photo = photos[turn.index];
    if (!photo) continue;

    const card = popCard(photo, type.stage, inputs);
    const wide = card.w >= card.h;
    const tiles = popTiles(card, wide ? 7 : 5, wide ? 5 : 7);

    const flight = turn.exitMs * 0.62;
    const sweep = turn.exitMs - flight;
    const salt = turn.index * 11;

    const pieces = tiles.map((tile) => {
      const across = (tile.u + 1) / 2;
      const delay = (across * 0.85 + jitter(tile.index, salt + 1) * 0.15) * sweep;
      const end = delay + flight;

      const drift = unit * (0.18 + 0.14 * jitter(tile.index, salt + 2));
      // Up as much as across, so a lifted piece clears the part of the photo
      // still waiting for the wind instead of sliding over it.
      const rise = unit * (0.12 + 0.14 * jitter(tile.index, salt + 3)) - tile.v * unit * 0.02;
      // A dip half-way, different for every piece, so they ride the air in
      // waves rather than in straight lines.
      const wave = unit * 0.018 * (jitter(tile.index, salt + 4) - 0.5);
      // Tumbling mostly with the wind, a few against it.
      const spin = (jitter(tile.index, salt + 5) - 0.3) * 50;

      return tileLayer(ctx, card, tile, { startMs: turn.exitAtMs, endMs: turn.spanMs }, {
        x: [kf(delay, tile.x, 'linear'), kf(end, tile.x + drift, 'inOutSine')],
        y: [
          kf(delay, tile.y, 'linear'),
          kf(delay + flight * 0.5, tile.y - rise * 0.35 + wave, 'inOutSine'),
          kf(end, tile.y - rise, 'inOutSine'),
        ],
        rotation: [kf(delay, 0, 'linear'), kf(end, spin, 'inOutSine')],
        scaleX: [kf(delay, 1, 'linear'), kf(end, 0.45, 'inOutSine')],
        scaleY: [kf(delay, 1, 'linear'), kf(end, 0.45, 'inOutSine')],
        // Thinning out early: half gone by mid-flight, so the pieces read as
        // carried off rather than as a second photo laid over the first.
        opacity: [
          kf(delay, 1, 'linear'),
          kf(delay + flight * 0.45, 0.5, 'inOutSine'),
          kf(end, 0, 'inOutSine'),
        ],
      });
    });

    layers.push(popGroup(ctx, card, turn, popIn(centre, turn.enterMs, unit), [
      ...cardLayers(ctx, card, {
        untilMs: turn.exitAtMs,
        settleMs: turn.exitAtMs,
        haloUntilMs: turn.spanMs,
        haloTracks: {
          opacity: [kf(turn.exitAtMs, 1, 'linear'), kf(turn.exitAtMs + turn.exitMs * 0.55, 0, 'inOutSine')],
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
  id: 'pop-blowout',
  name: 'Blowout',
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
