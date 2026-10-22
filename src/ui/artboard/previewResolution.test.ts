import { describe, expect, it } from 'vitest';
import { makeViewport, renderSizeFor } from '@/core/math/aspect';
import { ASPECT_RATIO, ASPECTS, type Aspect, type Size } from '@/core/types';
import { createScene } from '@/document/defaults';
import { structureKey } from '@/templates/schema';
import {
  MAX_PREVIEW_SHORT_EDGE,
  PHONE_PREVIEW_SHORT_EDGE,
  PLAYING_PIXEL_BUDGET,
  QUALITY_STEPS,
  exactPreviewSize,
  previewSizes,
} from './previewResolution';

const DESIGN: Size = { w: 1080, h: 1080 };
const area = (s: Size): number => s.w * s.h;
const short = (s: Size): number => Math.min(s.w, s.h);

/** The picture's box on a 1440×900 laptop window, roughly as the stage gives it. */
function displayFor(aspect: Aspect): Size {
  const [a, b] = ASPECT_RATIO[aspect];
  const stage = { w: 816, h: 540 };
  return stage.w / stage.h > a / b ? { w: (stage.h * a) / b, h: stage.h } : { w: stage.w, h: (stage.w * b) / a };
}

function laptop(aspect: Aspect, step = 0) {
  return previewSizes({ aspect, display: displayFor(aspect), dpr: 2, phone: false, step, thumb: null });
}

