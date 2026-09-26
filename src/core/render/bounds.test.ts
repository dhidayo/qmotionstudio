import { describe, expect, it } from 'vitest';
import { createBuildContext } from '@/templates/buildContext';
import { logoLayers } from '@/templates/_shared/chrome';
import { resolveProps, createProps } from '@/core/anim/interpolate';
import type { TextMeasureContext } from '@/core/text/layout';
import type { Aspect, Palette } from '@/core/types';
import type { LogoPlacement, Overlay, SceneInputs, TextStyle } from '@/document/types';
import {
  DESIGN_SHORT_EDGE, hits, logoBox, logoFreeFrom, overlayBox, projectDesign, safeBox, toFrame, toLocal,
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
