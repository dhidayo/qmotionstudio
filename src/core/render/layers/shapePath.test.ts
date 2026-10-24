import { describe, expect, it } from 'vitest';
import { colorFill, roleFill, type ShapeGeometry, type ShapeProps, type Palette } from '@/core/types';
import { ellipsePath, roundedRectPath } from '@/core/math/geometry';
import { recorder, only, type Call } from '@/core/test/recorder';
import { TextMeasurer } from '@/core/text/measure';
import { resolvePaint } from '../paint';
import type { DrawContext } from '../drawContext';
import { drawShape } from './shape';
import { starPoints, traceShape } from './shapePath';

/**
 * Shapes people add (D-158). Two promises: every outline fills its own box —
 * so the selection box is the shape — and the templates' rectangles and
 * ellipses are drawn by exactly the calls they always were, so no design,
 * thumbnail or snapshot moves.
 */

const palette: Palette = { bg: '#000000', surface: '#111111', ink: '#ffffff', inkMuted: '#aaaaaa', accent: '#ff0000' };

function dcFor(log: Call[]): DrawContext {
  const ctx = recorder(log);
  return { ctx, palette, media: { getBitmap: () => null, getVideoFrame: () => null }, measurer: new TextMeasurer(ctx, new Map()), depth: 0 };
}

const GEOMETRIES: readonly ShapeGeometry[] = ['rect', 'ellipse', 'triangle', 'diamond', 'hexagon', 'star', 'badge', 'heart', 'line', 'arrow', 'bubble'];

const shape = (geometry: ShapeGeometry, patch: Partial<ShapeProps> = {}): ShapeProps => ({
  shape: geometry, w: 300, h: 200, fill: roleFill('accent'), ...patch,
});

/** Every coordinate pair a path call was given. */
function points(log: readonly Call[]): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (const call of log) {
    const [name, ...args] = call;
    if (name === 'ellipse') {
      const [cx = 0, cy = 0, rx = 0, ry = 0] = args.filter((a): a is number => typeof a === 'number');
      out.push({ x: cx - rx, y: cy - ry }, { x: cx + rx, y: cy + ry });
      continue;
    }
    if (!['moveTo', 'lineTo', 'arcTo', 'quadraticCurveTo', 'bezierCurveTo', 'rect', 'roundRect'].includes(String(name))) continue;
    const nums = args.filter((a): a is number => typeof a === 'number');
    const pairs = name === 'arcTo' ? 2 : name === 'rect' || name === 'roundRect' ? 1 : nums.length / 2;
    for (let i = 0; i < pairs; i++) out.push({ x: nums[i * 2] ?? 0, y: nums[i * 2 + 1] ?? 0 });
  }
  return out;
}

describe('traceShape', () => {
  for (const geometry of GEOMETRIES) {
    it(`keeps a ${geometry} inside its box`, () => {
      const log: Call[] = [];
      traceShape(recorder(log), shape(geometry, { cornerRadius: 30, stroke: { paint: colorFill('#fff'), width: 12 } }), 50, 40);
      const pts = points(log);
      expect(pts.length).toBeGreaterThan(0);
      for (const p of pts) {
        expect(p.x).toBeGreaterThanOrEqual(50 - 1e-6);
        expect(p.x).toBeLessThanOrEqual(350 + 1e-6);
        expect(p.y).toBeGreaterThanOrEqual(40 - 1e-6);
        expect(p.y).toBeLessThanOrEqual(240 + 1e-6);
      }
    });
  }

  it('fills the box top to bottom with a five-point star', () => {
    const pts = starPoints(0, 0, 300, 285, 5, 0.45);
    expect(pts).toHaveLength(10);
    expect(Math.min(...pts.map((p) => p.y))).toBeCloseTo(0);
    expect(Math.max(...pts.map((p) => p.y))).toBeCloseTo(285);
    expect(Math.min(...pts.map((p) => p.x))).toBeCloseTo(0);
    expect(Math.max(...pts.map((p) => p.x))).toBeCloseTo(300);
  });

  it('gives a star of N points 2N corners', () => {
    for (const n of [3, 5, 8, 12]) expect(starPoints(0, 0, 100, 100, n, 0.5)).toHaveLength(n * 2);
  });

  it('draws square corners as a plain rectangle, and a full radius as a pill', () => {
    const square: Call[] = [];
    traceShape(recorder(square), shape('rect'), 0, 0);
    expect(only(square, 'rect')).toHaveLength(1);
    const pill: Call[] = [];
    traceShape(recorder(pill), shape('rect', { cornerRadius: 9999 }), 0, 0);
    expect(only(pill, 'roundRect')[0]?.[5]).toBe(100);
  });
});

describe('drawShape', () => {
  it('draws a line as a stroke only, with round caps', () => {
    const log: Call[] = [];
    drawShape(dcFor(log), shape('line', { hollow: true, h: 30, stroke: { paint: roleFill('ink'), width: 10 } }), 0, 0);
    expect(only(log, 'fill')).toHaveLength(0);
    expect(only(log, 'stroke')).toHaveLength(1);
    expect(log).toContainEqual(['set', 'lineCap', 'round']);
  });

  it('fills a line’s arrowheads in its colour', () => {
    const log: Call[] = [];
    drawShape(dcFor(log), shape('line', { hollow: true, h: 30, heads: 'both', stroke: { paint: colorFill('#00ff00'), width: 10 } }), 0, 0);
    expect(only(log, 'fill')).toHaveLength(1);
    expect(log).toContainEqual(['set', 'fillStyle', '#00ff00']);
  });

  it('dashes an outline when asked', () => {
    const log: Call[] = [];
    drawShape(dcFor(log), shape('star', { hollow: true, dash: true, stroke: { paint: roleFill('accent'), width: 8 } }), 0, 0);
    expect(only(log, 'setLineDash')).toHaveLength(1);
    expect(only(log, 'fill')).toHaveLength(0);
  });

  it('draws nothing for an empty box', () => {
    const log: Call[] = [];
    drawShape(dcFor(log), shape('star', { w: 0 }), 0, 0);
    expect(log).toHaveLength(0);
  });

  /*
   * The golden test: the templates' shapes, drawn by the renderer as it was
   * before D-158 and as it is now, call for call.
   */
  function legacy(dc: DrawContext, props: ShapeProps, x: number, y: number): void {
    const { ctx } = dc;
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

  const TEMPLATE_SHAPES: readonly ShapeProps[] = [
    shape('rect'),
    shape('rect', { cornerRadius: 24 }),
    shape('ellipse', { fill: colorFill('rgba(0,0,0,0.4)') }),
    shape('rect', { cornerRadius: 12, stroke: { paint: roleFill('ink', 0.5), width: 3 } }),
    shape('ellipse', { shadow: { blur: 20, offsetX: 0, offsetY: 6, paint: colorFill('rgba(0,0,0,0.3)') } }),
    shape('rect', { cornerRadius: 8, shadow: { blur: 10, offsetX: 2, offsetY: 4, paint: roleFill('bg') }, stroke: { paint: roleFill('accent'), width: 2 } }),
  ];

  for (const [i, props] of TEMPLATE_SHAPES.entries()) {
    it(`draws template shape ${i + 1} exactly as before`, () => {
      const before: Call[] = [];
      const after: Call[] = [];
      legacy(dcFor(before), props, -150, -100);
      drawShape(dcFor(after), props, -150, -100);
      expect(after).toEqual(before);
    });
  }
});
