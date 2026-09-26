import { describe, expect, it } from 'vitest';
import type { Layer, Size, Tracks } from '@/core/types';
import type { AnimPreset, Overlay, TextStyle } from '@/document/types';
import { resolveProps, createProps } from '@/core/anim/interpolate';
import { overlayKey, overlayLayer } from './overlays';

const DESIGN: Size = { w: 1080, h: 1920 };

const STYLE: TextStyle = {
  fontId: 'headline', weight: 700, align: 'center', sizePct: 100, color: '',
  wrap: true, shadow: false, outline: false, pill: false, wrapWidthPct: 100, letterSpacingPct: 0,
};

function make(patch: Partial<Overlay> = {}): Overlay {
  return {
    id: 'ovl_1',
    track: 0,
    startMs: 1_000,
    endMs: 4_000,
    kind: 'text',
    content: { kind: 'text', text: 'Hello', style: STYLE },
    transform: {},
    enterAnim: 'fade',
    exitAnim: 'fade',
    ...patch,
  };
}

let counter = 0;
const ctx = { design: DESIGN, id: (prefix: string) => `${prefix}-${counter++}` };

function build(overlay: Overlay): Layer {
  counter = 0;
  const layer = overlayLayer(overlay, ctx);
  if (!layer) throw new Error('overlayLayer returned null');
  return layer;
}

function at(tracks: Tracks, tMs: number): ReturnType<typeof createProps> {
  return resolveProps(tracks, tMs, createProps());
}

describe('overlay placement (D-044)', () => {
  it('reads transform.x/y as fractions of the design box, not as design units', () => {
    const layer = build(make({ transform: { x: 0.25, y: 0.75 } }));
    const props = at(layer.tracks, 0);
    expect(props.x).toBe(1080 * 0.25);
    expect(props.y).toBe(1920 * 0.75);
  });

  it('centres an overlay that says nothing about where it goes', () => {
    const props = at(build(make()).tracks, 0);
    expect(props.x).toBe(540);
    expect(props.y).toBe(960);
  });

  it('keeps its place when the aspect changes', () => {
    const overlay = make({ transform: { x: 0.25, y: 0.75 } });
    counter = 0;
    const portrait = overlayLayer(overlay, ctx);
    counter = 0;
    const landscape = overlayLayer(overlay, { design: { w: 1920, h: 1080 }, id: ctx.id });

    const p = at(portrait?.tracks ?? {}, 0);
    const l = at(landscape?.tracks ?? {}, 0);
    // Same fraction across, different pixels — §1.3's "re-lay-out, not crop".
    expect(p.x / 1080).toBeCloseTo(l.x / 1920, 10);
  });

  it('carries rotation and a shared scale through unchanged', () => {
    const props = at(build(make({ transform: { rotation: 12, scaleX: 1.5 } })).tracks, 0);
    expect(props.rotation).toBe(12);
    expect(props.scaleX).toBe(1.5);
    // scaleY follows scaleX when only one is given, or a "size" slider would
    // stretch instead of scaling.
    expect(props.scaleY).toBe(1.5);
  });
});

describe('time is local to the overlay (§6.1)', () => {
  it('builds a layer spanning zero to its own duration, not its place on the timeline', () => {
    const layer = build(make({ startMs: 7_000, endMs: 9_500 }));
    expect(layer.startMs).toBe(0);
    expect(layer.endMs).toBe(2_500);
  });

  it('refuses to build a clip with no duration', () => {
    counter = 0;
    expect(overlayLayer(make({ startMs: 4_000, endMs: 4_000 }), ctx)).toBeNull();
  });

  it('is unaffected by where the clip sits, so dragging it does not invalidate the cache', () => {
    const a = overlayKey(make({ startMs: 1_000, endMs: 4_000 }), DESIGN);
    const b = overlayKey(make({ startMs: 8_000, endMs: 11_000 }), DESIGN);
    expect(a).toBe(b);
  });

  it('does invalidate when the length, the content or the design changes', () => {
    const base = overlayKey(make(), DESIGN);
    expect(overlayKey(make({ endMs: 5_000 }), DESIGN)).not.toBe(base);
    expect(overlayKey(make({ content: { kind: 'text', text: 'Other', style: STYLE } }), DESIGN)).not.toBe(base);
    expect(overlayKey(make(), { w: 1080, h: 1080 })).not.toBe(base);
  });
});

