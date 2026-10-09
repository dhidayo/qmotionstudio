import { roleFill, type Keyframe, type Layer, type Rect, type Size } from '@/core/types';
import { fontString } from '@/fonts/registry';
import type { SceneInputs } from '@/document/types';
import type { BuildContext } from '../buildContext';

const kf = (t: number, v: number, ease: Keyframe['ease'] = 'outCubic'): Keyframe => ({ t, v, ease });

/**
 * Background layers, shared by every template.
 *
 * §8.4's background treatment is a user control, so it has to behave the same
 * everywhere. A template that rolled its own would mean "Blurred photo" doing
 * something different in each one.
 */

/**
 * The lowest a template's own content should reach.
 *
 * §12's watermark is drawn over everything, in the bottom-right corner, and
 * inside the safe area so that it survives a crop. Anything a template anchors
 * to the bottom of the safe box therefore lands on top of it — which four of
 * these templates did, and which reads as two pieces of text fighting rather
 * than as a mark on a picture.
 *
 * Reserved unconditionally even though only free exports carry the mark. A
 * composition that rearranges itself the moment somebody upgrades is a worse
 * problem than a band of spare pixels nobody notices.
 */
export function contentFloor(design: Size, safe: Rect): number {
  const unit = Math.min(design.w, design.h);
  // The mark occupies roughly [h - 0.071u, h - 0.045u]. Clearing it by a hair
  // is not enough: two pieces of small white text one line apart still read as
  // a collision, so the gap is about half the mark's own height again.
  return Math.min(safe.y + safe.h, design.h - unit * 0.125);
}

/** How much of the background colour covers a background picture until the person says otherwise. */
export const DEFAULT_BACKGROUND_DIM = 0.35;

/** §8.4's background treatment, as the bottom layer of a scene. */
export function backgroundLayer(inputs: SceneInputs, ctx: BuildContext): Layer {
  const { design, durationMs } = ctx;
  const base = {
    id: ctx.id('bg'),
    startMs: 0,
    endMs: durationMs,
    anchorX: 0,
    anchorY: 0,
    tracks: {},
  } as const;

  switch (inputs.look.background) {
    case 'solid':
      return {
        ...base,
        type: 'shape',
        props: { shape: 'rect', w: design.w, h: design.h, fill: roleFill('bg') },
      };

    case 'blurredPhoto': {
      // Falls back to a gradient when there is no photo to blur, rather than
      // leaving the frame empty.
      const first = inputs.photos[0];
      if (!first) return gradientBackground(base, design);
      return {
        ...base,
        type: 'image',
        anchorX: 0.5,
        anchorY: 0.5,
        tracks: {
          x: [kf(0, design.w / 2)],
          y: [kf(0, design.h / 2)],
          blur: [kf(0, Math.min(design.w, design.h) * 0.08)],
          opacity: [kf(0, 0.7)],
        },
        props: {
          mediaId: first.mediaId,
          // Oversized so the blur does not reveal the photo's own edges.
          w: design.w * 1.2,
          h: design.h * 1.2,
          fit: 'cover',
        },
      };
    }

    case 'picture': {
      // A photograph of the person's own, filling the frame and drifting
      // slowly closer, with the background colour laid over it so the words
      // on top stay readable (D-120). Gradient until one is chosen.
      const mediaId = inputs.look.backgroundMediaId;
      if (mediaId === undefined) return gradientBackground(base, design);
      const dim = Math.min(1, Math.max(0, inputs.look.backgroundDim ?? DEFAULT_BACKGROUND_DIM));
      return {
        ...base,
        type: 'group',
        anchorX: 0.5,
        anchorY: 0.5,
        props: {},
        children: [
          {
            ...base,
            id: ctx.id('bgPicture'),
            type: 'image',
            anchorX: 0.5,
            anchorY: 0.5,
            tracks: {
              x: [kf(0, design.w / 2)],
              y: [kf(0, design.h / 2)],
              scaleX: [kf(0, 1, 'linear'), kf(durationMs, 1.06, 'linear')],
              scaleY: [kf(0, 1, 'linear'), kf(durationMs, 1.06, 'linear')],
            },
            props: { mediaId, w: design.w, h: design.h, fit: 'cover' },
          },
          {
            ...base,
            id: ctx.id('bgDim'),
            type: 'shape',
            tracks: { opacity: [kf(0, dim)] },
            props: { shape: 'rect', w: design.w, h: design.h, fill: roleFill('bg') },
          },
        ],
      };
    }

    case 'pattern':
      return {
        ...base,
        type: 'gradient',
        props: {
          w: design.w,
          h: design.h,
          gradient: 'radial',
          stops: [
            { at: 0, paint: roleFill('surface') },
            { at: 0.5, paint: roleFill('bg') },
            { at: 0.52, paint: roleFill('surface', 0.5) },
            { at: 1, paint: roleFill('bg') },
          ],
        },
      };

    case 'gradient':
    default:
      return gradientBackground(base, design);
  }
}

type BaseLayer = {
  readonly id: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly tracks: Record<string, never>;
};

function gradientBackground(base: BaseLayer, design: Size): Layer {
  return {
    ...base,
    type: 'gradient',
    props: {
      w: design.w,
      h: design.h,
      gradient: 'linear',
      angle: 112,
      stops: [
        { at: 0, paint: roleFill('surface') },
        { at: 1, paint: roleFill('bg') },
      ],
    },
  };
}

/*
 * §8.3's logo used to be built here, as the topmost layer of every template.
 * The renderer draws it now (src/core/render/logo.ts, D-101), so it can move
 * with a drag without rebuilding the template underneath it.
 */

/** Convenience: the ctx.font string a text layer's props imply. */
export function fontFor(fontId: string, sizePx: number, weight: number): string {
  return fontString(fontId, sizePx, weight);
}
