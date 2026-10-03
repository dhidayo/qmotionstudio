import { colorFill, roleFill, type Keyframe, type Layer } from '@/core/types';
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
  headline: {
    id: 'headline',
    label: 'Headline',
    placeholder: 'Look closer',
    maxChars: 38,
    defaultStyle: { ...HEADLINE_STYLE, align: 'left' as const },
  },
  caption: {
    id: 'caption',
    label: 'Caption',
    placeholder: 'Three details worth the second look',
    maxChars: 64,
    defaultStyle: { ...BODY_STYLE, align: 'left' as const },
  },
};

/**
 * Pull Focus.
 *
 * Photographs held at fixed depths while the focus racks through them, front to
 * back. Borrowed from a camera rather than from a slideshow: attention is moved
 * by changing what is sharp, and the photograph being left behind stays in the
 * frame, washed out, as the thing you were just looking at.
 *
 * This is the one template in the library where draw order is trivially correct
 * and never needs a slot indirection — nothing overtakes anything, because the
 * depths are fixed for the whole scene and only sharpness moves. That is what
 * buys the budget for animated blur on every layer at once.
 *
 * Photographs *nearer* than the focus wash out harder than those behind it. That
 * asymmetry is the whole illusion: out-of-focus glass in front of a subject
 * bleeds light across it, and treating near and far the same makes the stack
 * read as a flat set of dimmed cards.
 *
 * Capped at four photographs, and this is a render-cost decision rather than a
 * design one: every photograph is alive for the whole scene and all but one is
 * blurred, so each costs an offscreen pass per frame (§14).
 */
