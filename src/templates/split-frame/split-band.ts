import { roleFill, type Keyframe, type Layer } from '@/core/types';
import { fontString } from '@/fonts/registry';
import type { SceneInputs } from '@/document/types';
import type { BuildContext } from '../buildContext';
import type { SceneTemplate } from '../schema';
import { FULL_LOOK, BODY_STYLE, HEADLINE_STYLE } from '../_shared/look';
import { fillSlots, photoProps } from '../_shared/photo';
import { specFor, textFor } from '../_shared/text';
import { backgroundLayer, contentFloor } from '../_shared/chrome';

const kf = (t: number, v: number, ease: Keyframe['ease'] = 'outCubic'): Keyframe => ({ t, v, ease });

const SLOTS = {
  eyebrow: {
    id: 'eyebrow',
    label: 'Eyebrow',
    placeholder: 'New this week',
    maxChars: 28,
    defaultStyle: { ...BODY_STYLE, align: 'left' as const, letterSpacingPct: 16, weight: 700 as const },
  },
  headline: {
    id: 'headline',
    label: 'Headline',
    placeholder: 'Built for the long way round',
    maxChars: 52,
    defaultStyle: { ...HEADLINE_STYLE, align: 'left' as const },
  },
  body: {
    id: 'body',
    label: 'Body',
    placeholder: 'Waxed canvas, brass hardware, and a strap that outlives the bag.',
    maxChars: 120,
    defaultStyle: { ...BODY_STYLE, align: 'left' as const, letterSpacingPct: 0 },
  },
  cta: {
    id: 'cta',
    label: 'Button',
    placeholder: 'Shop the range',
    maxChars: 24,
    // The pill is on by default because this slot *is* a button. Every other
    // template leaves it off, where it is a decoration a user may want.
    defaultStyle: {
      ...BODY_STYLE, align: 'center' as const, weight: 700 as const, letterSpacingPct: 6, pill: true, wrap: false,
    },
  },
};

/**
 * Side Band.
 *
 * A photograph on one side, a block of colour on the other, and the whole message
 * — eyebrow, headline, body, button — living in the block. The plainest, most
 * reused advertising layout there is, and the one shape this library was missing:
 * everything else here puts type *over* a photograph, which is fine for three
 * words and hopeless for three lines and a call to action.
 *
 * Type over an image is a legibility problem that never fully goes away, however
 * heavy the scrim. Giving the words their own ground solves it outright, and
 * leaves the photograph uncovered, which is the second reason to do it.
 *
 * The button is a real slot with its pill on by default. Every other template in
 * the library leaves the pill off, because there it is a decoration; here it is
 * the point, and a call to action that does not look pressable is a caption.
 *
 * Split follows the frame: beside when there is width, beneath when there is not.
 */
