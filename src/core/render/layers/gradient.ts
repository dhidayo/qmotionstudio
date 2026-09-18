import type { GradientProps } from '@/core/types';
import { resolvePaint } from '../paint';
import type { DrawContext } from '../drawContext';

export function drawGradient(dc: DrawContext, props: GradientProps, x: number, y: number): void {
  const { ctx, palette } = dc;
  const { w, h } = props;
  if (w <= 0 || h <= 0 || props.stops.length === 0) return;

  const fill =
    props.gradient === 'radial'
      ? radial(dc, props, x, y)
      : linear(dc, props, x, y);

  for (const stop of props.stops) {
    // addColorStop throws on an out-of-range offset rather than clamping, and a
    // template computing stops arithmetically will eventually produce 1.0000001.
    const at = stop.at < 0 ? 0 : stop.at > 1 ? 1 : stop.at;
    fill.addColorStop(at, resolvePaint(stop.paint, palette));
  }

  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
}

function linear(dc: DrawContext, props: GradientProps, x: number, y: number): CanvasGradient {
  const { w, h } = props;
  const radians = ((props.angle ?? 0) * Math.PI) / 180;
  // Half-extent along the gradient axis, so the ramp spans the box corner to
  // corner at any angle rather than being cut short on the diagonal.
  const halfSpan = (Math.abs(Math.cos(radians)) * w + Math.abs(Math.sin(radians)) * h) / 2;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const dx = Math.cos(radians) * halfSpan;
  const dy = Math.sin(radians) * halfSpan;
  return dc.ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
}

function radial(dc: DrawContext, props: GradientProps, x: number, y: number): CanvasGradient {
  const { w, h } = props;
  const cx = x + w / 2;
  const cy = y + h / 2;
  return dc.ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) / 2);
}
