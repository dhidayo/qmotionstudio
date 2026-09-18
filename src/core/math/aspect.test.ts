import { describe, expect, it } from 'vitest';
import { ASPECTS } from '@/core/types';
import { aspectValue, fitContain, makeViewport, renderSizeFor } from './aspect';

describe('renderSizeFor', () => {
  it('names the short edge, per the social-video convention', () => {
    expect(renderSizeFor('16:9', 1080)).toEqual({ w: 1920, h: 1080 });
    expect(renderSizeFor('4:3', 1080)).toEqual({ w: 1440, h: 1080 });
    expect(renderSizeFor('1:1', 1080)).toEqual({ w: 1080, h: 1080 });
    expect(renderSizeFor('4:5', 1080)).toEqual({ w: 1080, h: 1350 });
    expect(renderSizeFor('9:16', 1080)).toEqual({ w: 1080, h: 1920 });
  });

  it('produces even dimensions at every aspect and tier — H.264 4:2:0 requires it', () => {
    for (const tier of [720, 1080]) {
      for (const aspect of ASPECTS) {
        const { w, h } = renderSizeFor(aspect, tier);
        expect(w % 2, `${aspect} @${tier} width`).toBe(0);
        expect(h % 2, `${aspect} @${tier} height`).toBe(0);
      }
    }
  });

  it('holds the requested aspect ratio across every odd and even short edge', () => {
    // Tolerance is derived from the rounding itself: the long edge can move by
    // at most one pixel either way, and nothing more.
    for (const aspect of ASPECTS) {
      for (let shortEdge = 240; shortEdge <= 1200; shortEdge++) {
        const { w, h } = renderSizeFor(aspect, shortEdge);
        const tolerance = (2 / shortEdge) * Math.max(1, aspectValue(aspect));
        expect(
          Math.abs(w / h - aspectValue(aspect)),
          `${aspect} @${shortEdge} → ${w}×${h}`,
        ).toBeLessThan(tolerance);
      }
    }
  });

  it('derives the long edge from the rounded short edge, not the raw one', () => {
    // Regression: an odd short edge used to produce 702×1246 instead of 702×1248.
    expect(renderSizeFor('9:16', 701)).toEqual({ w: 702, h: 1248 });
    expect(renderSizeFor('16:9', 701)).toEqual({ w: 1248, h: 702 });
  });
});

describe('makeViewport', () => {
  const design = { w: 1080, h: 1080 };

  it('scales uniformly, so a circle stays a circle at every aspect', () => {
    for (const aspect of ASPECTS) {
      const px = renderSizeFor(aspect, 1080);
      const vp = makeViewport(aspect, px, design);
      // One scalar drives both axes; there is no separate scaleX/scaleY to diverge.
      expect(vp.design.w * vp.scale).toBeCloseTo(px.w, 6);
      expect(vp.design.h * vp.scale).toBeCloseTo(px.h, 6);
    }
  });

  it('gives preview and export identical design units, which is what makes them match', () => {
    const exportVp = makeViewport('16:9', renderSizeFor('16:9', 1080), design);
    const previewVp = makeViewport('16:9', { w: 640, h: 360 }, design);
    expect(previewVp.design.w).toBeCloseTo(exportVp.design.w, 6);
    expect(previewVp.design.h).toBeCloseTo(exportVp.design.h, 6);
  });

  it('anchors the short edge to the design short edge', () => {
    const vp = makeViewport('9:16', renderSizeFor('9:16', 1080), design);
    expect(vp.design.w).toBeCloseTo(1080, 6);
    expect(vp.design.h).toBeCloseTo(1920, 6);
  });

  it('insets the safe area symmetrically', () => {
    const vp = makeViewport('16:9', renderSizeFor('16:9', 1080), design);
    expect(vp.safe.x).toBeCloseTo(vp.design.w - (vp.safe.x + vp.safe.w), 6);
    expect(vp.safe.y).toBeCloseTo(vp.design.h - (vp.safe.y + vp.safe.h), 6);
  });
});

describe('fitContain', () => {
  it('letterboxes a wide box inside a square', () => {
    expect(fitContain({ w: 100, h: 100 }, 2)).toEqual({ x: 0, y: 25, w: 100, h: 50 });
  });

  it('pillarboxes a tall box inside a square', () => {
    expect(fitContain({ w: 100, h: 100 }, 0.5)).toEqual({ x: 25, y: 0, w: 50, h: 100 });
  });
});
