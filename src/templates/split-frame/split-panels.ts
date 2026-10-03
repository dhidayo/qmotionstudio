import { colorFill, roleFill, type Keyframe, type Layer } from '@/core/types';
import { fontString } from '@/fonts/registry';
import type { SceneInputs } from '@/document/types';
import type { BuildContext } from '../buildContext';
import type { SceneTemplate } from '../schema';
import { FULL_BLEED_LOOK, BODY_STYLE, HEADLINE_STYLE } from '../_shared/look';
import { fillSlots, photoProps } from '../_shared/photo';
import { specFor, textFor } from '../_shared/text';

const kf = (t: number, v: number, ease: Keyframe['ease'] = 'outCubic'): Keyframe => ({ t, v, ease });

const SLOTS = {
  headline: {
    id: 'headline',
    label: 'Headline',
    placeholder: 'Three ways to wear it',
    maxChars: 44,
    defaultStyle: { ...HEADLINE_STYLE, align: 'center' as const },
  },
  caption: {
    id: 'caption',
    label: 'Caption',
    placeholder: 'Pick your side',
    maxChars: 48,
    defaultStyle: { ...BODY_STYLE, align: 'center' as const, letterSpacingPct: 14, weight: 600 as const },
  },
};

/**
 * Panels.
 *
 * The frame divided into equal panels edge to edge, one photograph in each,
 * arriving from alternating ends. A triptych when there are three and a set of
 * bands when there are four, and the same template either way: the panels run
 * across whichever axis is longer, so a landscape frame gets columns and a
 * portrait frame gets rows. Splitting a 9:16 frame into columns gives slivers
 * nobody can read, which is the mistake Split Pair already avoids and the reason
 * this is decided from the frame rather than fixed.
 *
 * Contact Sheet is the other way to show a set at once, and the difference is the
 * gap: a sheet is objects on a ground, panels are a single divided surface. Panels
 * fill the frame completely, which is why the seams are drawn and the type gets a
 * band of its own rather than a corner.
 *
 * The photographs slide inside static windows rather than the windows opening over
 * them. Identical to look at, and it keeps every panel's coordinate space the
 * frame's own, so dragging a photograph inside one still lands where it is
 * dropped.
 */
