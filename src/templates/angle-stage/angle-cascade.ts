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
  headline: {
    id: 'headline',
    label: 'Headline',
    placeholder: 'The whole set',
    maxChars: 40,
    defaultStyle: { ...HEADLINE_STYLE, align: 'center' as const },
  },
  caption: {
    id: 'caption',
    label: 'Caption',
    placeholder: 'Shot over one afternoon',
    maxChars: 56,
    defaultStyle: { ...BODY_STYLE, align: 'center' as const },
  },
};

/**
 * Cascade.
 *
 * Photographs falling into a diagonal stair, each one landing a beat after the
 * last and settling with a bounce. Fan Out springs from a centre and sways; this
 * arrives from off the top and stays where it lands, which is the difference
 * between a display and a deal.
 *
 * The diagonal is the composition. Photographs on a horizontal row read as a
 * filmstrip and photographs in a grid read as a sheet; a stair reads as a hand
 * of prints someone has just put down, and it is the only one of the three that
 * lets each photograph overlap its neighbour without hiding it.
 *
 * Every card overlaps the one before it, so draw order is arrival order and the
 * cascade reads front to back down the stair. That also means the first card is
 * the most covered, which is why it is the largest step from the top: the eye
 * should land on the last one to arrive.
 */
function build(inputs: SceneInputs, ctx: BuildContext): Layer[] {
  const { design, safe, durationMs } = ctx;
  const unit = Math.min(design.w, design.h);
  const layers: Layer[] = [backgroundLayer(inputs, ctx)];

  const count = Math.max(2, Math.min(inputs.photos.length || 4, 7));
  const photos = fillSlots(inputs.photos, count);

  const headline = textFor(SLOTS.headline, inputs, {
    baseSizePx: unit * 0.062,
    maxWidthPx: safe.w * 0.86,
    reveal: { kind: 'maskWipe', dir: 'right', startMs: 200, durationMs: 700 },
    lineHeight: 1.08,
  });
  const caption = textFor(SLOTS.caption, inputs, {
    baseSizePx: unit * 0.023,
    maxWidthPx: safe.w * 0.68,
    reveal: { kind: 'fade', startMs: 760, durationMs: 600 },
    fallbackFill: roleFill('inkMuted'),
  });

  const headRun = ctx.measure(specFor(headline, fontString(headline.fontId, headline.fontSizePx, headline.weight)));
  const capRun = ctx.measure(specFor(caption, fontString(caption.fontId, caption.fontSizePx, caption.weight)));

  const typeH = headRun.height + capRun.height + unit * 0.024;
  const stageTop = safe.y + typeH + unit * 0.045;
  const stageH = Math.max(unit * 0.28, safe.y + safe.h - stageTop);

  /*
   * Cards sized so the stair fits, then the stair spread over whatever is left.
   *
   * Sizing the card first and the spacing second is the right way round: a
   * cascade of six cards that each shrink to fit the diagonal ends up as six
   * stamps, whereas a generous card with a tighter step still reads as a
   * cascade — overlapping more is the correct failure mode here.
   */
  const cardBase = Math.min(safe.w * 0.5, stageH * 0.62, unit * 0.44);
  const cardW = cardBase * 0.94;
  const cardH = cardBase * 1.1;

  const runX = Math.max(0, safe.w - cardW);
  const runY = Math.max(0, stageH - cardH);
  const stepX = count > 1 ? runX / (count - 1) : 0;
  const stepY = count > 1 ? runY / (count - 1) : 0;

  const originX = safe.x + cardW / 2;
  const originY = stageTop + cardH / 2;

  photos.forEach((photo, index) => {
    const x = originX + stepX * index;
    const y = originY + stepY * index;
    const lean = (index % 2 === 0 ? -1 : 1) * (4 + (index % 3) * 1.6);

    const delay = 320 + ctx.stagger(index, count, 150, 'start');
    const landMs = 700;

    const props = photoProps(photo, cardBase, {
      cornerRadius: inputs.look.cornerRadius,
      shadow: { blur: unit * 0.05, offsetX: 0, offsetY: unit * 0.016, paint: colorFill('rgba(0,0,0,0.5)') },
      border: { inset: 0, paint: roleFill('ink', 0.12), width: Math.max(1, unit * 0.002) },
    });

    // A single settle, then a long slow lean. Springing the position as well as
    // the rotation makes seven cards look like a nervous tic; the bounce belongs
    // on one property only.
    layers.push({
      id: ctx.id('card'),
      type: 'image',
      startMs: 0,
      endMs: durationMs,
      tracks: {
        x: [kf(0, x - unit * 0.05), kf(delay, x - unit * 0.05), kf(delay + landMs, x, 'outExpo')],
        y: [kf(0, y - stageH - cardH), kf(delay, y - stageH - cardH), kf(delay + landMs, y, 'outExpo')],
        rotation: [
          kf(0, lean * 2.4),
          kf(delay, lean * 2.4),
          kf(delay + landMs, lean, { kind: 'spring', stiffness: 170, damping: 15, mass: 1 }),
          kf(durationMs, lean * 0.6, 'inOutSine'),
        ],
        opacity: [kf(0, 0), kf(delay, 0), kf(delay + 220, 1)],
      },
      props,
    });
  });

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
    tracks: { x: [kf(0, design.w / 2)], y: [kf(0, safe.y + headRun.height + unit * 0.024)] },
    props: caption,
  });

  return layers;
}

const template: SceneTemplate = {
  kind: 'scene',
  id: 'angle-cascade',
  name: 'Cascade',
  category: 'Angle Stage',
  mode: 'both',
  tier: 'free',
  isNew: true,
  designSize: { w: 1080, h: 1080 },
  supportedAspects: ['16:9', '4:3', '1:1', '4:5', '9:16'],
  defaultDurationMs: 7_000,
  minDurationMs: 3_000,
  maxDurationMs: 30_000,
  photoSlots: { min: 2, max: 7, default: 4 },
  textSlots: [SLOTS.headline, SLOTS.caption],
  supportsLogo: true,
  look: FULL_LOOK,
  build,
};

export default template;