describe('enter and exit presets', () => {
  const opacityAt = (preset: AnimPreset, tMs: number): number => {
    const layer = build(make({ enterAnim: preset, exitAnim: preset }));
    return at(layer.tracks, tMs).opacity;
  };

  it('fades in from nothing and back out to nothing', () => {
    expect(opacityAt('fade', 0)).toBe(0);
    expect(opacityAt('fade', 1_500)).toBe(1);
    expect(opacityAt('fade', 3_000)).toBe(0);
  });

  it('leaves opacity alone for "none"', () => {
    expect(opacityAt('none', 0)).toBe(1);
    expect(opacityAt('none', 3_000)).toBe(1);
  });

  it('rises from below and settles', () => {
    const layer = build(make({ enterAnim: 'riseIn', exitAnim: 'none' }));
    const start = at(layer.tracks, 0);
    const settled = at(layer.tracks, 1_500);
    expect(start.y).toBeGreaterThan(settled.y);
    expect(settled.y).toBe(960);
  });

  it('slides in from the left and settles in the same place', () => {
    const layer = build(make({ enterAnim: 'slideIn', exitAnim: 'none' }));
    expect(at(layer.tracks, 0).x).toBeLessThan(540);
    expect(at(layer.tracks, 1_500).x).toBe(540);
  });

  it('pops from under its final size', () => {
    const layer = build(make({ enterAnim: 'popIn', exitAnim: 'none' }));
    expect(at(layer.tracks, 0).scaleX).toBeCloseTo(0.82, 5);
    expect(at(layer.tracks, 2_000).scaleX).toBeCloseTo(1, 2);
  });

  it('wipes with a mask rather than a transform, so the content never moves', () => {
    const layer = build(make({ enterAnim: 'wipeIn', exitAnim: 'none' }));
    expect(layer.type).toBe('mask');
    if (layer.type !== 'mask') throw new Error('expected a mask layer');

    expect(layer.props.clipFrom).toBe('left');
    expect(at(layer.tracks, 0).clipProgress).toBe(0);
    expect(at(layer.tracks, 1_500).clipProgress).toBe(1);
    // The child is still, and unfaded: the mask is doing the reveal.
    expect(at(layer.tracks, 0).opacity).toBe(1);
    expect(layer.children).toHaveLength(1);
    expect(layer.children[0]?.type).toBe('text');
  });

  it('exits the mirror of how it would have entered', () => {
    const layer = build(make({ enterAnim: 'none', exitAnim: 'slideIn' }));
    // Enters where it belongs, leaves to the opposite side.
    expect(at(layer.tracks, 0).x).toBe(540);
    expect(at(layer.tracks, 3_000).x).toBeGreaterThan(540);
  });

  it('clamps the entrance on a clip too short to hold it', () => {
    const layer = build(make({ startMs: 0, endMs: 600, enterAnim: 'fade', exitAnim: 'fade' }));
    // A 520ms entrance plus a 420ms exit will not fit in 600ms; both are cut to
    // a third rather than overlapping into a flicker.
    expect(at(layer.tracks, 200).opacity).toBe(1);
    expect(at(layer.tracks, 600).opacity).toBe(0);
  });
});

describe('content', () => {
  it('builds an image layer for a photo overlay', () => {
    const layer = build(make({ kind: 'photo', content: { kind: 'photo', mediaId: 'm1' } }));
    expect(layer.type).toBe('image');
    if (layer.type !== 'image') throw new Error('expected an image layer');
    expect(layer.props.mediaId).toBe('m1');
    expect(layer.props.fit).toBe('cover');
  });

  it('builds a video layer for custom media', () => {
    const layer = build(make({ kind: 'customMedia', content: { kind: 'customMedia', mediaId: 'v1' } }));
    expect(layer.type).toBe('video');
  });

  it('leaves an empty text colour as a palette role, so a palette switch repaints (D-006)', () => {
    const layer = build(make());
    if (layer.type !== 'text') throw new Error('expected a text layer');
    expect(layer.props.fill).toEqual({ kind: 'role', role: 'ink' });
  });
});

