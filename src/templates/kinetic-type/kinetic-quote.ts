import { colorFill, roleFill, type Keyframe, type Layer } from '@/core/types';
import { fontString } from '@/fonts/registry';
import type { SceneInputs } from '@/document/types';
import type { BuildContext } from '../buildContext';
import type { SceneTemplate } from '../schema';
import { FULL_LOOK, BODY_STYLE, HEADLINE_STYLE } from '../_shared/look';
import { fillSlots, photoProps } from '../_shared/photo';
import { specFor, textFor } from '../_shared/text';
import { backgroundLayer } from '../_shared/chrome';

const kf = (t: number, v: number, ease: Keyframe['ease'] = 'outCubic'): Keyframe => ({ t, v, ease });

const SLOTS = {
  quote: {
    id: 'quote',
    label: 'Quote',
    placeholder: 'It arrived two days early and it fits like it was made for me.',
    maxChars: 150,
    defaultStyle: {
      ...HEADLINE_STYLE, weight: 700 as const, align: 'center' as const, letterSpacingPct: -0.5,
    },
  },
  attribution: {
    id: 'attribution',
    label: 'Who said it',
    placeholder: '— Rita M., verified buyer',
    maxChars: 48,
    defaultStyle: { ...BODY_STYLE, align: 'center' as const, letterSpacingPct: 8, weight: 600 as const },
  },
};

/**
 * Pull Quote.
 *
 * Somebody's words, their face, and their name. A testimonial is the one piece of
 * copy a business cannot write itself, which is why it is worth a template of its
 * own rather than being typed into Statement — where it would be set as a
 * headline, and a headline is the house talking.
 *
 * The quotation mark is decoration and is built by hand rather than through
 * `textFor`, so it carries no slot: it must not turn up in the inspector as
 * something to edit, and it must not be selectable on the canvas. Everything a
 * user can legitimately change goes through the funnel; this does not, and that
 * is the distinction the slot tag is for.
 *
 * The portrait's circle never scales. The photograph inside it does, which looks
 * identical and is not the same thing — a scaled container applies a user's drag
 * along its own scaled axes, so a nudge on a photograph in a growing circle would
 * land somewhere other than where it was dropped.
 */
