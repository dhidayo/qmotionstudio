import { describe, expect, it } from 'vitest';
import { createBuildContext } from '@/templates/buildContext';
import { logoLayers } from '@/templates/_shared/chrome';
import { resolveProps, createProps } from '@/core/anim/interpolate';
import type { TextMeasureContext } from '@/core/text/layout';
import { colorFill, type Aspect, type Layer, type Palette } from '@/core/types';
import type { LogoPlacement, Overlay, SceneInputs, TextStyle } from '@/document/types';
import type { DrawnScene } from './rig';
import {
  DESIGN_SHORT_EDGE, hits, logoBox, logoFreeFrom, overlayBox, projectDesign, safeBox, slotBoxes,
  toFrame, toLocal,
} from './bounds';

/**
 * Geometry for direct manipulation.
 *
 * The thing worth testing hardest is not the arithmetic — it is that these
 * boxes agree with what the renderer actually draws. A selection box that is
 * subtly in the wrong place is worse than no selection box, because it teaches
 * the user that the handles lie.
 */

const ASPECTS: readonly Aspect[] = ['16:9', '4:3', '1:1', '4:5', '9:16'];

/**
 * A measurement context with no canvas behind it.
 *
 * Fixed-width glyphs keep the expectations arithmetic rather than dependent on
 * whichever fonts the machine running the tests happens to have.
 */
const measure: TextMeasureContext = {
  font: '',
  letterSpacing: '',
  textBaseline: 'alphabetic',
  measureText: (text: string) => ({ width: text.length * 10 }),
};

const palette: Palette = {
  bg: '#000000', surface: '#111111', ink: '#ffffff', inkMuted: '#aaaaaa', accent: '#ff0000',
};

const textStyle: TextStyle = {
  fontId: 'headline', weight: 700, align: 'center', sizePct: 100, color: '#ffffff',
  wrap: false, shadow: false, outline: false, pill: false, wrapWidthPct: 80, letterSpacingPct: 0,
};

function overlay(patch: Partial<Overlay> = {}): Overlay {
  return {
    id: 'o1',
    track: 0,
    startMs: 0,
    endMs: 3_000,
    kind: 'photo',
    content: { kind: 'photo', mediaId: 'm1' },
    transform: {},
    enterAnim: 'none',
    exitAnim: 'none',
    ...patch,
  };
}

function inputs(logo: Partial<SceneInputs['logo']>): SceneInputs {
  return {
    photos: [],
    texts: {},
    logo: {
      mediaId: 'logo-1', sizePct: 12, placement: 'topLeft', x: 0.5, y: 0.5,
      opacity: 1, lockup: false, lockupText: '',
      ...logo,
    },
    look: {
      palette, background: 'solid', grain: 0, vignette: 0, speed: 1, cornerRadius: 0,
    },
    styleOverrides: { texts: {} },
    slotTransforms: {},
  };
}

describe('the frame', () => {
  it('always has a 1080 short edge', () => {
    for (const aspect of ASPECTS) {
      const design = projectDesign(aspect);
      expect(Math.min(design.w, design.h)).toBe(DESIGN_SHORT_EDGE);
    }
  });

  it('insets the safe box equally on every side', () => {
    const design = projectDesign('16:9');
    const safe = safeBox(design);
    expect(safe.x).toBeCloseTo(design.w - (safe.x + safe.w), 6);
    expect(safe.y).toBeCloseTo(design.h - (safe.y + safe.h), 6);
  });
});

