import { colorFill, roleFill, type Keyframe, type Layer } from '@/core/types';
import { fontString } from '@/fonts/registry';
import type { SceneInputs } from '@/document/types';
import type { BuildContext } from '../buildContext';
import type { SceneTemplate } from '../schema';
import { FULL_LOOK, HEADLINE_STYLE } from '../_shared/look';
import { fillSlots, photoProps } from '../_shared/photo';
import { specFor, textFor } from '../_shared/text';

const kf = (t: number, v: number, ease: Keyframe['ease'] = 'outCubic'): Keyframe => ({ t, v, ease });

const SLOTS = {
  headline: {
    id: 'headline',
    label: 'Headline',
    placeholder: 'The collection',
    maxChars: 36,
    defaultStyle: HEADLINE_STYLE,
  },
};

/**
 * Card Stack.
 *
 * Photos stacked face-on, dealt forward one at a time and looping. Each photo
 * gets an equal turn; the one on top slides up and fades while the rest shuffle
 * forward a step.
 *
 * The loop is seamless because every card's keyframes are expressed relative to
 * its own turn and the stack positions repeat exactly after n turns — a scene
 * that jumps on loop is the single most obvious flaw in this kind of template.
 */
function build(inputs: SceneInputs, ctx: BuildContext): Layer[] {
  const { design, safe, durationMs } = ctx;
  const unit = Math.min(design.w, design.h);
  const layers: Layer[] = [];

  const count = Math.max(2, Math.min(inputs.photos.length || 4, 8));
  const photos = fillSlots(inputs.photos, count);
  const turnMs = durationMs / count;

  const headline = textFor(SLOTS.headline, inputs, {
    baseSizePx: unit * 0.062,
    maxWidthPx: safe.w * 0.85,
    reveal: { kind: 'maskWipe', dir: 'right', startMs: 300, durationMs: 700 },
    lineHeight: 1.1,
  });
  const headRun = ctx.measure(specFor(headline, fontString(headline.fontId, headline.fontSizePx, headline.weight)));

  const headTop = safe.y;
  const stageTop = headTop + headRun.height + unit * 0.05;
  const stageH = Math.max(unit * 0.3, safe.y + safe.h - stageTop);
  const stageCentreY = stageTop + stageH / 2;
  const cardSize = Math.min(unit * 0.56, stageH * 0.78);

  layers.push({
    id: ctx.id('bg'),
    type: 'gradient',
    startMs: 0,
    endMs: durationMs,
    anchorX: 0,
    anchorY: 0,
    tracks: {},
    props: {
      w: design.w,
      h: design.h,
      gradient: 'radial',
      stops: [
        { at: 0, paint: roleFill('surface') },
        { at: 1, paint: roleFill('bg') },
      ],
    },
  });

  // Resting places in the stack: index 0 is on top, each one behind is a little
  // smaller, lower and rotated. Reused by every card as it cycles through.
  // Offsets have to be big enough to read as a *stack*. At a fraction of the
  // frame they vanish behind the top card and the whole thing looks like one
  // photo with a coloured fringe, which is how the first pass came out.
  const restingAt = (slot: number): { y: number; scale: number; rotation: number; opacity: number } => ({
    y: stageCentreY + slot * cardSize * 0.085,
    scale: 1 - slot * 0.1,
    rotation: (slot % 2 === 0 ? 1 : -1) * slot * 3.4,
    opacity: slot >= count ? 0 : 1 - slot * 0.1,
  });

  for (let i = 0; i < count; i++) {
    const photo = photos[i];
    if (!photo) continue;

    const props = photoProps(photo, cardSize, {
      cornerRadius: inputs.look.cornerRadius,
      shadow: { blur: unit * 0.06, offsetX: 0, offsetY: unit * 0.018, paint: colorFill('rgba(0,0,0,0.55)') },
      border: { inset: 0, paint: roleFill('ink', 0.1), width: Math.max(1, unit * 0.002) },
    });

    const exitMs = Math.min(620, turnMs * 0.45);

    const yTrack: Keyframe[] = [];
    const scaleTrack: Keyframe[] = [];
    const rotTrack: Keyframe[] = [];
    const opacityTrack: Keyframe[] = [];

    // Walk every turn in the loop and record where this card sits during it.
    for (let turn = 0; turn <= count; turn++) {
      const at = turn * turnMs;
      // How far this card is from the top during this turn.
      const slot = (i - turn + count) % count;
      const rest = restingAt(slot);

      if (slot === 0) {
        // Arriving on top: settle in, hold, then deal away.
        yTrack.push(kf(at, rest.y, 'outCubic'));
        scaleTrack.push(kf(at, rest.scale, 'outCubic'));
        rotTrack.push(kf(at, 0, 'outCubic'));
        opacityTrack.push(kf(at, 1));

        const leaves = at + turnMs - exitMs;
        yTrack.push(kf(leaves, rest.y, 'inCubic'), kf(at + turnMs, rest.y - unit * 0.42, 'inCubic'));
        scaleTrack.push(kf(leaves, rest.scale), kf(at + turnMs, rest.scale * 1.08, 'inCubic'));
        rotTrack.push(kf(leaves, 0), kf(at + turnMs, -7, 'inCubic'));
        opacityTrack.push(kf(leaves, 1), kf(at + turnMs, 0, 'inCubic'));
      } else if (slot === count - 1) {
        // Returning to the back of the stack — appear there rather than flying
        // back across the frame, which would read as a mistake.
        yTrack.push(kf(at, rest.y));
        scaleTrack.push(kf(at, rest.scale));
        rotTrack.push(kf(at, rest.rotation));
        opacityTrack.push(kf(at, 0), kf(at + Math.min(280, turnMs * 0.3), rest.opacity));
      } else {
        yTrack.push(kf(at, rest.y, 'outCubic'));
        scaleTrack.push(kf(at, rest.scale, 'outCubic'));
        rotTrack.push(kf(at, rest.rotation, 'outCubic'));
        opacityTrack.push(kf(at, rest.opacity));
      }
    }

    layers.push({
      id: ctx.id('card'),
      type: 'image',
      // Drawn back to front: the card whose turn is furthest away sits deepest.
      startMs: 0,
      endMs: durationMs,
      tracks: {
        x: [kf(0, design.w / 2)],
        y: yTrack,
        scaleX: scaleTrack,
        scaleY: scaleTrack,
        rotation: rotTrack,
        opacity: opacityTrack,
      },
      props,
    });
  }

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

  return layers;
}

const template: SceneTemplate = {
  kind: 'scene',
  id: 'depth-stack',
  name: 'Card Stack',
  category: 'Depth Stage',
  mode: 'both',
  tier: 'free',
  isNew: true,
  designSize: { w: 1080, h: 1080 },
  supportedAspects: ['1:1', '4:5', '9:16', '4:3'],
  defaultDurationMs: 12_000,
  minDurationMs: 4_000,
  maxDurationMs: 40_000,
  photoSlots: { min: 2, max: 8, default: 4 },
  textSlots: [SLOTS.headline],
  supportsLogo: true,
  look: FULL_LOOK,
  build,
};

export default template;