function build(inputs: SceneInputs, ctx: BuildContext): Layer[] {
  const { design, safe, durationMs } = ctx;
  const unit = Math.min(design.w, design.h);
  const layers: Layer[] = [];

  const count = Math.max(2, Math.min(inputs.photos.length || 3, 5));
  const photos = fillSlots(inputs.photos, count);

  const columns = design.w >= design.h;
  const panelW = columns ? design.w / count : design.w;
  const panelH = columns ? design.h : design.h / count;

  photos.forEach((photo, index) => {
    const cx = columns ? panelW * (index + 0.5) : design.w / 2;
    const cy = columns ? design.h / 2 : panelH * (index + 0.5);

    // Oversized, because the slide has to fill the window at both ends of the
    // move and a photograph exactly the size of its panel shows a gap for the
    // whole of it.
    const props = photoProps(photo, Math.max(panelW, panelH) * 1.15);
    const travel = columns ? panelH * 0.35 : panelW * 0.35;
    const towards = index % 2 === 0 ? -1 : 1;
    const delay = ctx.stagger(index, count, 130, 'start');

    layers.push({
      id: ctx.id('panel'),
      type: 'mask',
      startMs: 0,
      endMs: durationMs,
      tracks: { x: [kf(0, cx)], y: [kf(0, cy)] },
      props: { shape: 'rect', w: panelW, h: panelH },
      children: [
        {
          id: ctx.id('photo'),
          type: 'image',
          startMs: 0,
          endMs: durationMs,
          tracks: {
            x: [
              kf(0, columns ? 0 : travel * towards),
              kf(delay, columns ? 0 : travel * towards),
              kf(delay + 900, 0, 'outExpo'),
            ],
            y: [
              kf(0, columns ? travel * towards : 0),
              kf(delay, columns ? travel * towards : 0),
              kf(delay + 900, 0, 'outExpo'),
            ],
            // A slow counter-drift afterwards, opposite to the arrival, so the
            // panels never settle into a still frame.
            scaleX: [kf(delay + 900, 1, 'inOutSine'), kf(durationMs, 1.06, 'inOutSine')],
            scaleY: [kf(delay + 900, 1, 'inOutSine'), kf(durationMs, 1.06, 'inOutSine')],
            opacity: [kf(0, 0), kf(delay, 0), kf(delay + 300, 1)],
          },
          props,
        },
      ],
    });
  });

  // Seams on the joins, growing out of the middle of each one.
  const seam = Math.max(2, unit * 0.004);
  for (let index = 1; index < count; index++) {
    layers.push({
      id: ctx.id('seam'),
      type: 'shape',
      startMs: 0,
      endMs: durationMs,
      tracks: {
        x: [kf(0, columns ? panelW * index : design.w / 2)],
        y: [kf(0, columns ? design.h / 2 : panelH * index)],
        scaleX: columns ? [kf(0, 1)] : [kf(400, 0), kf(1_200, 1, 'outExpo')],
        scaleY: columns ? [kf(400, 0), kf(1_200, 1, 'outExpo')] : [kf(0, 1)],
        opacity: [kf(0, 0), kf(400, 1)],
      },
      props: {
        shape: 'rect',
        w: columns ? seam : design.w,
        h: columns ? design.h : seam,
        fill: roleFill('accent'),
      },
    });
  }

  const headline = textFor(SLOTS.headline, inputs, {
    baseSizePx: unit * 0.07,
    maxWidthPx: safe.w * 0.86,
    reveal: { kind: 'perWord', startMs: 900, durationMs: 460, staggerMs: 70 },
    lineHeight: 1.08,
  });
  const caption = textFor(SLOTS.caption, inputs, {
    baseSizePx: unit * 0.021,
    maxWidthPx: safe.w * 0.7,
    reveal: { kind: 'fade', startMs: 1_500, durationMs: 600 },
    fallbackFill: roleFill('accent'),
  });

  const headRun = ctx.measure(specFor(headline, fontString(headline.fontId, headline.fontSizePx, headline.weight)));
  const capRun = ctx.measure(specFor(caption, fontString(caption.fontId, caption.fontSizePx, caption.weight)));

  const blockH = headRun.height + capRun.height + unit * 0.026;
  const blockTop = design.h / 2 - blockH / 2;
  const padY = unit * 0.055;

  // A band across the middle rather than a corner: the type crosses every panel,
  // which is what ties them into one image instead of a row of separate ones.
  layers.push({
    id: ctx.id('type-scrim'),
    type: 'gradient',
    startMs: 0,
    endMs: durationMs,
    tracks: {
      x: [kf(0, design.w / 2)],
      y: [kf(0, blockTop + blockH / 2)],
      opacity: [kf(600, 0), kf(1_100, 1)],
    },
    props: {
      w: design.w,
      h: blockH + padY * 2,
      gradient: 'linear',
      angle: 90,
      stops: [
        /*
          * Flat across the middle rather than a peak at the centre.
          *
          * A single dark point at the centre is darkest exactly where the
          * headline is and has already fallen away by the time the caption
          * starts, so the caption lands on whatever the photograph is doing —
          * which, on a bright one, is nothing legible. The band covers the
          * whole type block and only softens at its edges.
          */
        { at: 0, paint: colorFill('rgba(0,0,0,0)') },
        { at: 0.2, paint: colorFill('rgba(0,0,0,0.76)') },
        { at: 0.8, paint: colorFill('rgba(0,0,0,0.76)') },
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
    tracks: { x: [kf(0, design.w / 2)], y: [kf(0, blockTop)] },
    props: headline,
  });

  layers.push({
    id: ctx.id('caption'),
    type: 'text',
    startMs: 0,
    endMs: durationMs,
    anchorX: 0.5,
    anchorY: 0,
    tracks: { x: [kf(0, design.w / 2)], y: [kf(0, blockTop + headRun.height + unit * 0.026)] },
    props: caption,
  });

  return layers;
}

const template: SceneTemplate = {
  kind: 'scene',
  id: 'split-panels',
  name: 'Panels',
  category: 'Split Frame',
  mode: 'both',
  tier: 'free',
  isNew: true,
  designSize: { w: 1080, h: 1080 },
  supportedAspects: ['16:9', '4:3', '1:1', '4:5', '9:16'],
  defaultDurationMs: 7_000,
  minDurationMs: 3_000,
  maxDurationMs: 30_000,
  photoSlots: { min: 2, max: 5, default: 3 },
  textSlots: [SLOTS.headline, SLOTS.caption],
  supportsLogo: true,
  look: FULL_BLEED_LOOK,
  build,
};

export default template;