describe('an overlay box', () => {
  it('sits in the middle of the frame when nothing says otherwise', () => {
    const design = projectDesign('9:16');
    const box = overlayBox(overlay(), '9:16', measure);
    expect(box?.cx).toBeCloseTo(design.w / 2, 6);
    expect(box?.cy).toBeCloseTo(design.h / 2, 6);
  });

  it('reads x and y as fractions of the frame, so it survives an aspect change', () => {
    for (const aspect of ASPECTS) {
      const design = projectDesign(aspect);
      const box = overlayBox(overlay({ transform: { x: 0.25, y: 0.75 } }), aspect, measure);
      expect(box?.cx).toBeCloseTo(design.w * 0.25, 6);
      expect(box?.cy).toBeCloseTo(design.h * 0.75, 6);
    }
  });

  it('multiplies the content size by the overlay scale', () => {
    const plain = overlayBox(overlay(), '1:1', measure);
    const doubled = overlayBox(overlay({ transform: { scaleX: 2, scaleY: 2 } }), '1:1', measure);
    expect(doubled?.w).toBeCloseTo((plain?.w ?? 0) * 2, 6);
    expect(doubled?.h).toBeCloseTo((plain?.h ?? 0) * 2, 6);
  });

  it('takes its width from the measured text, not from a guess', () => {
    const short = overlayBox(
      overlay({ kind: 'text', content: { kind: 'text', text: 'hi', style: textStyle } }),
      '1:1',
      measure,
    );
    const long = overlayBox(
      overlay({ kind: 'text', content: { kind: 'text', text: 'hello there world', style: textStyle } }),
      '1:1',
      measure,
    );
    expect(long?.w ?? 0).toBeGreaterThan(short?.w ?? 0);
  });

  it('is unmoved by the entrance animation', () => {
    // The handles describe the placement, not wherever the preset has slid the
    // content to on this particular frame.
    const still = overlayBox(overlay({ enterAnim: 'none' }), '9:16', measure);
    const sliding = overlayBox(overlay({ enterAnim: 'slideIn' }), '9:16', measure);
    expect(sliding?.cx).toBeCloseTo(still?.cx ?? -1, 6);
    expect(sliding?.cy).toBeCloseTo(still?.cy ?? -1, 6);
  });
});

describe('hit testing', () => {
  const box = { cx: 100, cy: 100, w: 80, h: 40, rotation: 0 };

  it('accepts the centre and rejects the outside', () => {
    expect(hits(box, { x: 100, y: 100 })).toBe(true);
    expect(hits(box, { x: 100, y: 130 })).toBe(false);
    expect(hits(box, { x: 145, y: 100 })).toBe(false);
  });

  it('follows the rotation rather than testing a loose bounding box', () => {
    const turned = { ...box, rotation: 90 };
    // Inside the unrotated box, outside the turned one.
    expect(hits(box, { x: 135, y: 100 })).toBe(true);
    expect(hits(turned, { x: 135, y: 100 })).toBe(false);
    // And the other way about.
    expect(hits(box, { x: 100, y: 130 })).toBe(false);
    expect(hits(turned, { x: 100, y: 130 })).toBe(true);
  });

  it('round-trips between the box frame and the world', () => {
    const turned = { ...box, rotation: 37 };
    const point = { x: 123, y: 91 };
    const back = toFrame(turned, toLocal(turned, point));
    expect(back.x).toBeCloseTo(point.x, 6);
    expect(back.y).toBeCloseTo(point.y, 6);
  });
});

describe('the logo box', () => {
  const PLACEMENTS: readonly LogoPlacement[] = [
    'topLeft', 'topRight', 'bottomLeft', 'bottomRight', 'center', 'free',
  ];

  /**
   * Agreement with the renderer, for every placement and aspect.
   *
   * `logoBox` necessarily repeats the arithmetic in the template chrome's
   * `placementOf`, because one produces a layer and the other produces a
   * rectangle. Repeating it is only safe if something notices when the two
   * drift, so this measures the actual built layer rather than trusting the
   * copy.
   */
  it.each(ASPECTS)('matches where the renderer puts the logo at %s', (aspect) => {
    const design = projectDesign(aspect);

    for (const placement of PLACEMENTS) {
      const scene = inputs({ placement, x: 0.3, y: 0.8, sizePct: 14 });
      const ctx = createBuildContext({
        design,
        safe: safeBox(design),
        palette,
        durationMs: 3_000,
        measureContext: measure,
      });

      const [layer] = logoLayers(scene, ctx);
      expect(layer, `${placement} should build a layer`).toBeDefined();
      if (!layer) continue;

      const drawn = resolveProps(layer.tracks, 0, createProps());
      const box = logoBox(scene, aspect);

      expect(box?.cx, `${placement} x at ${aspect}`).toBeCloseTo(drawn.x, 6);
      expect(box?.cy, `${placement} y at ${aspect}`).toBeCloseTo(drawn.y, 6);
      if (layer.type === 'image') {
        expect(box?.w, `${placement} size at ${aspect}`).toBeCloseTo(layer.props.w, 6);
      }
    }
  });

  it('has no box at all when there is no logo', () => {
    expect(logoBox(inputs({ mediaId: null }), '1:1')).toBeNull();
  });

  it('inverts its own free placement, so a drag lands where it was dropped', () => {
    for (const aspect of ASPECTS) {
      const scene = inputs({ placement: 'free', x: 0.22, y: 0.64 });
      const box = logoBox(scene, aspect);
      expect(box).not.toBeNull();
      if (!box) continue;

      const free = logoFreeFrom({ x: box.cx, y: box.cy }, aspect);
      expect(free.x).toBeCloseTo(0.22, 6);
      expect(free.y).toBeCloseTo(0.64, 6);
    }
  });
});

