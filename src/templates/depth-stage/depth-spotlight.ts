import { colorFill, roleFill, type Keyframe, type Layer } from '@/core/types';
import { fontString } from '@/fonts/registry';
import type { SceneInputs } from '@/document/types';
import type { BuildContext } from '../buildContext';
import type { SceneTemplate } from '../schema';
import { FULL_LOOK, BODY_STYLE, HEADLINE_STYLE } from '../_shared/look';
import { fillSlots, photoProps } from '../_shared/photo';
import { specFor, textFor } from '../_shared/text';
import { backgroundLayer, contentFloor, logoLayers } from '../_shared/chrome';

const kf = (t: number, v: number, ease: Keyframe['ease'] = 'outCubic'): Keyframe => ({ t, v, ease });

const SLOTS = {
  headline: {
    id: 'headline',
    label: 'Headline',
    placeholder: 'One at a time',
    maxChars: 40,
    defaultStyle: { ...HEADLINE_STYLE, align: 'center' as const },
  },
  caption: {
    id: 'caption',
    label: 'Caption',
    placeholder: 'The full range, in order',
    maxChars: 56,
    defaultStyle: { ...BODY_STYLE, align: 'center' as const, letterSpacingPct: 10, weight: 600 as const },
  },
};

/**
 * Spotlight.
 *
 * A shelf of photographs with one of them brought forward and lit, taking turns.
 * The layout for a catalogue: the viewer sees the whole set the entire time and
 * is told which one to look at, which neither Card Stack (one at a time, the
 * rest hidden) nor Contact Sheet (all equal, none emphasised) can do.
 *
 * The handoff is the part worth being careful about. Every photograph is built
 * at the *front* size and reaches the shelf by scaling down, so the travelling
 * layer and the resting layer describe the same photo with the same numbers —
 * the swap between them is arithmetically exact and there is no frame where the
 * photo jumps or changes weight. Building the shelf at its own smaller size and
 * scaling up to the front would put a rounding difference on every handoff.
 *
 * A shelf photo's resting layer is cut in two around its turn rather than being
 * faded out by keyframes, so the windows are expressed where the renderer
 * already reads them and there is no moment when two copies are both alive.
 */
