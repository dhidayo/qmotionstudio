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
    placeholder: 'The whole collection',
    maxChars: 40,
    defaultStyle: { ...HEADLINE_STYLE, align: 'center' as const },
  },
  caption: {
    id: 'caption',
    label: 'Caption',
    placeholder: 'Out now',
    maxChars: 40,
    defaultStyle: { ...BODY_STYLE, align: 'center' as const, letterSpacingPct: 12, weight: 600 as const },
  },
};

/**
 * Contact Sheet.
 *
 * Photographs assembling into a grid, each one dropping into place a beat
 * after the last. The layout for showing a range at once — a collection, a
 * menu, a portfolio — which the library could only do by fanning or stacking,
 * both of which hide most of what they are showing.
 *
 * The grid shape is chosen from the count rather than fixed, so four photos
 * make a square and six make two rows of three. A fixed column count leaves a
 * hole in the last row, and a hole reads as a mistake rather than as a layout.
 *
 * Cells are sized from the *safe* box, not the frame: a contact sheet that
 * bleeds off the edge is a crop, not a sheet.
 */
function build(inputs: SceneInputs, ctx: BuildContext): Layer[] {
  const { design, safe, durationMs } = ctx;
  const unit = Math.min(design.w, design.h);
  const layers: Layer[] = [backgroundLayer(inputs, ctx)];

  const count = Math.max(3, Math.min(inputs.photos.length || 4, 9));
  const photos = fillSlots(inputs.photos, count);

  const headline = textFor(SLOTS.headline, inputs, {
    baseSizePx: unit * 0.062,
    maxWidthPx: safe.w * 0.9,
    reveal: { kind: 'perWord', startMs: 200, durationMs: 420, staggerMs: 64 },
    lineHeight: 1.06,
  });
  const caption = textFor(SLOTS.caption, inputs, {
    baseSizePx: unit * 0.022,
    maxWidthPx: safe.w * 0.7,
    reveal: { kind: 'fade', startMs: 560, durationMs: 520 },
    fallbackFill: roleFill('accent'),
  });

  const headRun = ctx.measure(specFor(headline, fontString(headline.fontId, headline.fontSizePx, headline.weight)));
  const capRun = ctx.measure(specFor(caption, fontString(caption.fontId, caption.fontSizePx, caption.weight)));

  // Type at the top, grid beneath it. The band is measured rather than
  // guessed, so a headline that wraps to two lines pushes the grid down
  // instead of sitting on top of it.
  const typeH = headRun.height + capRun.height + unit * 0.02;
  const gridTop = safe.y + typeH + unit * 0.05;
  const gridH = Math.max(unit * 0.3, safe.y + safe.h - gridTop);

  /*
   * Columns from the count, so the last row is never short.
   *
   * 3 → 3×1, 4 → 2×2, 6 → 3×2, 9 → 3×3. Anything that does not divide gets
   * the squarest arrangement that fills, which is what the eye reads as
   * deliberate.
   */
  const cols = count <= 3 ? count : count === 4 ? 2 : count <= 6 ? 3 : 3;
  const rows = Math.ceil(count / cols);

  const gap = unit * 0.018;
  const cellW = (safe.w - gap * (cols - 1)) / cols;
  const cellH = (gridH - gap * (rows - 1)) / rows;

  const cells = ctx.grid(count, { cols, cellW, cellH, gapX: gap, gapY: gap, center: true });
  const centreX = safe.x + safe.w / 2;
  const centreY = gridTop + gridH / 2;

  ctx.repeat(photos, (photo, index) => {
    const cell = cells[index];
    if (!cell) return null;

    // `center: true` gives offsets about the origin, so the grid is placed by
    // moving its centre rather than by adding up cell widths here.
    const x = centreX + cell.x + cell.w / 2;
    const y = centreY + cell.y + cell.h / 2;

    // Cover the cell: the photo is sized to the larger edge so neither axis
    // shows background, and the frame ratio still crops it.
    const props = photoProps(photo, Math.max(cell.w, cell.h), {
      cornerRadius: inputs.look.cornerRadius,
      shadow: {
        blur: unit * 0.03,
        offsetX: 0,
        offsetY: unit * 0.008,
        paint: colorFill('rgba(0,0,0,0.4)'),
      },
    });

    // Row by row rather than strictly by index, so the sheet fills the way
    // someone reads it.
    const delay = 620 + ctx.stagger(index, count, 90, 'start');

    layers.push({
      id: ctx.id('cell'),
      type: 'image',
      startMs: 0,
      endMs: durationMs,
      tracks: {
        x: [kf(0, x)],
        y: [kf(delay, y + unit * 0.05), kf(delay + 620, y, 'outCubic')],
        scaleX: [kf(delay, 0.88), kf(delay + 620, 1, { kind: 'spring', stiffness: 220, damping: 20, mass: 1 })],
        scaleY: [kf(delay, 0.88), kf(delay + 620, 1, { kind: 'spring', stiffness: 220, damping: 20, mass: 1 })],
        opacity: [kf(delay, 0), kf(delay + 280, 1)],
      },
      props: { ...props, w: cell.w, h: cell.h },
    });
    return null;
  });

  layers.push({
    id: ctx.id('headline'),
    type: 'text',
    startMs: 0,
    endMs: durationMs,
    anchorX: 0.5,
    anchorY: 0,
    tracks: { x: [kf(0, centreX)], y: [kf(0, safe.y)] },
    props: headline,
  });

  layers.push({
    id: ctx.id('caption'),
    type: 'text',
    startMs: 0,
    endMs: durationMs,
    anchorX: 0.5,
    anchorY: 0,
    tracks: { x: [kf(0, centreX)], y: [kf(0, safe.y + headRun.height + unit * 0.02)] },
    props: caption,
  });

  return layers;
}

const template: SceneTemplate = {
  kind: 'scene',
  id: 'split-grid',
  name: 'Contact Sheet',
  category: 'Split Frame',
  mode: 'both',
  tier: 'free',
  isNew: true,
  designSize: { w: 1080, h: 1080 },
  supportedAspects: ['16:9', '4:3', '1:1', '4:5', '9:16'],
  defaultDurationMs: 8_000,
  minDurationMs: 4_000,
  maxDurationMs: 30_000,
  photoSlots: { min: 3, max: 9, default: 4 },
  textSlots: [SLOTS.headline, SLOTS.caption],
  supportsLogo: true,
  look: FULL_LOOK,
  build,
};

export default template;
