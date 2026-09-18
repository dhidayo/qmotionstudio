import type { Layer } from '@/core/types';
import { createProps, resolveProps, type MutableProps } from '@/core/anim/interpolate';
import { ellipsePath, roundedRectPath } from '@/core/math/geometry';
import { withBlur } from './blur';
import { drawShape } from './layers/shape';
import { drawGradient } from './layers/gradient';
import { drawImage } from './layers/image';
import { drawText } from './layers/text';
import { drawVideo } from './layers/video';
import { atDepth, type DrawContext } from './drawContext';

/**
 * Draws one layer and its children.
 *
 * Order of operations, which is the part that has to stay fixed:
 *   1. time window — a layer outside its own [startMs, endMs) draws nothing;
 *   2. resolve animated props at the layer's local time;
 *   3. transform: translate to (x, y), then rotate and scale about the anchor;
 *   4. opacity multiplies into whatever the parent already applied;
 *   5. blur, if any, runs the whole layer through an offscreen pass;
 *   6. the type-specific paint.
 *
 * Every layer box is positioned so that (0,0) after the transform is the
 * layer's anchor point, which defaults to its centre. That is what makes
 * rotation and scale behave the way a template author expects without each
 * template doing its own origin arithmetic.
 */

/** Scratch prop objects, one per nesting depth, so no allocation happens per layer per frame. */
const scratchByDepth: MutableProps[] = [];

function scratch(depth: number): MutableProps {
  let entry = scratchByDepth[depth];
  if (!entry) {
    entry = createProps();
    scratchByDepth[depth] = entry;
  }
  return entry;
}

export function drawLayer(dc: DrawContext, layer: Layer, sceneTimeMs: number): void {
  if (sceneTimeMs < layer.startMs || sceneTimeMs >= layer.endMs) return;

  const localMs = sceneTimeMs - layer.startMs;
  const props = resolveProps(layer.tracks, localMs, scratch(dc.depth));

  // Fully transparent layers still cost a transform and a paint, and on a
  // staggered eight-photo template most layers are transparent most of the time.
  if (props.opacity <= 0.001) return;

  const { ctx } = dc;
  ctx.save();

  if (layer.blendMode) ctx.globalCompositeOperation = layer.blendMode;
  ctx.globalAlpha *= props.opacity;

  ctx.translate(props.x, props.y);
  if (props.rotation !== 0) ctx.rotate((props.rotation * Math.PI) / 180);
  if (props.scaleX !== 1 || props.scaleY !== 1) ctx.scale(props.scaleX, props.scaleY);

  const box = boxOf(layer);
  const anchorX = layer.anchorX ?? 0.5;
  const anchorY = layer.anchorY ?? 0.5;
  const originX = -box.w * anchorX;
  const originY = -box.h * anchorY;

  const paint = (): void => {
    paintLayer(dc, layer, originX, originY, localMs, props);
  };

  if (props.blur > 0.001) {
    withBlur(ctx, props.blur, { x: originX, y: originY, w: box.w, h: box.h }, dc.depth, (target) => {
      paintLayer({ ...dc, ctx: target }, layer, originX, originY, localMs, props);
    });
  } else {
    paint();
  }

  ctx.restore();
}

function paintLayer(
  dc: DrawContext,
  layer: Layer,
  x: number,
  y: number,
  localMs: number,
  props: MutableProps,
): void {
  switch (layer.type) {
    case 'shape':
      drawShape(dc, layer.props, x, y);
      return;

    case 'gradient':
      drawGradient(dc, layer.props, x, y);
      return;

    case 'image':
      drawImage(dc, layer.props, x, y);
      return;

    case 'video':
      drawVideo(dc, layer.props, x, y, localMs);
      return;

    case 'text':
      // letterSpacing is an animated prop (§6.1), so a tracked value is added
      // on top of the layer's static percentage.
      drawText(dc, layer.props, x, y, localMs, props.letterSpacing);
      return;

    case 'group': {
      const child = atDepth(dc, dc.depth + 1);
      for (const c of layer.children) drawLayer(child, c, localMs);
      return;
    }

    case 'mask': {
      const { ctx } = dc;
      ctx.save();
      if (layer.props.shape === 'ellipse') ellipsePath(ctx, x, y, layer.props.w, layer.props.h);
      else roundedRectPath(ctx, x, y, layer.props.w, layer.props.h, layer.props.cornerRadius ?? 0);
      ctx.clip();
      const child = atDepth(dc, dc.depth + 1);
      for (const c of layer.children) drawLayer(child, c, localMs);
      ctx.restore();
      return;
    }
  }
}

/**
 * A layer's own box, used for anchoring. Groups have no intrinsic size — their
 * children are positioned in the group's own space — so they anchor at the
 * origin rather than at the centre of a box they do not have.
 */
function boxOf(layer: Layer): { w: number; h: number } {
  switch (layer.type) {
    case 'group':
      return { w: 0, h: 0 };
    case 'text':
      // Text measures itself at paint time; anchoring uses the declared wrap
      // width when there is one, so a centred heading does not shift as its
      // content changes length.
      return { w: layer.props.maxWidthPx ?? 0, h: 0 };
    default:
      return { w: layer.props.w, h: layer.props.h };
  }
}

/** Children of a group are drawn with time relative to the group, not the scene. */
export function drawLayers(dc: DrawContext, layers: readonly Layer[], sceneTimeMs: number): void {
  for (const layer of layers) drawLayer(dc, layer, sceneTimeMs);
}

export function releaseLayerScratch(): void {
  scratchByDepth.length = 0;
}
