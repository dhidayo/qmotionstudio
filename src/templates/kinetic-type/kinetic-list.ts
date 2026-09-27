import { roleFill, type Keyframe, type Layer, type TextProps } from '@/core/types';
import { fontString } from '@/fonts/registry';
import type { SceneInputs } from '@/document/types';
import type { BuildContext } from '../buildContext';
import type { SceneTemplate } from '../schema';
import { FULL_LOOK, BODY_STYLE, HEADLINE_STYLE } from '../_shared/look';
import { fillSlots, photoProps } from '../_shared/photo';
import { specFor, textFor } from '../_shared/text';
import type { TextSlotDef } from '../schema';
import { backgroundLayer, contentFloor, logoLayers } from '../_shared/chrome';

const kf = (t: number, v: number, ease: Keyframe['ease'] = 'outCubic'): Keyframe => ({ t, v, ease });

const ITEM_STYLE = { ...BODY_STYLE, align: 'left' as const, weight: 600 as const, letterSpacingPct: 0 };

const SLOTS = {
  title: {
    id: 'title',
    label: 'Title',
    placeholder: "What's included",
    maxChars: 34,
    defaultStyle: { ...HEADLINE_STYLE, align: 'left' as const },
  },
  item1: { id: 'item1', label: 'Item 1', placeholder: 'Same-day delivery', maxChars: 42, defaultStyle: ITEM_STYLE },
  item2: { id: 'item2', label: 'Item 2', placeholder: 'Free returns for 30 days', maxChars: 42, defaultStyle: ITEM_STYLE },
  item3: { id: 'item3', label: 'Item 3', placeholder: 'Made to order, not to stock', maxChars: 42, defaultStyle: ITEM_STYLE },
  item4: { id: 'item4', label: 'Item 4', placeholder: '', maxChars: 42, defaultStyle: ITEM_STYLE },
};

const ITEM_SLOTS: readonly TextSlotDef[] = [SLOTS.item1, SLOTS.item2, SLOTS.item3, SLOTS.item4];

/**
 * List Drop.
 *
 * A heading and up to four short lines, each arriving with its own mark, beside a
 * photograph. Menus, what's included, three steps, opening hours — the most
 * ordinary thing anyone wants to post and the one shape the library could not
 * make at all. Statement holds one sentence; a list set as a sentence is not a
 * list.
 *
 * An empty line is *removed*, not skipped. Four slots with the fourth left blank
 * has to read as a list of three, and a template that reserved the space would
 * leave a hole that looks like a bug in the export. That is why the items are
 * measured before anything is placed.
 *
 * The photograph sits in a masked panel rather than being cropped by its own
 * position, because it has the list beside it rather than another photograph — an
 * oversized photo bleeding into a column of type is not a composition. The panel
 * opens with `clipProgress`, which moves the window and not the photograph, so
 * dragging the photograph inside still goes exactly where it is put.
 *
 * The split follows the frame, like Split Pair: side by side when there is width,
 * stacked when there is not.
 */
