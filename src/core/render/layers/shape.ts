import type { ShapeProps } from '@/core/types';
import { ellipsePath, roundedRectPath } from '@/core/math/geometry';
import { resolvePaint } from '../paint';
import type { DrawContext } from '../drawContext';
import { traceLineHeads, traceShape } from './shapePath';

export function drawShape(dc: DrawContext, props: ShapeProps, x: number, y: number): void {
  const { w, h } = props;
  if (w <= 0 || h <= 0) return;

  /*
   * The templates' rectangles and ellipses, exactly as they were always drawn
   * — the same calls in the same order — so no design's pixels, thumbnail or
   * snapshot moves because people can now add stars and arrows (D-158).
   */
  if ((props.shape === 'rect' || props.shape === 'ellipse') && props.hollow !== true && props.dash !== true) {
    drawPlain(dc, props, x, y);
    return;
  }
  drawTraced(dc, props, x, y);
}

function drawPlain(dc: DrawContext, props: ShapeProps, x: number, y: number): void {
  const { ctx, palette } = dc;
  const { w, h } = props;

  if (props.shape === 'ellipse') ellipsePath(ctx, x, y, w, h);
  else roundedRectPath(ctx, x, y, w, h, props.cornerRadius ?? 0);

  if (props.shadow) {
    ctx.save();
    ctx.shadowBlur = props.shadow.blur;
    ctx.shadowOffsetX = props.shadow.offsetX;
    ctx.shadowOffsetY = props.shadow.offsetY;
    ctx.shadowColor = resolvePaint(props.shadow.paint, palette);
    ctx.fillStyle = resolvePaint(props.fill, palette);
    ctx.fill();
    ctx.restore();
  } else {
    ctx.fillStyle = resolvePaint(props.fill, palette);
    ctx.fill();
  }

  if (props.stroke && props.stroke.width > 0) {
    ctx.lineWidth = props.stroke.width;
    ctx.strokeStyle = resolvePaint(props.stroke.paint, palette);
    ctx.stroke();
  }
}

/**
 * Every other shape, and outline-only or dashed ones (D-158).
 *
 * A line is all stroke: its box is a band to grab, not paint. Without a fill,
 * the shadow falls from the outline instead, so a hollow frame still lifts
 * off the picture.
 */
function drawTraced(dc: DrawContext, props: ShapeProps, x: number, y: number): void {
  const { ctx, palette } = dc;
  const line = props.shape === 'line';
  const filled = props.hollow !== true && !line;
  const stroke = props.stroke && props.stroke.width > 0 ? props.stroke : null;

  const withShadow = (paint: () => void): void => {
    if (!props.shadow) {
      paint();
      return;
    }
    ctx.save();
    ctx.shadowBlur = props.shadow.blur;
    ctx.shadowOffsetX = props.shadow.offsetX;
    ctx.shadowOffsetY = props.shadow.offsetY;
    ctx.shadowColor = resolvePaint(props.shadow.paint, palette);
    paint();
    ctx.restore();
  };

  traceShape(ctx, props, x, y);

  if (filled) {
    withShadow(() => {
      ctx.fillStyle = resolvePaint(props.fill, palette);
      ctx.fill();
    });
  }

  if (!stroke) return;
  const colour = resolvePaint(stroke.paint, palette);
  const width = stroke.width;
  ctx.save();
  ctx.lineWidth = width;
  ctx.strokeStyle = colour;
  ctx.lineJoin = 'round';
  if (line) ctx.lineCap = 'round';
  // Round caps reach half a width into each gap, so a dashed line leaves more room.
  if (props.dash === true) ctx.setLineDash(line ? [width * 1.5, width * 3] : [width * 2.5, width * 2.5]);
  const stroked = (): void => { ctx.stroke(); };
  if (filled) stroked();
  else withShadow(stroked);

  if (traceLineHeads(ctx, props, x, y)) {
    ctx.fillStyle = colour;
    withShadow(() => { ctx.fill(); });
  }
  ctx.restore();
}
