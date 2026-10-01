import { describe, expect, it } from 'vitest';
import { createProps, resolveProps } from '@/core/anim/interpolate';
import { colorFill, type ImageLayer, type Layer, type Size, type TextLayer } from '@/core/types';
import type { SlotKey, SlotTransform } from '@/document/types';
import {
  animatedNudge, applySlotTransforms, hasNudgePoses, nudgeAt, slotKey, slotOf, slotTransformKey,
} from './slots';

/**
 * Nudging the template's own elements (B).
 *
 * The property that matters most is the one about *not* breaking things: a
 * nudge has to move an element without throwing away the motion the template
 * gave it, and a project that has never nudged anything must come out the
 * other side completely untouched.
 */

const design: Size = { w: 1080, h: 1920 };

function photo(index: number, tracks: ImageLayer['tracks'] = {}): ImageLayer {
  return {
    id: `p${index}`,
    type: 'image',
    startMs: 0,
    endMs: 4_000,
    tracks,
    props: { mediaId: 'm', slot: { kind: 'photo', index }, w: 400, h: 300, fit: 'cover' },
  };
}

function caption(key: string, tracks: TextLayer['tracks'] = {}): TextLayer {
  return {
    id: `t-${key}`,
    type: 'text',
    startMs: 0,
    endMs: 4_000,
    tracks,
    props: {
      text: 'hello',
      slot: { kind: 'text', key },
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
}

const nudge = (patch: Partial<SlotTransform> = {}): SlotTransform => ({
  offsetX: 0, offsetY: 0, scale: 1, rotation: 0, z: 0, ...patch,
});

const at = (layer: Layer, timeMs: number): ReturnType<typeof resolveProps> =>
  resolveProps(layer.tracks, timeMs, createProps());

describe('slot identity', () => {
  it('names photos by index and text by key', () => {
    expect(slotKey({ kind: 'photo', index: 2 })).toBe('photo:2');
    expect(slotKey({ kind: 'text', key: 'headline' })).toBe('text:headline');
  });

  it('finds the slot a drawable was tagged with', () => {
    expect(slotOf(photo(1))).toEqual({ kind: 'photo', index: 1 });
    expect(slotOf(caption('headline'))).toEqual({ kind: 'text', key: 'headline' });
  });
});

describe('a project that has never nudged anything', () => {
  it('gets its layers back untouched, by reference', () => {
    const layers = [photo(0), caption('headline')];
    expect(applySlotTransforms(layers, {}, design)).toBe(layers);
  });

  it('has an empty cache key, which is what makes it free', () => {
    expect(slotTransformKey({})).toBe('');
  });

  it('is unchanged when the nudges are for slots it does not have', () => {
    const layers = [photo(0)];
    const transforms: Record<SlotKey, SlotTransform> = { 'photo:7': nudge({ offsetX: 0.2 }) };
    expect(applySlotTransforms(layers, transforms, design)).toBe(layers);
  });
});

describe('an offset', () => {
  it('moves the element by a fraction of the frame', () => {
    const [moved] = applySlotTransforms(
      [photo(0, { x: [{ t: 0, v: 500, ease: 'linear' }] })],
      { 'photo:0': nudge({ offsetX: 0.1, offsetY: -0.25 }) },
      design,
    );
    expect(moved).toBeDefined();
    if (!moved) return;
    expect(at(moved, 0).x).toBeCloseTo(500 + 108, 6);
    expect(at(moved, 0).y).toBeCloseTo(-480, 6);
  });

  it('keeps the template’s motion, moving the whole path', () => {
    /*
     * The important one. A parallax plane drifts across its scene; nudging it
     * must move where it drifts, not replace the drift with a fixed position.
     * Every keyframe shifts by the same amount, so the shape of the motion is
     * exactly preserved.
     */
    const drifting = photo(0, {
      x: [
        { t: 0, v: 400, ease: 'inOutSine' },
        { t: 4_000, v: 600, ease: 'inOutSine' },
      ],
    });
    const [moved] = applySlotTransforms(
      [drifting],
      { 'photo:0': nudge({ offsetX: 0.5 }) },
      design,
    );
    expect(moved).toBeDefined();
    if (!moved) return;

    const shift = 0.5 * design.w;
    expect(at(moved, 0).x).toBeCloseTo(400 + shift, 6);
    expect(at(moved, 4_000).x).toBeCloseTo(600 + shift, 6);
    // Mid-path too: the easing is untouched, not re-derived.
    expect(at(moved, 2_000).x - shift).toBeCloseTo(at(drifting, 2_000).x, 6);
  });

  it('works on an element the template never animated', () => {
    // No x track at all means "the default, for the whole layer". An offset
    // has to create one or nudging such an element would silently do nothing.
    const [moved] = applySlotTransforms(
      [photo(0)],
      { 'photo:0': nudge({ offsetX: 0.25 }) },
      design,
    );
    expect(moved).toBeDefined();
    if (moved) expect(at(moved, 0).x).toBeCloseTo(270, 6);
  });
});

describe('scale and rotation', () => {
  it('multiplies the scale the template chose rather than replacing it', () => {
    const popping = photo(0, {
      scaleX: [{ t: 0, v: 0.9, ease: 'outBack' }, { t: 800, v: 1, ease: 'outBack' }],
      scaleY: [{ t: 0, v: 0.9, ease: 'outBack' }, { t: 800, v: 1, ease: 'outBack' }],
    });
    const [bigger] = applySlotTransforms([popping], { 'photo:0': nudge({ scale: 2 }) }, design);
    expect(bigger).toBeDefined();
    if (!bigger) return;
    expect(at(bigger, 0).scaleX).toBeCloseTo(1.8, 6);
    expect(at(bigger, 800).scaleX).toBeCloseTo(2, 6);
    expect(at(bigger, 800).scaleY).toBeCloseTo(2, 6);
  });

  it('adds rotation to whatever the template had', () => {
    const tilted = photo(0, { rotation: [{ t: 0, v: -6, ease: 'linear' }] });
    const [turned] = applySlotTransforms([tilted], { 'photo:0': nudge({ rotation: 15 }) }, design);
    expect(turned).toBeDefined();
    if (turned) expect(at(turned, 0).rotation).toBeCloseTo(9, 6);
  });
});

describe('reaching the element', () => {
  it('finds one nested inside a group', () => {
    const group: Layer = {
      id: 'g',
      type: 'group',
      startMs: 0,
      endMs: 4_000,
      tracks: {},
      props: {},
      children: [photo(3, { x: [{ t: 0, v: 100, ease: 'linear' }] })],
    };
    const [out] = applySlotTransforms([group], { 'photo:3': nudge({ offsetX: 0.1 }) }, design);
    expect(out?.type).toBe('group');
    if (out?.type !== 'group') return;
    const child = out.children[0];
    expect(child).toBeDefined();
    if (child) expect(at(child, 0).x).toBeCloseTo(208, 6);
  });

  it('leaves drawables the template did not tag alone', () => {
    const background: Layer = {
      id: 'bg',
      type: 'shape',
      startMs: 0,
      endMs: 4_000,
      tracks: { x: [{ t: 0, v: 10, ease: 'linear' }] },
      props: { shape: 'rect', w: 100, h: 100, fill: colorFill('#000000') },
    };
    const layers = [background, photo(0)];
    const out = applySlotTransforms(layers, { 'photo:0': nudge({ offsetX: 0.3 }) }, design);
    expect(out[0]).toBe(background);
    expect(out[1]).not.toBe(layers[1]);
  });

  it('moves every drawable a slot produced, not just the first', () => {
    // A template is free to build a photo and its reflection from one slot.
    const out = applySlotTransforms(
      [photo(0, { y: [{ t: 0, v: 0, ease: 'linear' }] }), photo(0, { y: [{ t: 0, v: 500, ease: 'linear' }] })],
      { 'photo:0': nudge({ offsetY: 0.1 }) },
      design,
    );
    const [first, second] = out;
    expect(first && at(first, 0).y).toBeCloseTo(192, 6);
    expect(second && at(second, 0).y).toBeCloseTo(692, 6);
  });
});

describe('the cache key', () => {
  it('changes when a nudge changes, and not otherwise', () => {
    const a = slotTransformKey({ 'photo:0': nudge({ offsetX: 0.1 }) });
    const b = slotTransformKey({ 'photo:0': nudge({ offsetX: 0.1 }) });
    const c = slotTransformKey({ 'photo:0': nudge({ offsetX: 0.2 }) });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('does not depend on the order the entries happen to be in', () => {
    const one = slotTransformKey({ 'photo:0': nudge({ scale: 2 }), 'text:a': nudge({ rotation: 5 }) });
    const two = slotTransformKey({ 'text:a': nudge({ rotation: 5 }), 'photo:0': nudge({ scale: 2 }) });
    expect(one).toBe(two);
  });
});

describe('stacking', () => {
  const background: Layer = {
    id: 'bg',
    type: 'shape',
    startMs: 0,
    endMs: 4_000,
    tracks: {},
    props: { shape: 'rect', w: 100, h: 100, fill: colorFill('#000000') },
  };

  it('sends a photo behind the others but not behind the background', () => {
    // The background is not a slot, so it keeps its place at the bottom —
    // otherwise "send to back" would put the photo under it and erase it.
    const layers = [background, photo(0), photo(1)];
    const out = applySlotTransforms(layers, { 'photo:1': nudge({ z: -1 }) }, design);
    expect(out.map((l) => l.id)).toEqual(['bg', 'p1', 'p0']);
  });

  it('brings one in front', () => {
    const layers = [background, photo(0), photo(1)];
    const out = applySlotTransforms(layers, { 'photo:0': nudge({ z: 1 }) }, design);
    expect(out.map((l) => l.id)).toEqual(['bg', 'p1', 'p0']);
  });

  it('keeps anything the template drew between the photos in place', () => {
    const between: Layer = { ...background, id: 'deco' };
    const layers = [background, photo(0), between, photo(1)];
    const out = applySlotTransforms(layers, { 'photo:1': nudge({ z: -1 }) }, design);
    expect(out.map((l) => l.id)).toEqual(['bg', 'p1', 'deco', 'p0']);
  });

  it('leaves the template order alone for everything untouched', () => {
    const layers = [background, photo(0), photo(1), photo(2)];
    const out = applySlotTransforms(layers, { 'photo:3': nudge({ z: 5 }) }, design);
    expect(out.map((l) => l.id)).toEqual(['bg', 'p0', 'p1', 'p2']);
  });

  it('does not reorder when no one has been restacked', () => {
    const layers = [background, photo(0), photo(1)];
    expect(applySlotTransforms(layers, { 'photo:0': nudge({ offsetX: 0.1 }) }, design).map((l) => l.id))
      .toEqual(['bg', 'p0', 'p1']);
  });

  it('is in the cache key, so a restack actually redraws', () => {
    const a = slotTransformKey({ 'photo:0': nudge({ z: 0 }) });
    const b = slotTransformKey({ 'photo:0': nudge({ z: -1 }) });
    expect(a).not.toBe(b);
  });
});

describe('a keyframed nudge', () => {
  const poses = (...entries: readonly [number, number][]): SlotTransform => ({
    ...nudge(),
    poses: entries.map(([atMs, offsetX]) => ({ atMs, offsetX, offsetY: 0, scale: 1, rotation: 0 })),
  });

  it('is still a constant while it has only one pose', () => {
    // One pose is keyframes *on* but not yet moving, and the exact constant
    // path must be kept — approximating something that needs no approximation
    // would cost fidelity for every project that never asked for this.
    const layer = photo(0, {
      x: [{ t: 0, v: 400, ease: 'inOutSine' }, { t: 4_000, v: 600, ease: 'inOutSine' }],
    });
    const out = applySlotTransforms([layer], { 'photo:0': poses([0, 0.5]) }, design);
    const [moved] = out;
    expect(moved).toBeDefined();
    if (!moved) return;

    expect(at(moved, 0).x).toBeCloseTo(400 + 0.5 * design.w, 6);
    expect(at(moved, 4_000).x).toBeCloseTo(600 + 0.5 * design.w, 6);
    // The template's easing survives untouched: the midpoint is still the
    // eased one, not a resampled straight line.
    expect(at(moved, 2_000).x).toBeCloseTo(at(layer, 2_000).x + 0.5 * design.w, 6);
  });

  it('moves on top of whatever the template already does', () => {
    const layer = photo(0, { x: [{ t: 0, v: 100, ease: 'linear' }, { t: 4_000, v: 300, ease: 'linear' }] });
    const [moved] = applySlotTransforms(
      [layer],
      { 'photo:0': poses([0, 0], [4_000, 0.5]) },
      design,
    );
    expect(moved).toBeDefined();
    if (!moved) return;

    // Both motions are present at both ends: the template's 100→300 and the
    // user's 0→half a frame.
    expect(at(moved, 0).x).toBeCloseTo(100, 6);
    expect(at(moved, 4_000).x).toBeCloseTo(300 + 0.5 * design.w, 6);
    // And in between it is past both, rather than following only one of them.
    const middle = at(moved, 2_000).x;
    expect(middle).toBeGreaterThan(200);
    expect(middle).toBeLessThan(300 + 0.5 * design.w);
  });

  it('samples at every moment either side has something to say', () => {
    // The composite has to be pinned wherever either curve changes direction,
    // or one of the two motions gets smoothed away between its own keyframes.
    const layer = photo(0, {
      x: [
        { t: 0, v: 0, ease: 'linear' },
        { t: 1_000, v: 500, ease: 'linear' },
        { t: 2_000, v: 0, ease: 'linear' },
      ],
    });
    const [moved] = applySlotTransforms([layer], { 'photo:0': poses([0, 0], [2_000, 0]) }, design);
    expect(moved).toBeDefined();
    if (!moved) return;

    // The template's spike at 1000 is still a spike.
    expect(at(moved, 1_000).x).toBeCloseTo(500, 6);
    expect(at(moved, 0).x).toBeCloseTo(0, 6);
    expect(at(moved, 2_000).x).toBeCloseTo(0, 6);
  });

  it('tells "keyframes on" apart from "actually moving"', () => {
    expect(hasNudgePoses(nudge())).toBe(false);
    expect(hasNudgePoses(poses([0, 0]))).toBe(true);
    expect(animatedNudge(poses([0, 0]))).toBe(false);
    expect(animatedNudge(poses([0, 0], [1_000, 0.2]))).toBe(true);
  });

  it('samples the nudge itself between its poses', () => {
    const t = poses([0, 0], [1_000, 1]);
    expect(nudgeAt(t, 0).offsetX).toBeCloseTo(0, 6);
    expect(nudgeAt(t, 1_000).offsetX).toBeCloseTo(1, 6);
    expect(nudgeAt(t, 500).offsetX).toBeGreaterThan(0.2);
    expect(nudgeAt(t, 500).offsetX).toBeLessThan(0.8);
  });
});

describe('a container that stands for an element (D-090)', () => {
  /*
   * A photo that breaks into pieces as it leaves is still one photo. When
   * someone has dragged it, the pieces have to appear where it was dragged to,
   * so the nudge goes on the container that holds them — once, in the scene's
   * own space — and not on each piece.
   */
  const piece = (id: string, x: number): Layer => ({
    id,
    type: 'shape',
    startMs: 0,
    endMs: 4_000,
    tracks: { x: [{ t: 0, v: x, ease: 'linear' }] },
    props: { shape: 'rect', w: 10, h: 10, fill: colorFill('#000000') },
  });

  const tagged = (): Layer => ({
    id: 'card',
    type: 'group',
    startMs: 0,
    endMs: 4_000,
    tracks: { x: [{ t: 0, v: 500, ease: 'linear' }], y: [{ t: 0, v: 800, ease: 'linear' }] },
    props: { slot: { kind: 'photo', index: 0 } },
    children: [piece('a', -20), piece('b', 20)],
  });

  it('is found by its slot like any drawable', () => {
    expect(slotOf(tagged())).toEqual({ kind: 'photo', index: 0 });
  });

  it('takes the nudge on its own tracks', () => {
    const [out] = applySlotTransforms([tagged()], { 'photo:0': nudge({ offsetX: 0.1 }) }, design);
    if (!out) throw new Error('no layer');
    expect(at(out, 0).x).toBeCloseTo(500 + 0.1 * design.w, 6);
  });

  it('leaves the pieces where they are inside it, so they move exactly once', () => {
    const before = tagged();
    const [out] = applySlotTransforms([before], { 'photo:0': nudge({ offsetX: 0.1 }) }, design);
    if (out?.type !== 'group' || before.type !== 'group') throw new Error('not a group');
    expect(out.children).toBe(before.children);
  });
});