describe('preview backing sizes (D-154)', () => {
  it('are exactly the frame shape, with even edges, at every aspect', () => {
    for (const aspect of ASPECTS) {
      const [a, b] = ASPECT_RATIO[aspect];
      for (let edge = 20; edge <= 1200; edge += 7) {
        const size = exactPreviewSize(aspect, edge);
        expect(size.w * b, `${aspect} at ${edge}`).toBe(size.h * a);
        expect(size.w % 2).toBe(0);
        expect(size.h % 2).toBe(0);
        expect(short(size)).toBeLessThanOrEqual(Math.max(edge, 2 * Math.min(a, b)));
      }
    }
  });

  it('lay templates out in the export’s design units, playing or paused', () => {
    const scene = createScene('flow-polaroid-pass', 6_000);
    for (const aspect of ASPECTS) {
      const exported = makeViewport(aspect, renderSizeFor(aspect, 1080), DESIGN).design;
      for (const step of [0, 1, 2]) {
        const { playing, paused } = laptop(aspect, step);
        for (const size of [playing, paused]) {
          const design = makeViewport(aspect, size, DESIGN).design;
          expect(design.w, `${aspect} ${size.w}×${size.h}`).toBeCloseTo(exported.w, 6);
          expect(design.h).toBeCloseTo(exported.h, 6);
          // So a change of resolution never rebuilds the template.
          expect(structureKey(scene.templateId, scene.inputs, aspect, design, scene.durationMs))
            .toBe(structureKey(scene.templateId, scene.inputs, aspect, exported, scene.durationMs));
        }
      }
    }
  });

  it('keep a computer within the budget while playing, and sharp while paused', () => {
    const wide = laptop('16:9');
    expect(wide.playing).toEqual({ w: 1184, h: 666 });
    // 816×459 on screen at 2×: every device pixel, snapped to the shape.
    expect(wide.paused).toEqual({ w: 1632, h: 918 });
    for (const aspect of ASPECTS) {
      const { playing, paused } = laptop(aspect);
      expect(area(playing), aspect).toBeLessThanOrEqual(PLAYING_PIXEL_BUDGET);
      expect(area(paused)).toBeGreaterThanOrEqual(area(playing));
      expect(short(paused)).toBeLessThanOrEqual(MAX_PREVIEW_SHORT_EDGE);
    }
  });

  it('uses one size when the screen is already within the budget', () => {
    const small = previewSizes({ aspect: '16:9', display: { w: 800, h: 450 }, dpr: 1, phone: false, step: 0, thumb: null });
    expect(small.playing).toBe(small.paused);
    expect(small.paused).toEqual({ w: 800, h: 450 });
  });

  it('never goes past the cap on a large screen', () => {
    const big = previewSizes({ aspect: '16:9', display: { w: 2400, h: 1350 }, dpr: 2, phone: false, step: 0, thumb: null });
    expect(big.paused).toEqual({ w: 1920, h: 1080 });
    // Capped below the screen's pixels: the box is the stage's, unsnapped.
    expect(big.shown).toEqual({ w: 2400, h: 1350 });
  });

  it('shows the paused picture one to one on a computer', () => {
    // 812.4×457 on a 1× screen: drawn at 800×450, shown at 800×450.
    const plain = previewSizes({ aspect: '16:9', display: { w: 812.4, h: 457 }, dpr: 1, phone: false, step: 0, thumb: null });
    expect(plain.paused).toEqual({ w: 800, h: 450 });
    expect(plain.shown).toEqual({ w: 800, h: 450 });
    for (const dpr of [1, 1.25, 1.5, 2]) {
      for (const aspect of ASPECTS) {
        const display = displayFor(aspect);
        const { paused, shown } = previewSizes({ aspect, display, dpr, phone: false, step: 0, thumb: null });
        const [a, b] = ASPECT_RATIO[aspect];
        // Device pixels, exactly; inside the stage's box; less than one step smaller.
        expect(shown.w * dpr).toBeCloseTo(paused.w, 6);
        expect(shown.h * dpr).toBeCloseTo(paused.h, 6);
        expect(shown.w).toBeLessThanOrEqual(display.w + 1e-9);
        expect(shown.h).toBeLessThanOrEqual(display.h + 1e-9);
        expect(short(display) - short(shown)).toBeLessThan((2 * Math.min(a, b)) / dpr);
      }
    }
  });

  it('leaves a phone’s box alone', () => {
    const display = { w: 300, h: 533.3 };
    const phone = previewSizes({ aspect: '9:16', display, dpr: 2, phone: true, step: 0, thumb: null });
    expect(phone.shown).toEqual(display);
  });

  it('steps the playing picture down, never the paused one', () => {
    const full = laptop('16:9', 0);
    const three = laptop('16:9', 1);
    const half = laptop('16:9', 2);
    expect(short(three.playing)).toBeLessThan(short(full.playing));
    expect(short(half.playing)).toBeLessThan(short(three.playing));
    expect(three.paused).toEqual(full.paused);
    // Past the last step it stays at the last step.
    expect(laptop('16:9', 9).playing).toEqual(half.playing);
    expect(QUALITY_STEPS.at(-1)).toBe(0.5);
  });

  it('keeps a phone at no more than 2× and 720 on the short edge (D-112)', () => {
    for (const aspect of ASPECTS) {
      const [a, b] = ASPECT_RATIO[aspect];
      const display = { w: 390, h: (390 * b) / a };
      const edge = Math.min(display.w, display.h);
      const { playing, paused } = previewSizes({ aspect, display, dpr: 3, phone: true, step: 0, thumb: null });
      expect(playing).toBe(paused);
      const capped = Math.min(edge * 2, PHONE_PREVIEW_SHORT_EDGE);
      expect(short(paused)).toBeLessThanOrEqual(capped);
      // A step is a step of the capped size, so each one really draws less.
      const stepped = previewSizes({ aspect, display, dpr: 3, phone: true, step: 1, thumb: null });
      expect(short(stepped.playing)).toBeLessThanOrEqual(capped * 0.75);
      expect(short(stepped.playing)).toBeLessThan(short(paused));
      expect(stepped.paused).toEqual(paused);
    }
  });

  it('passes a pinned thumbnail size straight through', () => {
    const { playing, paused } = previewSizes({ aspect: '4:5', display: { w: 300, h: 375 }, dpr: 2, phone: false, step: 2, thumb: 540 });
    expect(playing).toEqual(renderSizeFor('4:5', 540));
    expect(paused).toEqual(renderSizeFor('4:5', 540));
  });
});
