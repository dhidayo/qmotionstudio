import { describe, expect, it } from 'vitest';
import { createProps, resolveProps } from '@/core/anim/interpolate';
import { colorFill, type ImageLayer, type Layer, type Size, type TextLayer } from '@/core/types';
import type { SlotKey, SlotTransform } from '@/document/types';
import { applySlotTransforms, slotKey, slotOf, slotTransformKey } from './slots';

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
  offsetX: 0, offsetY: 0, scale: 1, rotation: 0, ...patch,
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