function build(inputs: SceneInputs, ctx: BuildContext): Layer[] {
  const { design, safe, durationMs } = ctx;
  const unit = Math.min(design.w, design.h);
  const layers: Layer[] = [backgroundLayer(inputs, ctx)];

  const sideBySide = design.w >= design.h;

  const band = sideBySide
    ? { x: 0, y: 0, w: design.w * 0.44, h: design.h }
    : { x: 0, y: design.h * 0.54, w: design.w, h: design.h * 0.46 };

  const panel = sideBySide
    ? { x: band.w, y: 0, w: design.w - band.w, h: design.h }
    : { x: 0, y: 0, w: design.w, h: band.y };

  const [photo] = fillSlots(inputs.photos, 1);
  if (photo) {
    const props = photoProps(photo, Math.max(panel.w, panel.h) * 1.12);
    layers.push({
      id: ctx.id('panel'),
      type: 'mask',
      startMs: 0,
      endMs: durationMs,
      tracks: {
        x: [kf(0, panel.x + panel.w / 2)],
        y: [kf(0, panel.y + panel.h / 2)],
        clipProgress: [kf(0, 0), kf(860, 1, 'outExpo')],
      },
      props: {
        shape: 'rect',
        w: panel.w,
        h: panel.h,
        clipFrom: sideBySide ? 'right' : 'up',
      },
      children: [
        {
          id: ctx.id('photo'),
          type: 'image',
          startMs: 0,
          endMs: durationMs,
          tracks: {
            x: [kf(0, 0)],
            y: [kf(0, 0)],
            scaleX: [kf(0, 1, 'inOutSine'), kf(durationMs, 1.09, 'inOutSine')],
            scaleY: [kf(0, 1, 'inOutSine'), kf(durationMs, 1.09, 'inOutSine')],
          },
          props,
        },
      ],
    });
  }

  // The block itself, sliding in from its own edge so it reads as arriving over
  // the photograph rather than as having always been the background.
  const bandFrom = sideBySide ? { x: band.w / 2 - band.w, y: band.h / 2 } : { x: band.w / 2, y: band.y + band.h / 2 + band.h };
  layers.push({
    id: ctx.id('band'),
    type: 'shape',
    startMs: 0,
    endMs: durationMs,
    tracks: {
      x: [kf(0, bandFrom.x), kf(720, band.x + band.w / 2, 'outExpo')],
      y: [kf(0, bandFrom.y), kf(720, band.y + band.h / 2, 'outExpo')],
    },
    props: { shape: 'rect', w: band.w, h: band.h, fill: roleFill('surface') },
  });

  // Inset from the band, but never outside the safe box: the band bleeds to the
  // frame edge and the words must not follow it there.
  const inset = unit * 0.06;
  const typeX = Math.max(safe.x, band.x + inset);
  const typeRight = Math.min(safe.x + safe.w, band.x + band.w - inset);
  const typeW = Math.max(unit * 0.2, typeRight - typeX);

  const eyebrow = textFor(SLOTS.eyebrow, inputs, {
    baseSizePx: unit * 0.019,
    maxWidthPx: typeW,
    reveal: { kind: 'fade', startMs: 760, durationMs: 420 },
    fallbackFill: roleFill('accent'),
  });
  const headline = textFor(SLOTS.headline, inputs, {
    baseSizePx: unit * 0.062,
    maxWidthPx: typeW,
    reveal: { kind: 'perWord', startMs: 900, durationMs: 480, staggerMs: 72 },
    lineHeight: 1.06,
  });
  const body = textFor(SLOTS.body, inputs, {
    baseSizePx: unit * 0.024,
    maxWidthPx: typeW,
    reveal: { kind: 'fade', startMs: 1_400, durationMs: 600 },
    fallbackFill: roleFill('inkMuted'),
    lineHeight: 1.36,
  });
  const cta = textFor(SLOTS.cta, inputs, {
    baseSizePx: unit * 0.022,
    maxWidthPx: typeW,
    reveal: { kind: 'fade', startMs: 1_900, durationMs: 460 },
    fallbackFill: roleFill('bg'),
  });

  const eyeRun = ctx.measure(specFor(eyebrow, fontString(eyebrow.fontId, eyebrow.fontSizePx, eyebrow.weight)));
  const headRun = ctx.measure(specFor(headline, fontString(headline.fontId, headline.fontSizePx, headline.weight)));
  const bodyRun = ctx.measure(specFor(body, fontString(body.fontId, body.fontSizePx, body.weight)));
  const ctaRun = ctx.measure(specFor(cta, fontString(cta.fontId, cta.fontSizePx, cta.weight)));

  const gapSmall = unit * 0.022;
  const gapLarge = unit * 0.038;
  const blockH = eyeRun.height + gapSmall + headRun.height + gapSmall + bodyRun.height + gapLarge + ctaRun.height;

  const bandTop = Math.max(band.y, safe.y);
  const bandBottom = Math.min(band.y + band.h, contentFloor(design, safe));
  const cursorStart = bandTop + Math.max(0, (bandBottom - bandTop - blockH) / 2);

  /** Each line slides up a little as it fades, so the block settles as a block. */
  const line = (props: typeof eyebrow, y: number, at: number, id: string): Layer => ({
    id: ctx.id(id),
    type: 'text',
    startMs: 0,
    endMs: durationMs,
    anchorX: 0,
    anchorY: 0,
    tracks: {
      x: [kf(0, typeX)],
      y: [kf(at, y + unit * 0.014), kf(at + 620, y, 'outExpo')],
    },
    props,
  });

  let cursor = cursorStart;
  layers.push(line(eyebrow, cursor, 760, 'eyebrow'));
  cursor += eyeRun.height + gapSmall;
  layers.push(line(headline, cursor, 900, 'headline'));
  cursor += headRun.height + gapSmall;
  layers.push(line(body, cursor, 1_400, 'body'));
  cursor += bodyRun.height + gapLarge;

  // Centre-aligned inside its own pill, which is as wide as the column; the pill
  // is drawn from the text's own box, so it has to be the text that is centred.
  layers.push({
    id: ctx.id('cta'),
    type: 'text',
    startMs: 0,
    endMs: durationMs,
    anchorX: 0,
    anchorY: 0,
    tracks: {
      x: [kf(0, typeX)],
      y: [kf(1_900, cursor + unit * 0.014), kf(2_520, cursor, 'outExpo')],
      scaleX: [kf(1_900, 0.94), kf(2_460, 1, { kind: 'spring', stiffness: 190, damping: 16, mass: 1 })],
      scaleY: [kf(1_900, 0.94), kf(2_460, 1, { kind: 'spring', stiffness: 190, damping: 16, mass: 1 })],
    },
    props: cta,
  });

  return layers;
}

const template: SceneTemplate = {
  kind: 'scene',
  id: 'split-band',
  name: 'Side Band',
  category: 'Split Frame',
  mode: 'both',
  tier: 'free',
  isNew: true,
  designSize: { w: 1080, h: 1080 },
  supportedAspects: ['16:9', '4:3', '1:1', '4:5', '9:16'],
  defaultDurationMs: 8_000,
  minDurationMs: 4_000,
  maxDurationMs: 30_000,
  photoSlots: { min: 1, max: 1, default: 1 },
  textSlots: [SLOTS.eyebrow, SLOTS.headline, SLOTS.body, SLOTS.cta],
  supportsLogo: true,
  look: FULL_LOOK,
  build,
};

export default template;
