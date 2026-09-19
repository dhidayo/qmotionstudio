import { colorFill, roleFill, type Keyframe, type Layer } from '@/core/types';
import { fontString } from '@/fonts/registry';
import type { SceneInputs } from '@/document/types';
import type { BuildContext } from '../buildContext';
import type { SceneTemplate } from '../schema';
import { FULL_LOOK, HEADLINE_STYLE, BODY_STYLE } from '../_shared/look';
import { fillSlots, photoProps } from '../_shared/photo';
import { specFor, textFor } from '../_shared/text';

const kf = (t: number, v: number, ease: Keyframe['ease'] = 'outCubic'): Keyframe => ({ t, v, ease });

const SLOTS = {
  headline: {
    id: 'headline',
    label: 'Headline',
    placeholder: 'Somewhere worth going',
    maxChars: 48,
    defaultStyle: { ...HEADLINE_STYLE, align: 'left' as const },
  },
  caption: {
    id: 'caption',
    label: 'Caption',
    placeholder: 'A short line underneath',
    maxChars: 90,
    defaultStyle: { ...BODY_STYLE, align: 'left' as const },
  },
};

/**
 * Parallax Depth.
 *
 * Photos sit on receding planes. The furthest is smallest, dimmest and drifts
 * slowest; the nearest is largest and drifts most. The whole stack eases
 * forward across the scene, so the depth reads as depth rather than as a
 * collage — parallax is the only cue a flat canvas has for distance.
 *
 * Drawn back to front through ctx.depthSort, because the renderer has no
 * z-buffer and draw order *is* depth.
 */
function build(inputs: SceneInputs, ctx: BuildContext): Layer[] {
  const { design, safe, durationMs } = ctx;
  const unit = Math.min(design.w, design.h);
  const layers: Layer[] = [];

  const count = Math.max(2, Math.min(inputs.photos.length || 3, 6));
  const photos = fillSlots(inputs.photos, count);

  // Type occupies the lower band; the planes get everything above it.
  const headline = textFor(SLOTS.headline, inputs, {
    baseSizePx: unit * 0.078,
    maxWidthPx: safe.w * 0.9,
    reveal: { kind: 'perWord', startMs: 420, durationMs: 460, staggerMs: 70 },
    lineHeight: 1.06,
  });
  const caption = textFor(SLOTS.caption, inputs, {
    baseSizePx: unit * 0.028,
    maxWidthPx: safe.w * 0.78,
    reveal: { kind: 'fade', startMs: 900, durationMs: 600 },
    fallbackFill: roleFill('inkMuted'),
    lineHeight: 1.45,
  });

  const headRun = ctx.measure(specFor(headline, fontString(headline.fontId, headline.fontSizePx, headline.weight)));
  const capRun = ctx.measure(specFor(caption, fontString(caption.fontId, caption.fontSizePx, caption.weight)));

  const typeBlockH = headRun.height + capRun.height + unit * 0.03;
  const typeTop = safe.y + safe.h - typeBlockH;

  // The planes get everything above the type. Sizing and spread both come from
  // that band rather than from `unit`, so a landscape frame does not end up
  // with a small cluster floating in the middle of it.
  const stageTop = safe.y;
  const stageBottom = typeTop - unit * 0.05;
  const stageH = Math.max(unit * 0.28, stageBottom - stageTop);
  const stageCentreY = (stageTop + stageBottom) / 2;

  const nearestSize = Math.min(unit * 0.78, stageH * 0.74, safe.w * 0.7);
  const spreadX = Math.min(safe.w * 0.38, unit * 0.4);
  const spreadY = stageH * 0.2;

  // ── Background ────────────────────────────────────────────────────────────
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
      gradient: 'linear',
      angle: 100,
      stops: [
        { at: 0, paint: roleFill('surface') },
        { at: 0.75, paint: roleFill('bg') },
        { at: 1, paint: roleFill('bg') },
      ],
    },
  });

  // ── Receding planes ───────────────────────────────────────────────────────
  // depth 0 is nearest. Everything about a plane derives from it, so adding a
  // photo does not require touching any of the others.
  const planes = ctx.repeat(photos, (photo, i, n) => {
    const depth = n === 1 ? 0 : i / (n - 1);
    const scale = 1 - depth * 0.4;

    return {
      photo,
      depth,
      i,
      baseSize: nearestSize * scale,
      // Fan up and to the right as they recede, anchored so the *group* is
      // centred rather than the nearest plane. Without the -0.42 bias the
      // stack drifts to one side as photos are added.
      x: design.w * 0.5 + (depth - 0.42) * spreadX,
      y: stageCentreY - (depth - 0.42) * spreadY,
      drift: (1 - depth * 0.7) * unit * 0.05,
    };
  });

  const ordered = ctx.depthSort(planes, (p) => -p.depth);

  for (const plane of ordered) {
    const delay = ctx.stagger(plane.i, planes.length, 90, 'end');
    const props = photoProps(plane.photo, plane.baseSize, {
      cornerRadius: inputs.look.cornerRadius * (1 - plane.depth * 0.3),
      shadow: {
        blur: unit * 0.07 * (1 - plane.depth * 0.4),
        offsetX: -unit * 0.012 * (1 - plane.depth),
        offsetY: unit * 0.022,
        paint: colorFill('rgba(0,0,0,0.62)'),
      },
    });

    layers.push({
      id: ctx.id('plane'),
      type: 'image',
      startMs: 0,
      endMs: durationMs,
      tracks: {
        // Continuous drift across the whole scene, faster at the front. This
        // is the parallax; without it the planes are just stacked rectangles.
        x: [
          kf(0, plane.x - plane.drift, 'inOutSine'),
          kf(durationMs, plane.x + plane.drift, 'inOutSine'),
        ],
        y: [kf(delay, plane.y + unit * 0.07), kf(delay + 820, plane.y, 'outCubic')],
        scaleX: [kf(delay, 0.9), kf(delay + 820, 1, 'outBack')],
        scaleY: [kf(delay, 0.9), kf(delay + 820, 1, 'outBack')],
        opacity: [kf(delay, 0), kf(delay + 340, 1 - plane.depth * 0.25)],
        // Depth of field: the far planes sit slightly out of focus.
        blur: [kf(0, plane.depth * unit * 0.014)],
      },
      props,
    });
  }

  // ── Type ──────────────────────────────────────────────────────────────────
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
    tracks: {
      x: [kf(0, safe.x)],
      y: [kf(0, typeTop + headRun.height + unit * 0.03)],
    },
    props: caption,
  });

  return layers;
}

const template: SceneTemplate = {
  kind: 'scene',
  id: 'depth-parallax',
  name: 'Parallax Depth',
  category: 'Depth Stage',
  mode: 'both',
  tier: 'free',
  designSize: { w: 1080, h: 1080 },
  supportedAspects: ['16:9', '4:3', '1:1', '4:5', '9:16'],
  defaultDurationMs: 10_000,
  minDurationMs: 4_000,
  maxDurationMs: 30_000,
  photoSlots: { min: 2, max: 6, default: 3 },
  textSlots: [SLOTS.headline, SLOTS.caption],
  supportsLogo: true,
  look: FULL_LOOK,
  build,
};

export default template;
