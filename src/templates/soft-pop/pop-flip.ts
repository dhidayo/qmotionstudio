import { colorFill, type Layer, type Tracks } from '@/core/types';
import type { SceneInputs } from '@/document/types';
import type { BuildContext } from '../buildContext';
import type { SceneTemplate } from '../schema';
import { FULL_LOOK } from '../_shared/look';
import { fillSlots } from '../_shared/photo';
import { backgroundLayer } from '../_shared/chrome';
import { POP_SLOTS, cardLayers, kf, popCard, popGroup, popIn, popTurns, popType } from '../_shared/pop';

const SLOTS = {
  headline: { ...POP_SLOTS.headline, placeholder: 'Turn the page' },
  caption: { ...POP_SLOTS.caption, placeholder: 'From the family album' },
};

/** How close to edge-on the page gets. Never zero: a sliver reads as a page, nothing reads as a cut. */
const EDGE = 0.02;

/**
 * Flip Out.
 *
 * Each photo turns away like a page in an album, hinged on its left edge, and
 * the next photo is already lying underneath, waiting to be uncovered.
 *
 * Different from Flip Cards in the one way that matters for calm: nothing
 * comes back. Flip Cards turns a card on its centre and a new face swings
 * round to meet you, which is lively. Here the page simply leaves and what was
 * under it is revealed, so the eye is never asked to follow two motions at
 * once.
 *
 * The next photo arrives *before* the turn begins, fading up behind the one
 * on top, so the reveal shows a picture that is already still. Only the first
 * photo of the scene pops in, because it is the only one with nothing above it
 * to be uncovered from.
 *
 * Canvas has no perspective, so the turn is a squeeze towards the hinge with a
 * small lift in height half-way — the near edge of a turning page grows as it
 * comes towards you — and a shade that deepens across the page as it tips
 * away from the light.
 */
function build(inputs: SceneInputs, ctx: BuildContext): Layer[] {
  const { design, durationMs } = ctx;
  const unit = Math.min(design.w, design.h);
  const layers: Layer[] = [backgroundLayer(inputs, ctx)];

  const type = popType(ctx, inputs, SLOTS);
  const count = Math.max(2, Math.min(inputs.photos.length || 4, 8));
  const photos = fillSlots(inputs.photos, count);
  const exitMs = 1_500;
  // Long enough that the next photo is fully in place before the turn starts.
  const turns = popTurns(count, durationMs, { enterMs: 950, exitMs, overlapMs: exitMs + 700 });
  const centre = { x: type.stage.cx, y: type.stage.cy };

  // Earliest on top: each page lies over the one it will uncover.
  for (const turn of [...turns].reverse()) {
    const photo = photos[turn.index];
    if (!photo) continue;

    const card = popCard(photo, type.stage, inputs);
    const turnEnd = turn.spanMs;
    const halfway = turn.exitAtMs + turn.exitMs * 0.5;

    const arrive: Tracks = turn.index === 0
      ? popIn(centre, turn.enterMs, unit)
      : {
          x: [kf(0, centre.x)],
          y: [kf(0, centre.y)],
          opacity: [kf(0, 0, 'linear'), kf(Math.min(650, turn.exitAtMs * 0.5), 1, 'inOutSine')],
        };

    const shade: Layer = {
      id: ctx.id('pop-shade'),
      type: 'gradient',
      startMs: 0,
      endMs: turnEnd,
      tracks: {
        x: [kf(0, card.w / 2)],
        opacity: [kf(turn.exitAtMs, 0, 'linear'), kf(turnEnd, 1, 'inOutSine')],
      },
      props: {
        w: card.w,
        h: card.h,
        gradient: 'linear',
        angle: 0,
        stops: [
          { at: 0, paint: colorFill('rgba(0,0,0,0.05)') },
          { at: 1, paint: colorFill('rgba(0,0,0,0.55)') },
        ],
      },
    };

    layers.push(popGroup(ctx, card, turn, arrive, cardLayers(ctx, card, {
      untilMs: turnEnd,
      settleMs: turn.exitAtMs,
      hinge: true,
      over: [shade],
      windowTracks: {
        scaleX: [kf(turn.exitAtMs, 1, 'linear'), kf(turnEnd, EDGE, 'inOutSine')],
        scaleY: [kf(turn.exitAtMs, 1, 'linear'), kf(halfway, 1.05, 'inOutSine'), kf(turnEnd, 1, 'inOutSine')],
      },
      haloTracks: {
        opacity: [kf(turn.exitAtMs, 1, 'linear'), kf(turn.exitAtMs + turn.exitMs * 0.7, 0, 'inOutSine')],
      },
    })));
  }

  layers.push(...type.layers);
  return layers;
}

const template: SceneTemplate = {
  kind: 'scene',
  id: 'pop-flip',
  name: 'Flip Out',
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