describe('boxes follow the layer\u2019s anchor', () => {
  /**
   * `drawLayer` positions a layer by its *anchor*, which defaults to the
   * centre but which the templates set to the top-left in forty places. A box
   * that assumes centre-anchoring is half the element's width and height out,
   * which in practice meant the headline could not be clicked at all.
   *
   * Asserted arithmetically rather than through the UI. The end-to-end version
   * of this test probed a few points down the type band until it found the
   * headline, and that tolerance made it pass with the anchor handling removed
   * — it found the box in the wrong place and was satisfied.
   */
  const drawnWith = (layers: readonly Layer[]): DrawnScene => ({
    sceneId: 's1',
    layers,
    design: projectDesign('9:16'),
  });

  it('puts a top-left anchored image box at x+w/2, y+h/2', () => {
    const layer: Layer = {
      id: 'p',
      type: 'image',
      startMs: 0,
      endMs: 4_000,
      anchorX: 0,
      anchorY: 0,
      tracks: {
        x: [{ t: 0, v: 100, ease: 'linear' }],
        y: [{ t: 0, v: 200, ease: 'linear' }],
      },
      props: { mediaId: 'm', slot: { kind: 'photo', index: 0 }, w: 400, h: 300, fit: 'cover' },
    };

    const [box] = slotBoxes(drawnWith([layer]), 0, {}, '9:16', measure);
    expect(box?.box.cx).toBeCloseTo(300, 6);
    expect(box?.box.cy).toBeCloseTo(350, 6);
    expect(box?.box.w).toBeCloseTo(400, 6);
  });

  it('puts a centre-anchored image box on its own x and y', () => {
    const layer: Layer = {
      id: 'p',
      type: 'image',
      startMs: 0,
      endMs: 4_000,
      tracks: {
        x: [{ t: 0, v: 100, ease: 'linear' }],
        y: [{ t: 0, v: 200, ease: 'linear' }],
      },
      props: { mediaId: 'm', slot: { kind: 'photo', index: 0 }, w: 400, h: 300, fit: 'cover' },
    };

    const [box] = slotBoxes(drawnWith([layer]), 0, {}, '9:16', measure);
    expect(box?.box.cx).toBeCloseTo(100, 6);
    expect(box?.box.cy).toBeCloseTo(200, 6);
  });

  it('lays text out rightwards and downwards from its anchor', () => {
    // `drawText` starts at the anchor and runs on from there, whatever
    // `anchorY` says — the anchor box for text is (wrap width × zero).
    const layer: Layer = {
      id: 't',
      type: 'text',
      startMs: 0,
      endMs: 4_000,
      anchorX: 0,
      anchorY: 0,
      tracks: {
        x: [{ t: 0, v: 60, ease: 'linear' }],
        y: [{ t: 0, v: 90, ease: 'linear' }],
      },
      props: {
        text: 'hello',
        slot: { kind: 'text', key: 'headline' },
        fontId: 'headline',
        fontSizePx: 60,
        weight: 700,
        letterSpacingPct: 0,
        lineHeight: 1.2,
        align: 'left',
        fill: colorFill('#ffffff'),
        maxWidthPx: null,
        reveal: { kind: 'none' },
      },
    };

    // The stub measures 10px a character, so "hello" is 50 wide and one line
    // of 60px text at 1.2 line height is 72 tall.
    const [box] = slotBoxes(drawnWith([layer]), 0, {}, '9:16', measure);
    expect(box?.box.cx).toBeCloseTo(60 + 25, 6);
    expect(box?.box.cy).toBeCloseTo(90 + 36, 6);
    expect(box?.box.w).toBeCloseTo(50, 6);
    expect(box?.box.h).toBeCloseTo(72, 6);
  });

  it('adds the user\u2019s nudge on top of the template\u2019s position', () => {
    const layer: Layer = {
      id: 'p',
      type: 'image',
      startMs: 0,
      endMs: 4_000,
      tracks: { x: [{ t: 0, v: 100, ease: 'linear' }], y: [{ t: 0, v: 200, ease: 'linear' }] },
      props: { mediaId: 'm', slot: { kind: 'photo', index: 0 }, w: 400, h: 300, fit: 'cover' },
    };
    const frame = projectDesign('9:16');

    const [box] = slotBoxes(
      drawnWith([layer]),
      0,
      { 'photo:0': { offsetX: 0.25, offsetY: -0.1, scale: 2, rotation: 30, z: 0 } },
      '9:16',
      measure,
    );
    expect(box?.box.cx).toBeCloseTo(100 + 0.25 * frame.w, 6);
    expect(box?.box.cy).toBeCloseTo(200 - 0.1 * frame.h, 6);
    expect(box?.box.w).toBeCloseTo(800, 6);
    expect(box?.box.rotation).toBeCloseTo(30, 6);
  });
});

