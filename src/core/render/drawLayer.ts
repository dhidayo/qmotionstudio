import type { Layer } from '@/core/types';
import { createProps, resolveProps, sampleTrack, type MutableProps } from '@/core/anim/interpolate';
import { ellipsePath, roundedRectPath } from '@/core/math/geometry';
import { activeElementFx, applyElementMotion, type ActiveElementFx } from '@/core/effects/run';
import type { ElementBox } from '@/core/effects/types';
import { withBlur } from './blur';
import { withIsolation, type Glow } from './isolate';
import { drawShape } from './layers/shape';
import { drawGradient } from './layers/gradient';
import { drawImage } from './layers/image';
import { drawText, textBlock } from './layers/text';
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

  /*
   * Element effects (D-100) add to the layer's own motion before anything is
   * drawn, so a spin-in turns the layer exactly as a rotation keyframe would —
   * and an exit that fades it to nothing skips the paint like any other
   * invisible layer.
   */
  const fx = layer.fx && layer.fx.length > 0
    ? activeElementFx(layer.fx, localMs, sizeFor(dc, layer, localMs), dc.palette)
    : null;
  if (fx) applyElementMotion(fx, props);

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

  if (fx) {
    drawWithEffects(dc, layer, fx, originX, originY, localMs, props, box);
    ctx.restore();
    return;
  }

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
      const { shape, w, h, cornerRadius, clipFrom } = layer.props;
      ctx.save();

      if (shape === 'ellipse') {
        ellipsePath(ctx, x, y, w, h);
      } else if (clipFrom === undefined) {
        roundedRectPath(ctx, x, y, w, h, cornerRadius ?? 0);
      } else {
        // §6.1's clipProgress: the window opens from one edge rather than
        // being a fixed hole. The children are untouched — that is the whole
        // difference between a wipe and a scale.
        const p = props.clipProgress < 0 ? 0 : props.clipProgress > 1 ? 1 : props.clipProgress;
        const openW = w * (clipFrom === 'left' || clipFrom === 'right' ? p : 1);
        const openH = h * (clipFrom === 'up' || clipFrom === 'down' ? p : 1);
        const openX = clipFrom === 'right' ? x + w - openW : x;
        const openY = clipFrom === 'down' ? y + h - openH : y;
        roundedRectPath(ctx, openX, openY, openW, openH, cornerRadius ?? 0);
      }

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

/**
 * The box an element effect works in, in the layer's own coordinates.
 *
 * Text has no box until it is measured, and a group has none of its own — so
 * for a group, the first child that has one stands in for it. That is the
 * photograph inside a framed card, which is what an effect on "this photo"
 * means.
 */
function elementBox(dc: DrawContext, layer: Layer, originX: number, originY: number, localMs: number): ElementBox {
  switch (layer.type) {
    case 'text': {
      const block = textBlock(dc, layer.props);
      return { x: originX, y: originY, w: block.w, h: block.h, radius: 0 };
    }
    case 'group': {
      const hint = layer.props.box;
      if (hint) return { x: hint.x, y: hint.y, w: hint.w, h: hint.h, radius: 0 };
      for (const child of layer.children) {
        if (child.type === 'group' || child.type === 'text') continue;
        const t = localMs - child.startMs;
        const cx = sampleTrack(child.tracks.x ?? [], t) ?? 0;
        const cy = sampleTrack(child.tracks.y ?? [], t) ?? 0;
        const w = child.props.w;
        const h = child.props.h;
        return {
          x: cx - w * (child.anchorX ?? 0.5),
          y: cy - h * (child.anchorY ?? 0.5),
          w,
          h,
          radius: 'cornerRadius' in child.props ? child.props.cornerRadius ?? 0 : 0,
        };
      }
      return { x: -50, y: -50, w: 100, h: 100, radius: 0 };
    }
    default:
      return {
        x: originX,
        y: originY,
        w: layer.props.w,
        h: layer.props.h,
        radius: 'cornerRadius' in layer.props ? layer.props.cornerRadius ?? 0 : 0,
      };
  }
}

function sizeFor(dc: DrawContext, layer: Layer, localMs: number): { w: number; h: number } {
  const box = elementBox(dc, layer, 0, 0, localMs);
  return { w: box.w, h: box.h };
}

/** A layer with effects that paint: behind it, onto it (clipped to its shape), in front of it. */
function drawWithEffects(
  dc: DrawContext,
  layer: Layer,
  fx: readonly ActiveElementFx[],
  originX: number,
  originY: number,
  localMs: number,
  props: MutableProps,
  box: { w: number; h: number },
): void {
  const { ctx } = dc;
  const ebox = elementBox(dc, layer, originX, originY, localMs);

  for (const { def, sample } of fx) {
    if (!def.under) continue;
    ctx.save();
    def.under(ctx, sample, ebox);
    ctx.restore();
  }

  const glows: Glow[] = [];
  for (const { def, sample } of fx) {
    const glow = def.glow?.(sample);
    if (glow) glows.push(glow);
  }
  const onto = fx.filter(({ def }) => def.onto !== undefined);

  const paintInto = (target: DrawContext['ctx']): void => {
    const into = { ...dc, ctx: target };
    if (props.blur > 0.001) {
      withBlur(target, props.blur, { x: originX, y: originY, w: box.w, h: box.h }, dc.depth, (blurred) => {
        paintLayer({ ...dc, ctx: blurred }, layer, originX, originY, localMs, props);
      });
    } else {
      paintLayer(into, layer, originX, originY, localMs, props);
    }
  };

  if (glows.length > 0 || onto.length > 0) {
    withIsolation(ctx, ebox, dc.depth, paintInto, {
      glows,
      ...(onto.length > 0
        ? { onto: (target) => { for (const { def, sample } of onto) def.onto?.(target, sample, ebox); } }
        : {}),
    });
  } else {
    paintInto(ctx);
  }

  for (const { def, sample } of fx) {
    if (!def.over) continue;
    ctx.save();
    def.over(ctx, sample, ebox);
    ctx.restore();
  }
}

/** Children of a group are drawn with time relative to the group, not the scene. */
export function drawLayers(dc: DrawContext, layers: readonly Layer[], sceneTimeMs: number): void {
  for (const layer of layers) drawLayer(dc, layer, sceneTimeMs);
}

export function releaseLayerScratch(): void {
  scratchByDepth.length = 0;
}
