import { describe, expect, it } from 'vitest';
import type { ImageLayer, Keyframe, Layer } from '@/core/types';
import { sampleTrack } from '@/core/anim/interpolate';
import type { SceneInputs } from '@/document/types';
import { applySceneExtras, hasSceneExtras, restValue, timeElementEffects, visibleWindow } from './tuning';

/**
 * Motion properties (D-102) and element effects on a template's own elements
 * (D-100), applied after the build without the template knowing.
 */

const kf = (t: number, v: number): Keyframe => ({ t, v, ease: 'outCubic' });

/** A photo that zooms in from 1.4, holds at 1, then shrinks away. */
function photo(): ImageLayer {
  return {
    id: 'p',
    type: 'image',
    startMs: 0,
    endMs: 6_000,
    tracks: {
      scaleX: [kf(0, 1.4), kf(800, 1), kf(5_000, 1), kf(5_600, 0.2)],
      x: [kf(0, 300), kf(800, 540)],
      opacity: [kf(0, 0), kf(400, 1), kf(5_200, 1), kf(5_600, 0)],
    },
    props: { slot: { kind: 'photo', index: 0 }, mediaId: 'm', w: 400, h: 400, fit: 'cover' },
  };
}

function inputs(patch: Partial<SceneInputs> = {}): SceneInputs {
  return {
    photos: [],
    texts: {},
    logo: { mediaId: null, sizePct: 12, placement: 'bottomRight', x: 0.5, y: 0.5, opacity: 1, lockup: false, lockupText: '' },
    look: {
      palette: { bg: '#000', surface: '#111', ink: '#fff', inkMuted: '#aaa', accent: '#f00' },
      background: 'solid', grain: 0, vignette: 0, speed: 1, cornerRadius: 0,
    },
    styleOverrides: { texts: {} },
    slotTransforms: {},
    ...patch,
  };
}

describe('the resting value', () => {
  it('is the hold, for something that arrives, rests and leaves', () => {
    expect(restValue([kf(0, 1.4), kf(800, 1), kf(5_000, 1), kf(5_600, 0.2)], 6_000)).toBe(1);
  });
  it('is where it ends up, for something that only arrives', () => {
    expect(restValue([kf(0, 300), kf(800, 540)], 6_000)).toBe(540);
  });
  it('is where it started, for something that only leaves', () => {
    expect(restValue([kf(4_000, 1), kf(5_000, 0)], 5_200)).toBe(1);
  });
});

describe('motion strength and feel', () => {
  it('changes nothing — the same array — when nothing is set', () => {
    const layers = [photo()];
    expect(hasSceneExtras(inputs())).toBe(false);
    expect(applySceneExtras(layers, inputs())).toBe(layers);
  });

  it('doubles every movement away from the rest at 200%', () => {
    const [tuned] = applySceneExtras([photo()], inputs({ motion: { strength: 2, feel: 'template' } }));
    expect(tuned?.tracks.scaleX?.[0]?.v).toBeCloseTo(1.8, 6);
    expect(tuned?.tracks.scaleX?.[1]?.v).toBeCloseTo(1, 6);
    expect(tuned?.tracks.x?.[0]?.v).toBeCloseTo(60, 6);
  });

  it('holds still at 0%, and leaves presence alone', () => {
    const [tuned] = applySceneExtras([photo()], inputs({ motion: { strength: 0, feel: 'template' } }));
    for (const t of [0, 400, 3_000, 5_500]) expect(sampleTrack(tuned?.tracks.scaleX ?? [], t)).toBeCloseTo(1, 6);
    // Opacity is whether it is there, not how far it moves.
    expect(tuned?.tracks.opacity).toEqual(photo().tracks.opacity);
  });

  it('gives every move one feel, but never springs opacity past its bounds', () => {
    const [bouncy] = applySceneExtras([photo()], inputs({ motion: { strength: 1, feel: 'bouncy' } }));
    expect(bouncy?.tracks.scaleX?.[1]?.ease).toMatchObject({ kind: 'spring' });
    expect(bouncy?.tracks.opacity?.[1]?.ease).toBe('outCubic');
    const [gentle] = applySceneExtras([photo()], inputs({ motion: { strength: 1, feel: 'gentle' } }));
    expect(gentle?.tracks.opacity?.[1]?.ease).toBe('inOutSine');
  });

  it('lets one element override the scene', () => {
    const scene = inputs({ motion: { strength: 2, feel: 'template' }, slotMotion: { 'photo:0': { strength: 0, feel: 'template' } } });
    const [tuned] = applySceneExtras([photo()], scene);
    expect(tuned?.tracks.scaleX?.[0]?.v).toBeCloseTo(1, 6);
  });

  it('carries a container’s tuning down to its pieces', () => {
    const card: Layer = {
      id: 'card', type: 'group', startMs: 0, endMs: 6_000, tracks: {},
      props: { slot: { kind: 'photo', index: 0 } },
      children: [{ ...photo(), props: { mediaId: 'm', w: 400, h: 400, fit: 'cover' } }],
    };
    const [tuned] = applySceneExtras([card], inputs({ slotMotion: { 'photo:0': { strength: 0, feel: 'template' } } }));
    const child = tuned?.type === 'group' ? tuned.children[0] : undefined;
    expect(child?.tracks.scaleX?.[0]?.v).toBeCloseTo(1, 6);
  });
});

describe('effects on a template element', () => {
  it('times an entrance and an exit to when the element is actually on screen', () => {
    const window = visibleWindow(photo());
    expect(window.start).toBeGreaterThan(0);
    expect(window.start).toBeLessThan(400);
    expect(window.end).toBeGreaterThan(5_200);
    expect(window.end).toBeLessThanOrEqual(5_620);

    const fx = timeElementEffects([
      { id: 'e1', effectId: 'spin-in', phase: 'enter', durationMs: 600, intensity: 1, params: {} },
      { id: 'e2', effectId: 'fizzle', phase: 'exit', durationMs: 900, intensity: 1, params: {} },
      { id: 'e3', effectId: 'pulse', phase: 'during', durationMs: 900, intensity: 1, params: {} },
    ], window);
    expect(fx[0]?.startMs).toBe(window.start);
    expect(fx[0]?.endMs).toBe(window.start + 600);
    expect(fx[1]?.endMs).toBe(window.end);
    expect(fx[1]?.startMs).toBe(window.end - 900);
    expect([fx[2]?.startMs, fx[2]?.endMs]).toEqual([window.start, window.end]);
  });

  it('puts them on the tagged layer, and nowhere else', () => {
    const other: Layer = { ...photo(), id: 'q', props: { mediaId: 'm', w: 10, h: 10, fit: 'cover' } };
    const scene = inputs({ elementEffects: { 'photo:0': [{ id: 'e', effectId: 'shine', phase: 'enter', durationMs: 900, intensity: 1, params: {} }] } });
    const [tagged, untagged] = applySceneExtras([photo(), other], scene);
    expect(tagged?.fx?.map((f) => f.effectId)).toEqual(['shine']);
    expect(untagged?.fx).toBeUndefined();
  });

  it('ignores the logo’s effects here — the logo is drawn on its own', () => {
    const scene = inputs({ elementEffects: { logo: [{ id: 'e', effectId: 'shine', phase: 'enter', durationMs: 900, intensity: 1, params: {} }] } });
    expect(hasSceneExtras(scene)).toBe(false);
  });
});