describe('a drawable the template nested', () => {
  /**
   * A group or a mask is a coordinate space and a clock, both of which
   * `drawLayer` hands to its children and neither of which the boxes carried.
   *
   * Phrase Swap is the template that exposed it: its photographs live inside a
   * mask at the centre of the frame that scales from 0.6 to 1.12, and their own
   * tracks put them at (0, 0) — the mask's centre. Measured as top-level layers
   * they were reported at the frame's top-left corner, at the wrong size, for
   * the whole scene. Selecting that photograph put the handles nowhere near it.
   */
  const drawnWith = (layers: readonly Layer[]): DrawnScene => ({
    sceneId: 's1',
    layers,
    design: projectDesign('1:1'),
  });

  const photo = (): Layer => ({
    id: 'p',
    type: 'image',
    startMs: 0,
    endMs: 4_000,
    tracks: { x: [{ t: 0, v: 0, ease: 'linear' }], y: [{ t: 0, v: 0, ease: 'linear' }] },
    props: { mediaId: 'm', slot: { kind: 'photo', index: 0 }, w: 400, h: 300, fit: 'cover' },
  });

  it('is measured from its parent\u2019s centre, not from the frame\u2019s corner', () => {
    const mask: Layer = {
      id: 'mask',
      type: 'mask',
      startMs: 0,
      endMs: 4_000,
      tracks: { x: [{ t: 0, v: 200, ease: 'linear' }], y: [{ t: 0, v: 500, ease: 'linear' }] },
      props: { shape: 'ellipse', w: 600, h: 600 },
      children: [photo()],
    };

    const [box] = slotBoxes(drawnWith([mask]), 0, {}, '1:1', measure);
    expect(box?.box.cx).toBeCloseTo(200, 6);
    expect(box?.box.cy).toBeCloseTo(500, 6);
  });

  it('carries the parent\u2019s scale into its own size', () => {
    const mask: Layer = {
      id: 'mask',
      type: 'mask',
      startMs: 0,
      endMs: 4_000,
      tracks: {
        x: [{ t: 0, v: 200, ease: 'linear' }],
        y: [{ t: 0, v: 500, ease: 'linear' }],
        scaleX: [{ t: 0, v: 1.5, ease: 'linear' }],
        scaleY: [{ t: 0, v: 1.5, ease: 'linear' }],
      },
      props: { shape: 'ellipse', w: 600, h: 600 },
      children: [photo()],
    };

    const [box] = slotBoxes(drawnWith([mask]), 0, {}, '1:1', measure);
    expect(box?.box.w).toBeCloseTo(600, 6);
    expect(box?.box.h).toBeCloseTo(450, 6);
  });

  it('is offset by the parent\u2019s own position, scaled', () => {
    // The child sits 100 to the right of its parent inside a parent scaled by
    // two, so it is 200 to the right of the parent in the scene.
    const child = photo();
    const group: Layer = {
      id: 'g',
      type: 'group',
      startMs: 0,
      endMs: 4_000,
      tracks: {
        x: [{ t: 0, v: 300, ease: 'linear' }],
        y: [{ t: 0, v: 300, ease: 'linear' }],
        scaleX: [{ t: 0, v: 2, ease: 'linear' }],
        scaleY: [{ t: 0, v: 2, ease: 'linear' }],
      },
      props: {},
      children: [{ ...child, tracks: { x: [{ t: 0, v: 100, ease: 'linear' }], y: [{ t: 0, v: 0, ease: 'linear' }] } }],
    };

    const [box] = slotBoxes(drawnWith([group]), 0, {}, '1:1', measure);
    expect(box?.box.cx).toBeCloseTo(500, 6);
    expect(box?.box.cy).toBeCloseTo(300, 6);
  });

  it('reads its parent\u2019s clock, so a nested photo is where the parent has moved it', () => {
    const group: Layer = {
      id: 'g',
      type: 'group',
      // The group starts a second in, so at a scene time of 1500 it is only
      // 500 into its own timeline and halfway along the move below.
      startMs: 1_000,
      endMs: 5_000,
      tracks: {
        x: [{ t: 0, v: 0, ease: 'linear' }, { t: 1_000, v: 400, ease: 'linear' }],
        y: [{ t: 0, v: 0, ease: 'linear' }],
      },
      props: {},
      children: [photo()],
    };

    const [box] = slotBoxes(drawnWith([group]), 1_500, {}, '1:1', measure);
    expect(box?.box.cx).toBeCloseTo(200, 6);
  });
});