function build(inputs: SceneInputs, ctx: BuildContext): Layer[] {
  const { design, safe, durationMs } = ctx;
  const unit = Math.min(design.w, design.h);
  const layers: Layer[] = [backgroundLayer(inputs, ctx)];

  const count = Math.max(2, Math.min(inputs.photos.length || 3, 4));
  const photos = fillSlots(inputs.photos, count);
  const turnMs = durationMs / count;
  const pullMs = Math.min(760, turnMs * 0.42);

  const headline = textFor(SLOTS.headline, inputs, {
    baseSizePx: unit * 0.066,
    maxWidthPx: safe.w * 0.62,
    reveal: { kind: 'perWord', startMs: 300, durationMs: 480, staggerMs: 78 },
    lineHeight: 1.06,
  });
  const caption = textFor(SLOTS.caption, inputs, {
    baseSizePx: unit * 0.023,
    maxWidthPx: safe.w * 0.55,
    reveal: { kind: 'fade', startMs: 1_000, durationMs: 640 },
    fallbackFill: roleFill('inkMuted'),
  });

  const headRun = ctx.measure(specFor(headline, fontString(headline.fontId, headline.fontSizePx, headline.weight)));
  const capRun = ctx.measure(specFor(caption, fontString(caption.fontId, caption.fontSizePx, caption.weight)));
  const typeH = headRun.height + capRun.height + unit * 0.025;

  // The stack sits above the type block, receding up and to the left.
  const stageH = Math.max(unit * 0.3, safe.h - typeH - unit * 0.05);
  const stepX = unit * 0.07;
  const stepY = unit * 0.05;
  const baseSize = Math.max(
    unit * 0.2,
    Math.min(safe.w - (count - 1) * stepX, stageH - (count - 1) * stepY) * 0.84,
  );

  const middle = (count - 1) / 2;
  const cx = safe.x + safe.w / 2;
  const cy = safe.y + stageH / 2;

  const BLUR_STEP = unit * 0.009;

  /** How a photograph looks when the focus is `focus` steps away from it. */
  const lookAt = (index: number, focus: number): { blur: number; opacity: number; scale: number } => {
    const away = index - focus;
    if (away === 0) return { blur: 0, opacity: 1, scale: 1.04 };
    if (away < 0) {
      // In front of the subject: bleeds out rather than merely dimming.
      const steps = -away;
      return { blur: BLUR_STEP * steps * 1.35, opacity: Math.max(0.1, 0.34 - steps * 0.08), scale: 1 };
    }
    return { blur: BLUR_STEP * away, opacity: Math.max(0.18, 0.56 - away * 0.12), scale: 1 };
  };

  // Furthest first: depth is draw order, and here it is settled at build time.
  for (let index = count - 1; index >= 0; index--) {
    const photo = photos[index];
    if (!photo) continue;

    const x = cx + (middle - index) * stepX;
    const y = cy - (middle - index) * stepY;

    const blurTrack: Keyframe[] = [];
    const opacityTrack: Keyframe[] = [];
    const scaleTrack: Keyframe[] = [];

    for (let focus = 0; focus < count; focus++) {
      const look = lookAt(index, focus);
      // The first rack is already settled at t = 0, so the scene opens on its
      // subject rather than easing into it from nothing.
      const settleAt = focus === 0 ? 0 : focus * turnMs + pullMs;
      const holdUntil = (focus + 1) * turnMs;

      blurTrack.push(kf(settleAt, look.blur, 'inOutSine'));
      opacityTrack.push(kf(settleAt, look.opacity, 'inOutSine'));
      scaleTrack.push(kf(settleAt, look.scale, 'inOutSine'));

      if (holdUntil > settleAt) {
        blurTrack.push(kf(holdUntil, look.blur, 'linear'));
        opacityTrack.push(kf(holdUntil, look.opacity, 'linear'));
        scaleTrack.push(kf(holdUntil, look.scale, 'linear'));
      }
    }

    const props = photoProps(photo, baseSize, {
      cornerRadius: inputs.look.cornerRadius,
      shadow: { blur: unit * 0.07, offsetX: unit * 0.01, offsetY: unit * 0.02, paint: colorFill('rgba(0,0,0,0.6)') },
    });

    layers.push({
      id: ctx.id('plane'),
      type: 'image',
      startMs: 0,
      endMs: durationMs,
      tracks: {
        // A slow drift across the whole scene, different per depth, so the
        // stack is never a still even between racks.
        x: [kf(0, x, 'inOutSine'), kf(durationMs, x + (index % 2 === 0 ? 1 : -1) * unit * 0.016, 'inOutSine')],
        y: [kf(0, y)],
        scaleX: scaleTrack,
        scaleY: scaleTrack,
        rotation: [kf(0, (middle - index) * 1.6)],
        blur: blurTrack,
        opacity: opacityTrack,
      },
      props,
    });
  }

  const typeTop = contentFloor(design, safe) - typeH;

  layers.push({
    id: ctx.id('type-scrim'),
    type: 'gradient',
    startMs: 0,
    endMs: durationMs,
    tracks: { x: [kf(0, design.w / 2)], y: [kf(0, design.h - (design.h - typeTop) / 2)] },
    props: {
      w: design.w,
      h: (design.h - typeTop) + unit * 0.06,
      gradient: 'linear',
      angle: 270,
      stops: [
        { at: 0, paint: colorFill('rgba(0,0,0,0.8)') },
        { at: 1, paint: colorFill('rgba(0,0,0,0)') },
      ],
    },
  });

  layers.push({
    id: ctx.id('headline'),
    type: 'text',
    startMs: 0,
    endMs: durationMs,
    anchorX: 0,
    anchorY: 0,
    tracks: { x: [kf(0, safe.x)], y: [kf(0, typeTop)] },
    props: headline,
  });

  layers.push({
    id: ctx.id('caption'),
    type: 'text',
    startMs: 0,
    endMs: durationMs,
    anchorX: 0,
    anchorY: 0,
    tracks: { x: [kf(0, safe.x)], y: [kf(0, typeTop + headRun.height + unit * 0.025)] },
    props: caption,
  });

  return layers;
}

const template: SceneTemplate = {
  kind: 'scene',
  id: 'depth-focus',
  name: 'Pull Focus',
  category: 'Depth Stage',
  mode: 'both',
  tier: 'pro',
  isNew: true,
  designSize: { w: 1080, h: 1080 },
  supportedAspects: ['16:9', '4:3', '1:1', '4:5', '9:16'],
  defaultDurationMs: 9_000,
  minDurationMs: 4_000,
  maxDurationMs: 30_000,
  photoSlots: { min: 2, max: 4, default: 3 },
  textSlots: [SLOTS.headline, SLOTS.caption],
  supportsLogo: true,
  look: FULL_LOOK,
  build,
};

export default template;
