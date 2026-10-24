import type { Ctx2D, ShapeProps } from '@/core/types';
import { ellipsePath, roundedRectPath } from '@/core/math/geometry';

/**
 * The outline of every shape a shape layer draws (D-158).
 *
 * Templates only ever drew rectangles and ellipses; people adding shapes want
 * stars, arrows, badges and speech bubbles too. Each geometry fills its own
 * box exactly — a five-point star touches the top and the bottom, a bubble's
 * tail ends on the bottom edge — so the selection box is the shape's box and
 * the side handles stretch what is actually drawn.
 *
 * Only paths: no Path2D, no SVG strings, nothing a worker's OffscreenCanvas
 * lacks. Rectangles and ellipses go through the same two helpers the
 * templates always used, so their pixels cannot drift.
 */

type Point = { readonly x: number; readonly y: number };

/** How long a line's arrowhead is, against its thickness. */
export const HEAD_LENGTH = 3.2;
/** Half an arrowhead's width, against its length. */
const HEAD_HALF_WIDTH = 0.62;

/** Begins a path and traces the shape's outline in the box at (x, y). */
export function traceShape(ctx: Ctx2D, props: ShapeProps, x: number, y: number): void {
  const { w, h } = props;
  const radius = Math.max(0, Math.min(props.cornerRadius ?? 0, Math.min(w, h) / 2));

  switch (props.shape) {
    case 'rect':
      roundedRectPath(ctx, x, y, w, h, props.cornerRadius ?? 0);
      return;

    case 'ellipse':
      ellipsePath(ctx, x, y, w, h);
      return;

    case 'triangle':
      ctx.beginPath();
      roundedPolygon(ctx, [{ x: x + w / 2, y }, { x: x + w, y: y + h }, { x, y: y + h }], radius);
      return;

    case 'diamond':
      ctx.beginPath();
      roundedPolygon(ctx, [{ x: x + w / 2, y }, { x: x + w, y: y + h / 2 }, { x: x + w / 2, y: y + h }, { x, y: y + h / 2 }], radius);
      return;

    case 'hexagon':
      ctx.beginPath();
      roundedPolygon(ctx, [
        { x: x + w * 0.25, y }, { x: x + w * 0.75, y }, { x: x + w, y: y + h / 2 },
        { x: x + w * 0.75, y: y + h }, { x: x + w * 0.25, y: y + h }, { x, y: y + h / 2 },
      ], radius);
      return;

    case 'star':
      ctx.beginPath();
      roundedPolygon(ctx, starPoints(x, y, w, h, props.points ?? 5, props.inner ?? 0.45), radius);
      return;

    case 'badge': {
      // A seal: a smooth bump between each pair of outer points.
      const pts = starPoints(x, y, w, h, props.points ?? 18, props.inner ?? 0.86);
      const n = pts.length;
      const start = pts[n - 1];
      ctx.beginPath();
      if (!start) return;
      ctx.moveTo(start.x, start.y);
      for (let i = 0; i < n; i += 2) {
        const outer = pts[i];
        const next = pts[(i + 1) % n];
        if (outer && next) ctx.quadraticCurveTo(outer.x, outer.y, next.x, next.y);
      }
      ctx.closePath();
      return;
    }

    case 'heart': {
      // Two lobes touching the top edge, the sides at 30% down, the point at the bottom.
      const px = (u: number): number => x + w * u;
      const py = (v: number): number => y + h * v;
      ctx.beginPath();
      ctx.moveTo(px(0.5), py(0.22));
      ctx.bezierCurveTo(px(0.5), py(0.08), px(0.38), py(0), px(0.25), py(0));
      ctx.bezierCurveTo(px(0.1), py(0), px(0), py(0.12), px(0), py(0.3));
      ctx.bezierCurveTo(px(0), py(0.56), px(0.24), py(0.76), px(0.5), py(1));
      ctx.bezierCurveTo(px(0.76), py(0.76), px(1), py(0.56), px(1), py(0.3));
      ctx.bezierCurveTo(px(1), py(0.12), px(0.9), py(0), px(0.75), py(0));
      ctx.bezierCurveTo(px(0.62), py(0), px(0.5), py(0.08), px(0.5), py(0.22));
      ctx.closePath();
      return;
    }

    case 'line': {
      // Along the middle of its box; the box's height is a band to grab, not
      // the line's thickness. Shortened under an arrowhead, so the round cap
      // never shows past the point.
      const inset = lineInset(props);
      ctx.beginPath();
      ctx.moveTo(x + (props.heads === 'both' ? inset : 0), y + h / 2);
      ctx.lineTo(x + w - (props.heads === 'end' || props.heads === 'both' ? inset : 0), y + h / 2);
      return;
    }

    case 'arrow': {
      // A block arrow pointing right: the head at most a little under half the length.
      const head = Math.min(w * 0.45, h);
      const shaft = h * 0.42;
      const top = y + (h - shaft) / 2;
      ctx.beginPath();
      roundedPolygon(ctx, [
        { x, y: top }, { x: x + w - head, y: top }, { x: x + w - head, y }, { x: x + w, y: y + h / 2 },
        { x: x + w - head, y: y + h }, { x: x + w - head, y: top + shaft }, { x, y: top + shaft },
      ], Math.min(radius, shaft / 2));
      return;
    }

    case 'bubble': {
      // A body over the top 80%, and a tail down to the bottom edge.
      const bodyH = h * 0.8;
      const tailW = Math.min(w * 0.18, bodyH * 0.5);
      const tailX = props.tail === 'right' ? x + w * 0.78 - tailW : props.tail === 'center' ? x + (w - tailW) / 2 : x + w * 0.22;
      const tipX = props.tail === 'right' ? tailX + tailW * 1.35 : props.tail === 'center' ? tailX + tailW / 2 : tailX - tailW * 0.35;
      ctx.beginPath();
      roundedPolygon(ctx, [
        { x, y }, { x: x + w, y }, { x: x + w, y: y + bodyH }, { x: tailX + tailW, y: y + bodyH },
        { x: tipX, y: y + h }, { x: tailX, y: y + bodyH }, { x, y: y + bodyH },
      ], radius, [3, 4, 5]);
      return;
    }
  }
}