function build(inputs: SceneInputs, ctx: BuildContext): Layer[] {
  const { design, safe, durationMs } = ctx;
  const unit = Math.min(design.w, design.h);
  const layers: Layer[] = [backgroundLayer(inputs, ctx)];

  const count = Math.max(2, Math.min(inputs.photos.length || 3, 6));
  const photos = fillSlots(inputs.photos, count);
  const turnMs = durationMs / count;

  const headline = textFor(SLOTS.headline, inputs, {
    baseSizePx: unit * 0.062,
    maxWidthPx: safe.w * 0.88,
    reveal: { kind: 'maskWipe', dir: 'right', startMs: 260, durationMs: 720 },
    lineHeight: 1.08,
  });
  const caption = textFor(SLOTS.caption, inputs, {
    baseSizePx: unit * 0.022,
    maxWidthPx: safe.w * 0.7,
    reveal: { kind: 'fade', startMs: 900, durationMs: 560 },
    fallbackFill: roleFill('accent'),
  });

  const headRun = ctx.measure(specFor(headline, fontString(headline.fontId, headline.fontSizePx, headline.weight)));
  const capRun = ctx.measure(specFor(caption, fontString(caption.fontId, caption.fontSizePx, caption.weight)));

  const stageTop = safe.y + headRun.height + unit * 0.04;
  const floor = contentFloor(design, safe);
  const stageBottom = floor - capRun.height - unit * 0.04;
  const stageH = Math.max(unit * 0.3, stageBottom - stageTop);

  const shelfSize = Math.min(unit * 0.15, stageH * 0.2, (safe.w / count) * 0.8);
  const shelfY = stageTop + shelfSize * 0.62;

  const frontTop = shelfY + shelfSize * 0.62 + unit * 0.025;
  const frontSize = Math.min(safe.w * 0.68, Math.max(unit * 0.2, (stageBottom - frontTop) * 0.8));
  const frontY = frontTop + (stageBottom - frontTop) / 2;
  const frontX = design.w / 2;

  // Everything is built at the front size; the shelf is that size scaled down.
  const shelfScale = shelfSize / frontSize;
  const SHELF_OPACITY = 0.5;

  const shelfX = (index: number): number => safe.x + (safe.w * (index + 0.5)) / count;
  const shelfTilt = (index: number): number => (index % 2 === 0 ? -1 : 1) * 4;

  const propsFor = (photoIndex: number): ReturnType<typeof photoProps> | null => {
    const photo = photos[photoIndex];
    if (!photo) return null;
    return photoProps(photo, frontSize, {
      cornerRadius: inputs.look.cornerRadius,
      shadow: { blur: unit * 0.06, offsetX: 0, offsetY: unit * 0.016, paint: colorFill('rgba(0,0,0,0.55)') },
    });
  };

  const resting = (photoIndex: number, startMs: number, endMs: number): Layer | null => {
    const props = propsFor(photoIndex);
    if (!props || endMs - startMs < 1) return null;
    return {
      id: ctx.id('shelf'),
      type: 'image',
      startMs,
      endMs,
      tracks: {
        x: [kf(0, shelfX(photoIndex))],
        y: [kf(0, shelfY)],
        scaleX: [kf(0, shelfScale)],
        scaleY: [kf(0, shelfScale)],
        rotation: [kf(0, shelfTilt(photoIndex))],
        opacity: [kf(0, SHELF_OPACITY)],
      },
      props,
    };
  };

  // The shelf first, in index order, so the travelling photo is always on top.
  for (let photoIndex = 0; photoIndex < count; photoIndex++) {
    const from = photoIndex * turnMs;
    const to = from + turnMs;
    const before = resting(photoIndex, 0, from);
    if (before) layers.push(before);
    const after = resting(photoIndex, to, durationMs);
    if (after) layers.push(after);
  }

  // A pool of light for whoever is at the front. Static, because a spotlight
  // that moves with the photograph reads as a glow stuck to it rather than as
  // a place on the stage.
  layers.push({
    id: ctx.id('pool'),
    type: 'gradient',
    startMs: 0,
    endMs: durationMs,
    tracks: {
      x: [kf(0, frontX)],
      y: [kf(0, frontY)],
      opacity: [kf(0, 0), kf(700, 1)],
    },
    props: {
      w: frontSize * 2.1,
      h: frontSize * 2.1,
      gradient: 'radial',
      stops: [
        { at: 0, paint: roleFill('accent', 0.3) },
        { at: 0.55, paint: roleFill('accent', 0.08) },
        { at: 1, paint: colorFill('rgba(0,0,0,0)') },
      ],
    },
  });

  for (let photoIndex = 0; photoIndex < count; photoIndex++) {
    const props = propsFor(photoIndex);
    if (!props) continue;

    const from = photoIndex * turnMs;
    const rise = Math.min(620, turnMs * 0.32);
    const fall = Math.min(520, turnMs * 0.28);
    const leaves = turnMs - fall;

    // Out to the shelf and back to the same shelf place, so a photograph never
    // appears to change position by having had a turn.
    layers.push({
      id: ctx.id('front'),
      type: 'image',
      startMs: from,
      endMs: from + turnMs,
      tracks: {
        x: [kf(0, shelfX(photoIndex)), kf(rise, frontX, 'outExpo'), kf(leaves, frontX), kf(turnMs, shelfX(photoIndex), 'inOutSine')],
        y: [kf(0, shelfY), kf(rise, frontY, 'outExpo'), kf(leaves, frontY), kf(turnMs, shelfY, 'inOutSine')],
        scaleX: [kf(0, shelfScale), kf(rise, 1, 'outExpo'), kf(leaves, 1), kf(turnMs, shelfScale, 'inOutSine')],
        scaleY: [kf(0, shelfScale), kf(rise, 1, 'outExpo'), kf(leaves, 1), kf(turnMs, shelfScale, 'inOutSine')],
        rotation: [kf(0, shelfTilt(photoIndex)), kf(rise, 0, 'outExpo'), kf(leaves, 0), kf(turnMs, shelfTilt(photoIndex), 'inOutSine')],
        opacity: [kf(0, SHELF_OPACITY), kf(rise * 0.7, 1, 'outQuad'), kf(leaves, 1), kf(turnMs, SHELF_OPACITY, 'inOutSine')],
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
    tracks: { x: [kf(0, design.w / 2)], y: [kf(0, safe.y)] },
    props: headline,
  });

  layers.push({
    id: ctx.id('caption'),
    type: 'text',
    startMs: 0,
    endMs: durationMs,
    anchorX: 0.5,
    anchorY: 0,
    // Text runs downward from its anchor whatever anchorY says, so the line
    // is placed by its top: one line above the floor.
    tracks: { x: [kf(0, design.w / 2)], y: [kf(0, floor - capRun.height)] },
    props: caption,
  });

  layers.push(...logoLayers(inputs, ctx));

  return layers;
}

const template: SceneTemplate = {
  kind: 'scene',
  id: 'depth-spotlight',
  name: 'Spotlight',
  category: 'Depth Stage',
  mode: 'both',
  tier: 'free',
  isNew: true,
  designSize: { w: 1080, h: 1080 },
  supportedAspects: ['16:9', '4:3', '1:1', '4:5', '9:16'],
  defaultDurationMs: 9_000,
  minDurationMs: 4_000,
  maxDurationMs: 30_000,
  photoSlots: { min: 2, max: 6, default: 3 },
  textSlots: [SLOTS.headline, SLOTS.caption],
  supportsLogo: true,
  look: FULL_LOOK,
  build,
};

export default template;
