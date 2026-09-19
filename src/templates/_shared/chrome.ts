import { colorFill, roleFill, type Keyframe, type Layer, type Size } from '@/core/types';
import { fontString } from '@/fonts/registry';
import type { SceneInputs } from '@/document/types';
import type { BuildContext } from '../buildContext';

const kf = (t: number, v: number, ease: Keyframe['ease'] = 'outCubic'): Keyframe => ({ t, v, ease });

/**
 * Background and logo layers, shared by every template.
 *
 * §8.4's background treatment and §8.3's logo are user controls, so they have
 * to behave the same everywhere. A template that rolled its own would mean
 * "Blurred photo" doing something different in each one.
 */

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

/**
 * §8.3's logo, as the topmost layer of a scene.
 *
 * Returns nothing when there is no logo, so templates can spread the result
 * without branching.
 */
export function logoLayers(inputs: SceneInputs, ctx: BuildContext): Layer[] {
  const { logo } = inputs;
  if (logo.mediaId === null) return [];

  const { design, safe, durationMs } = ctx;
  const unit = Math.min(design.w, design.h);
  const size = unit * (logo.sizePct / 100);

  const [x, y] = placementOf(logo.placement, safe, size, logo.x, logo.y);

  const layers: Layer[] = [
    {
      id: ctx.id('logo'),
      type: 'image',
      startMs: 0,
      endMs: durationMs,
      tracks: {
        x: [kf(0, x)],
        y: [kf(0, y)],
        opacity: [kf(0, 0), kf(700, logo.opacity)],
      },
      props: { mediaId: logo.mediaId, w: size, h: size, fit: 'contain' },
    },
  ];

  if (logo.lockup && logo.lockupText.trim().length > 0) {
    const fontSizePx = size * 0.3;
    layers.push({
      id: ctx.id('lockup'),
      type: 'text',
      startMs: 0,
      endMs: durationMs,
      anchorX: 0.5,
      anchorY: 0,
      tracks: {
        x: [kf(0, x)],
        y: [kf(0, y + size * 0.56)],
        opacity: [kf(0, 0), kf(900, logo.opacity)],
      },
      props: {
        text: logo.lockupText,
        fontId: 'body',
        fontSizePx,
        weight: 600,
        letterSpacingPct: 8,
        lineHeight: 1.2,
        align: 'center',
        fill: roleFill('ink'),
        maxWidthPx: null,
        reveal: { kind: 'none' },
        shadow: { blur: fontSizePx * 0.6, offsetX: 0, offsetY: 0, paint: colorFill('rgba(0,0,0,0.5)') },
      },
    });
  }

  return layers;
}

function placementOf(
  placement: SceneInputs['logo']['placement'],
  safe: BuildContext['safe'],
  size: number,
  freeX: number,
  freeY: number,
): [number, number] {
  const half = size / 2;
  switch (placement) {
    case 'topLeft': return [safe.x + half, safe.y + half];
    case 'topRight': return [safe.x + safe.w - half, safe.y + half];
    case 'bottomLeft': return [safe.x + half, safe.y + safe.h - half];
    case 'bottomRight': return [safe.x + safe.w - half, safe.y + safe.h - half];
    case 'center': return [safe.x + safe.w / 2, safe.y + safe.h / 2];
    case 'free': return [safe.x + safe.w * freeX, safe.y + safe.h * freeY];
  }
}

/** Convenience: the ctx.font string a text layer's props imply. */
export function fontFor(fontId: string, sizePx: number, weight: number): string {
  return fontString(fontId, sizePx, weight);
}