describe('a keyframed overlay (M-keyframes)', () => {
  /**
   * The composition property.
   *
   * Presets and a motion path both want to control position, and the whole
   * design rests on them not fighting: an entrance is transient, so it lays
   * itself over the path and hands back to it, rather than pinning the overlay
   * to a fixed point it would then have to jump away from.
   */

  const path = (patch: Partial<Overlay> = {}): Overlay =>
    make({
      enterAnim: 'none',
      exitAnim: 'none',
      easing: 'linear',
      poses: [
        { atMs: 0, transform: { x: 0.2, y: 0.5 } },
        { atMs: 3_000, transform: { x: 0.8, y: 0.5 } },
      ],
      ...patch,
    });

  it('moves between its keyframes', () => {
    const tracks = build(path()).tracks;
    expect(at(tracks, 0).x).toBeCloseTo(DESIGN.w * 0.2, 4);
    expect(at(tracks, 1_500).x).toBeCloseTo(DESIGN.w * 0.5, 4);
    expect(at(tracks, 3_000).x).toBeCloseTo(DESIGN.w * 0.8, 4);
  });

  it('hands the entrance back to the path instead of pinning it', () => {
    /*
     * With `slideIn`, the overlay starts offset from its *first pose* and has
     * arrived by the time the entrance settles — after which the path takes
     * over completely. Pinning it to one point instead would make the overlay
     * snap the moment the preset finished.
     */
    const tracks = build(path({ enterAnim: 'slideIn' })).tracks;
    const settled = 520; // ENTER_MS, well inside a 3s clip
    // Where the path has already got to by the time the entrance finishes —
    // not where it started. Arriving at the first pose would mean the overlay
    // then had to jump forward to catch up with its own motion.
    const onPathAtSettle = DESIGN.w * (0.2 + 0.6 * (settled / 3_000));

    expect(at(tracks, 0).x, 'starts left of its first pose').toBeLessThan(DESIGN.w * 0.2);
    expect(at(tracks, settled).x, 'arrives on the path').toBeCloseTo(onPathAtSettle, 0);
    expect(at(tracks, 1_500).x, 'and then follows it').toBeCloseTo(DESIGN.w * 0.5, 0);
    expect(at(tracks, 3_000).x).toBeCloseTo(DESIGN.w * 0.8, 0);
  });

  it('leaves from wherever the path has got to', () => {
    // Not from the first pose: an overlay that travelled across the frame has
    // to exit from the far side, which is where it now is.
    const tracks = build(path({ exitAnim: 'slideIn' })).tracks;
    expect(at(tracks, 3_000).x).toBeGreaterThan(DESIGN.w * 0.8);
  });

  it('fades over the path without flattening it', () => {
    const tracks = build(path({ enterAnim: 'fade' })).tracks;
    expect(at(tracks, 0).opacity).toBeCloseTo(0, 4);
    expect(at(tracks, 520).opacity).toBeCloseTo(1, 2);
    // The move carried on underneath the fade.
    expect(at(tracks, 520).x).toBeGreaterThan(DESIGN.w * 0.2);
  });

  it('is keyed separately from the same overlay standing still', () => {
    const moving = path();
    const still = make({ enterAnim: 'none', exitAnim: 'none' });
    expect(overlayKey(moving, DESIGN)).not.toBe(overlayKey(still, DESIGN));
  });

  it('changes its key when a keyframe moves, or the easing does', () => {
    const a = path();
    const b = path({ poses: [{ atMs: 0, transform: { x: 0.2 } }, { atMs: 3_000, transform: { x: 0.9 } }] });
    const c = path({ easing: 'springy' });
    expect(overlayKey(a, DESIGN)).not.toBe(overlayKey(b, DESIGN));
    expect(overlayKey(a, DESIGN)).not.toBe(overlayKey(c, DESIGN));
  });
});