describe('a nudge on an element that starts partway through', () => {
  /**
   * A nudge with poses becomes keyframes inside the element's *own* tracks, so
   * by the time anything is drawn its pose times are local times. Sampling it
   * against the scene clock instead put the handles somewhere else entirely on
   * every template whose elements start partway through — which is most of the
   * ones that cycle.
   */
  it('is sampled on the element\u2019s clock rather than the scene\u2019s', () => {
    const layer: Layer = {
      id: 'p',
      type: 'image',
      startMs: 2_000,
      endMs: 6_000,
      tracks: { x: [{ t: 0, v: 100, ease: 'linear' }], y: [{ t: 0, v: 100, ease: 'linear' }] },
      props: { mediaId: 'm', slot: { kind: 'photo', index: 0 }, w: 400, h: 300, fit: 'cover' },
    };
    const frame = projectDesign('1:1');
    const drawn: DrawnScene = { sceneId: 's1', layers: [layer], design: frame };

    // A motion from no offset to a quarter of the frame over the element's
    // first second. At a scene time of 2500 the element is 500 into itself, so
    // the nudge is half applied.
    const transforms = {
      'photo:0': {
        offsetX: 0, offsetY: 0, scale: 1, rotation: 0, z: 0,
        easing: 'linear' as const,
        poses: [
          { atMs: 0, offsetX: 0, offsetY: 0, scale: 1, rotation: 0 },
          { atMs: 1_000, offsetX: 0.25, offsetY: 0, scale: 1, rotation: 0 },
        ],
      },
    };

    const [box] = slotBoxes(drawn, 2_500, transforms, '1:1', measure);
    expect(box?.box.cx).toBeCloseTo(100 + 0.125 * frame.w, 6);
  });
});