function build(inputs: SceneInputs, ctx: BuildContext): Layer[] {
  const { design, safe, durationMs } = ctx;
  const unit = Math.min(design.w, design.h);
  const layers: Layer[] = [backgroundLayer(inputs, ctx)];

  const centreX = design.w / 2;

  const quote = textFor(SLOTS.quote, inputs, {
    baseSizePx: unit * 0.05,
    maxWidthPx: safe.w * 0.84,
    reveal: { kind: 'perWord', startMs: 640, durationMs: 460, staggerMs: 62 },
    lineHeight: 1.26,
  });
  const attribution = textFor(SLOTS.attribution, inputs, {
    baseSizePx: unit * 0.021,
    maxWidthPx: safe.w * 0.7,
    reveal: { kind: 'fade', startMs: 1_600, durationMs: 620 },
    fallbackFill: roleFill('accent'),
  });

  const quoteRun = ctx.measure(specFor(quote, fontString(quote.fontId, quote.fontSizePx, quote.weight)));
  const attrRun = ctx.measure(specFor(attribution, fontString(attribution.fontId, attribution.fontSizePx, attribution.weight)));

  const circleD = Math.min(unit * 0.24, safe.h * 0.3);
  const markSize = unit * 0.15;
  /*
   * How much of the mark sits above the quote.
   *
   * A left double quotation mark's ink is in the *top* of its em box, so a
   * small bleed puts the glyph itself squarely on the first line — which is
   * where it landed at 0.3, reading as a collision rather than as a flourish.
   * Just over half the box clears the text and still keeps the two touching.
   */
  const markBleed = markSize * 0.56;

  const gap = unit * 0.035;
  const blockH = circleD + gap + markBleed + quoteRun.height + gap + attrRun.height;
  const top = safe.y + Math.max(0, (safe.h - blockH) / 2);

  const circleY = top + circleD / 2;
  const quoteTop = top + circleD + gap + markBleed;

  const [photo] = fillSlots(inputs.photos, 1);
  if (photo) {
    const props = photoProps(photo, circleD * 1.16);
    layers.push({
      id: ctx.id('portrait'),
      type: 'mask',
      startMs: 0,
      endMs: durationMs,
      tracks: {
        x: [kf(0, centreX)],
        y: [kf(0, circleY)],
        opacity: [kf(0, 0), kf(420, 1)],
      },
      props: { shape: 'ellipse', w: circleD, h: circleD },
      children: [
        {
          id: ctx.id('face'),
          type: 'image',
          startMs: 0,
          endMs: durationMs,
          tracks: {
            x: [kf(0, 0)],
            y: [kf(0, 0)],
            scaleX: [kf(0, 1.18), kf(1_100, 1, { kind: 'spring', stiffness: 150, damping: 17, mass: 1 })],
            scaleY: [kf(0, 1.18), kf(1_100, 1, { kind: 'spring', stiffness: 150, damping: 17, mass: 1 })],
          },
          props,
        },
      ],
    });

    layers.push({
      id: ctx.id('ring'),
      type: 'shape',
      startMs: 0,
      endMs: durationMs,
      tracks: {
        x: [kf(0, centreX)],
        y: [kf(0, circleY)],
        scaleX: [kf(0, 0.86), kf(900, 1, 'outExpo')],
        scaleY: [kf(0, 0.86), kf(900, 1, 'outExpo')],
        opacity: [kf(0, 0), kf(560, 1)],
      },
      props: {
        shape: 'ellipse',
        w: circleD * 1.12,
        h: circleD * 1.12,
        fill: colorFill('rgba(0,0,0,0)'),
        stroke: { paint: roleFill('accent', 0.6), width: Math.max(1, unit * 0.0035) },
      },
    });
  }

  // Decoration, and so deliberately not routed through `textFor` — see above.
  layers.push({
    id: ctx.id('mark'),
    type: 'text',
    startMs: 0,
    endMs: durationMs,
    anchorX: 0.5,
    anchorY: 0,
    tracks: {
      x: [kf(0, centreX)],
      y: [kf(0, quoteTop - markBleed)],
      scaleX: [kf(0, 0.8), kf(700, 1, 'outExpo')],
      scaleY: [kf(0, 0.8), kf(700, 1, 'outExpo')],
      opacity: [kf(220, 0), kf(700, 1)],
    },
    props: {
      text: '“',
      fontId: 'headline',
      fontSizePx: markSize,
      weight: 800,
      letterSpacingPct: 0,
      lineHeight: 1,
      align: 'center',
      fill: roleFill('accent', 0.28),
      maxWidthPx: null,
      reveal: { kind: 'none' },
    },
  });

  layers.push({
    id: ctx.id('quote'),
    type: 'text',
    startMs: 0,
    endMs: durationMs,
    anchorX: 0.5,
    anchorY: 0,
    tracks: { x: [kf(0, centreX)], y: [kf(0, quoteTop)] },
    props: quote,
  });

  layers.push({
    id: ctx.id('attribution'),
    type: 'text',
    startMs: 0,
    endMs: durationMs,
    anchorX: 0.5,
    anchorY: 0,
    tracks: { x: [kf(0, centreX)], y: [kf(0, quoteTop + quoteRun.height + gap)] },
    props: attribution,
  });

  return layers;
}

const template: SceneTemplate = {
  kind: 'scene',
  id: 'kinetic-quote',
  name: 'Pull Quote',
  category: 'Kinetic Type',
  mode: 'both',
  tier: 'free',
  isNew: true,
  designSize: { w: 1080, h: 1080 },
  supportedAspects: ['16:9', '4:3', '1:1', '4:5', '9:16'],
  defaultDurationMs: 7_000,
  minDurationMs: 3_000,
  maxDurationMs: 30_000,
  photoSlots: { min: 1, max: 1, default: 1 },
  textSlots: [SLOTS.quote, SLOTS.attribution],
  supportsLogo: true,
  look: FULL_LOOK,
  build,
};

export default template;
