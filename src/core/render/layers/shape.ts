import type { ShapeProps } from '@/core/types';
import { ellipsePath, roundedRectPath } from '@/core/math/geometry';
import { resolvePaint } from '../paint';
import type { DrawContext } from '../drawContext';

export function drawShape(dc: DrawContext, props: ShapeProps, x: number, y: number): void {
  const { ctx, palette } = dc;
  const { w, h } = props;
  if (w <= 0 || h <= 0) return;

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