/** How far a line stops short of an end that carries an arrowhead. */
function lineInset(props: ShapeProps): number {
  const width = props.stroke?.width ?? 0;
  return Math.min(props.w * 0.45, width * HEAD_LENGTH) * 0.7;
}

/**
 * A line's arrowheads, as filled triangles at the ends that have one. The
 * caller fills them in the line's colour.
 */
export function traceLineHeads(ctx: Ctx2D, props: ShapeProps, x: number, y: number): boolean {
  if (props.shape !== 'line' || props.heads === undefined || props.heads === 'none') return false;
  const width = props.stroke?.width ?? 0;
  if (width <= 0) return false;
  const length = Math.min(props.w * 0.45, width * HEAD_LENGTH);
  const half = Math.min(props.h / 2, length * HEAD_HALF_WIDTH);
  const cy = y + props.h / 2;
  ctx.beginPath();
  const head = (tip: number, dir: 1 | -1): void => {
    ctx.moveTo(tip, cy);
    ctx.lineTo(tip - dir * length, cy - half);
    ctx.lineTo(tip - dir * length, cy + half);
    ctx.closePath();
  };
  head(x + props.w, 1);
  if (props.heads === 'both') head(x, -1);
  return true;
}

/**
 * A closed polygon with its corners rounded by up to `radius`, each clamped to
 * half of its shorter neighbouring edge so a tight corner cannot overshoot.
 * `sharp` lists corners kept pointed — a bubble's tail.
 */
function roundedPolygon(ctx: Ctx2D, pts: readonly Point[], radius: number, sharp: readonly number[] = []): void {
  const n = pts.length;
  const first = pts[0];
  const last = pts[n - 1];
  if (!first || !last) return;
  if (radius <= 0) {
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < n; i++) {
      const p = pts[i];
      if (p) ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    return;
  }
  ctx.moveTo((last.x + first.x) / 2, (last.y + first.y) / 2);
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const next = pts[(i + 1) % n];
    const prev = pts[(i - 1 + n) % n];
    if (!p || !next || !prev) continue;
    if (sharp.includes(i)) {
      ctx.lineTo(p.x, p.y);
      continue;
    }
    const limit = Math.min(Math.hypot(p.x - prev.x, p.y - prev.y), Math.hypot(next.x - p.x, next.y - p.y)) / 2;
    ctx.arcTo(p.x, p.y, next.x, next.y, Math.min(radius, limit));
  }
  ctx.closePath();
}

/**
 * A star's points, outer first, clockwise from the top, stretched so the
 * outermost points touch all four edges of the box.
 *
 * An odd count has one point up and two feet that do not reach as far down as
 * the top point reaches up; without the stretch a five-point star leaves an
 * empty band under it and never quite reaches its sides.
 */
export function starPoints(x: number, y: number, w: number, h: number, points: number, inner: number): Point[] {
  const count = Math.max(3, Math.round(points));
  const depth = Math.max(0.05, Math.min(1, inner));
  const unit: Point[] = [];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < count * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / count;
    const k = i % 2 === 0 ? 1 : depth;
    const p = { x: Math.cos(a) * k, y: Math.sin(a) * k };
    unit.push(p);
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const sx = w / Math.max(1e-6, maxX - minX);
  const sy = h / Math.max(1e-6, maxY - minY);
  return unit.map((p) => ({ x: x + (p.x - minX) * sx, y: y + (p.y - minY) * sy }));
}