function build(inputs: SceneInputs, ctx: BuildContext): Layer[] {
  const { design, safe, durationMs } = ctx;
  const unit = Math.min(design.w, design.h);
  const layers: Layer[] = [backgroundLayer(inputs, ctx)];

  const sideBySide = design.w >= design.h;

  const panel = sideBySide
    ? { x: 0, y: 0, w: design.w * 0.46, h: design.h }
    : { x: 0, y: 0, w: design.w, h: design.h * 0.42 };

  const floor = contentFloor(design, safe);
  const listBox = sideBySide
    ? { x: panel.w + unit * 0.06, y: safe.y, w: design.w - panel.w - unit * 0.06 - (design.w - safe.x - safe.w), h: floor - safe.y }
    : { x: safe.x, y: panel.h + unit * 0.05, w: safe.w, h: floor - panel.h - unit * 0.05 };

  const [photo] = fillSlots(inputs.photos, 1);
  if (photo) {
    const props = photoProps(photo, Math.max(panel.w, panel.h) * 1.1);
    layers.push({
      id: ctx.id('panel'),
      type: 'mask',
      startMs: 0,
      endMs: durationMs,
      tracks: {
        x: [kf(0, panel.x + panel.w / 2)],
        y: [kf(0, panel.y + panel.h / 2)],
        clipProgress: [kf(0, 0), kf(820, 1, 'outExpo')],
      },
      props: {
        shape: 'rect',
        w: panel.w,
        h: panel.h,
        cornerRadius: inputs.look.cornerRadius,
        clipFrom: sideBySide ? 'left' : 'up',
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
            scaleX: [kf(0, 1, 'inOutSine'), kf(durationMs, 1.1, 'inOutSine')],
            scaleY: [kf(0, 1, 'inOutSine'), kf(durationMs, 1.1, 'inOutSine')],
          },
          props,
        },
      ],
    });
  }

  const title = textFor(SLOTS.title, inputs, {
    baseSizePx: unit * 0.058,
    maxWidthPx: listBox.w,
    reveal: { kind: 'maskWipe', dir: 'right', startMs: 300, durationMs: 660 },
    lineHeight: 1.08,
  });
  const titleRun = ctx.measure(specFor(title, fontString(title.fontId, title.fontSizePx, title.weight)));

  const markSize = unit * 0.016;
  const markGap = unit * 0.022;
  const itemWidth = Math.max(unit * 0.2, listBox.w - markSize - markGap);

  // Measured before anything is placed, so a blank slot costs no space.
  const items: { props: TextProps; height: number }[] = [];
  for (const [index, slot] of ITEM_SLOTS.entries()) {
    const props = textFor(slot, inputs, {
      baseSizePx: unit * 0.032,
      maxWidthPx: itemWidth,
      reveal: { kind: 'fade', startMs: 1_000 + index * 320, durationMs: 420 },
      lineHeight: 1.24,
    });
    if (props.text.trim().length === 0) continue;
    const run = ctx.measure(specFor(props, fontString(props.fontId, props.fontSizePx, props.weight)));
    items.push({ props, height: run.height });
  }

  const rowGap = unit * 0.028;

  /*
   * Centred in the column rather than hung from its top.
   *
   * The slots are sized for four lines and most lists are shorter, so anchoring
   * at the top leaves the bottom third of the frame empty and the whole thing
   * reads as though something failed to load. Measured first, then placed.
   */
  const itemsH = items.reduce((total, item) => total + item.height, 0)
    + rowGap * Math.max(0, items.length - 1);
  const columnH = titleRun.height + unit * 0.045 + itemsH;
  const columnTop = listBox.y + Math.max(0, (listBox.h - columnH) / 2);
  const listTop = columnTop + titleRun.height + unit * 0.045;

  let cursor = listTop;
  items.forEach((item, index) => {
    const at = 1_000 + index * 320;
    const rowTop = cursor;
    // The mark is centred on the first line, not on the whole row, so a line
    // that wraps to two does not leave its mark floating in the middle.
    const markY = rowTop + item.props.fontSizePx * item.props.lineHeight * 0.5;

    layers.push({
      id: ctx.id('mark'),
      type: 'shape',
      startMs: 0,
      endMs: durationMs,
      tracks: {
        x: [kf(0, listBox.x + markSize / 2)],
        y: [kf(0, markY)],
        scaleX: [kf(at, 0), kf(at + 460, 1, { kind: 'spring', stiffness: 200, damping: 15, mass: 1 })],
        scaleY: [kf(at, 0), kf(at + 460, 1, { kind: 'spring', stiffness: 200, damping: 15, mass: 1 })],
        opacity: [kf(at, 0), kf(at + 120, 1)],
      },
      props: { shape: 'ellipse', w: markSize, h: markSize, fill: roleFill('accent') },
    });

    layers.push({
      id: ctx.id('item'),
      type: 'text',
      startMs: 0,
      endMs: durationMs,
      anchorX: 0,
      anchorY: 0,
      tracks: {
        // A short slide in behind the fade, so each line arrives rather than
        // materialising.
        x: [kf(at, listBox.x + markSize + markGap - unit * 0.02), kf(at + 480, listBox.x + markSize + markGap, 'outExpo')],
        y: [kf(0, rowTop)],
      },
      props: item.props,
    });

    cursor = rowTop + item.height + rowGap;
  });

  layers.push({
    id: ctx.id('title'),
    type: 'text',
    startMs: 0,
    endMs: durationMs,
    anchorX: 0,
    anchorY: 0,
    tracks: { x: [kf(0, listBox.x)], y: [kf(0, columnTop)] },
    props: title,
  });

  // A hairline under the title, tying the heading to the column it heads.
  layers.push({
    id: ctx.id('underline'),
    type: 'shape',
    startMs: 0,
    endMs: durationMs,
    anchorX: 0,
    anchorY: 0.5,
    tracks: {
      x: [kf(0, listBox.x)],
      y: [kf(0, columnTop + titleRun.height + unit * 0.02)],
      scaleX: [kf(700, 0), kf(1_300, 1, 'outExpo')],
      opacity: [kf(660, 0), kf(780, 1)],
    },
    props: {
      shape: 'rect',
      w: listBox.w,
      h: Math.max(1, unit * 0.0022),
      fill: roleFill('ink', 0.25),
    },
  });

  layers.push(...logoLayers(inputs, ctx));

  return layers;
}

const template: SceneTemplate = {
  kind: 'scene',
  id: 'kinetic-list',
  name: 'List Drop',
  category: 'Kinetic Type',
  mode: 'both',
  tier: 'free',
  isNew: true,
  designSize: { w: 1080, h: 1080 },
  supportedAspects: ['16:9', '4:3', '1:1', '4:5', '9:16'],
  defaultDurationMs: 8_000,
  minDurationMs: 4_000,
  maxDurationMs: 30_000,
  photoSlots: { min: 1, max: 1, default: 1 },
  textSlots: [SLOTS.title, SLOTS.item1, SLOTS.item2, SLOTS.item3, SLOTS.item4],
  supportsLogo: true,
  look: FULL_LOOK,
  build,
};

export default template;
