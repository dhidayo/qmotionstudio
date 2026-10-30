import { describe, expect, it } from 'vitest';
import { createProps, resolveProps, sampleTrack } from '@/core/anim/interpolate';
import type { TextMeasureContext } from '@/core/text/layout';
import { roleFill, type Keyframe, type Layer, type Palette, type SlotRef } from '@/core/types';
import type { SceneInputs, ShapeOverride, SlotTransform } from '@/document/types';
import { applyShapeStyles, entriesDrawn, hasShapeStyles, labelIn, partsIn, shapeStylesKey } from './parts';
import { resolvePaint } from './paint';
import { applySlotTransforms, carry, parseSlotKey, slotKey } from './slots';
import { projectDesign, slotBoxes } from './bounds';

/**
 * A design's own parts (D-159): their keys, the followers that move with
 * what they sit behind, the colours and deletions put on after the build,
 * and the boxes the canvas picks them by.
 */

const k = (t: number, v: number, ease: Keyframe['ease'] = 'linear'): Keyframe => ({ t, v, ease });
const design = { w: 1000, h: 1000 };
const palette: Palette = { bg: '#000000', surface: '#222222', ink: '#ffffff', inkMuted: '#999999', accent: '#ffcc00' };

const shape = (id: string, slot: SlotRef | undefined, patch: Partial<Layer> = {}, fill = roleFill('accent')): Layer => ({
  id, type: 'shape', startMs: 0, endMs: 6000,
  tracks: { x: [k(0, 300)], y: [k(0, 200)] },
  props: { shape: 'rect', w: 100, h: 40, fill, ...(slot ? { slot } : {}) },
  ...patch,
} as Layer);

const text = (id: string, key: string, patch: Partial<Layer> = {}): Layer => ({
  id, type: 'text', startMs: 0, endMs: 6000,
  tracks: { x: [k(0, 260)], y: [k(0, 180)] },
  props: {
    slot: { kind: 'text', key }, styleOf: key, text: 'EPISODE 24', fontId: 'body', fontSizePx: 20, weight: 700,
    letterSpacingPct: 0, lineHeight: 1, align: 'left', fill: roleFill('onAccent'), maxWidthPx: null, reveal: { kind: 'none' },
  },
  ...patch,
} as Layer);

const pill: SlotRef = { kind: 'shape', key: 'pill', label: 'Pill', tint: 'accent' };
const nudge = (patch: Partial<SlotTransform>): SlotTransform => ({ offsetX: 0, offsetY: 0, scale: 1, rotation: 0, z: 0, ...patch });

function inputs(patch: Partial<SceneInputs> = {}): SceneInputs {
  return {
    photos: [], texts: {},
    logo: { mediaId: null, sizePct: 12, placement: 'topLeft', x: 0.5, y: 0.5, opacity: 1, lockup: false, lockupText: '' },
    look: { palette, background: 'solid', grain: 0, vignette: 0, speed: 1, cornerRadius: 0 },
    styleOverrides: { texts: {} }, slotTransforms: {},
    ...patch,
  };
}

describe('slot keys', () => {
  it('names shapes and list entries, and reads every key back', () => {
    const refs: SlotRef[] = [
      { kind: 'photo', index: 2 },
      { kind: 'text', key: 'headline' },
      { kind: 'text', key: 'steps', item: 1 },
      pill,
    ];
    expect(refs.map(slotKey)).toEqual(['photo:2', 'text:headline', 'text:steps#1', 'shape:pill']);
    expect(parseSlotKey('photo:2')).toEqual({ kind: 'photo', index: 2 });
    expect(parseSlotKey('text:steps#1')).toEqual({ kind: 'text', id: 'steps', item: 1 });
    expect(parseSlotKey('text:headline')).toEqual({ kind: 'text', id: 'headline' });
    expect(parseSlotKey('shape:pill')).toEqual({ kind: 'shape', name: 'pill' });
    expect(parseSlotKey('logo')).toBeNull();
  });
});

describe('a follower', () => {
  const leader = text('t', 'eyebrow');
  const follower = shape('p', pill, {
    follows: 'text:eyebrow',
    tracks: { x: [k(0, 300)], y: [k(0, 200)], scaleX: [k(0, 0), k(400, 1, 'outBack')], scaleY: [k(0, 0), k(400, 1, 'outBack')] },
  });

  const moved = (t: SlotTransform): Layer => {
    const out = applySlotTransforms([follower, leader], { 'text:eyebrow': t }, design);
    const first = out[0];
    if (!first) throw new Error('missing');
    return first;
  };

  it('moves with its words, keeping its own entrance exactly', () => {
    const out = moved(nudge({ offsetX: 0.1, offsetY: -0.05 }));
    expect(out.tracks.x).toEqual([k(0, 400)]);
    expect(out.tracks.y).toEqual([k(0, 150)]);
    expect(out.tracks.scaleX).toBe(follower.tracks.scaleX);
  });

  it('turns and grows about its words, as if the two were one', () => {
    const n = nudge({ offsetX: 0.05, offsetY: -0.02, scale: 1.4, rotation: 20 });
    const out = moved(n);
    const want = carry({ x: 300, y: 200 }, { x: 260, y: 180 }, n, design);
    const at = resolveProps(out.tracks, 1000, createProps());
    expect(at.x).toBeCloseTo(want.x, 6);
    expect(at.y).toBeCloseTo(want.y, 6);
    expect(at.scaleX).toBeCloseTo(1.4, 6);
    expect(at.rotation).toBeCloseTo(20, 6);
    // Its own pop survives, multiplied, with its overshoot.
    expect(resolveProps(out.tracks, 0, createProps()).scaleX).toBeCloseTo(0, 6);
    expect(sampleTrack(out.tracks.scaleX ?? [], 200) ?? 0).toBeGreaterThan(sampleTrack(follower.tracks.scaleX ?? [], 200) ?? 0);
  });

  it('follows a leader that moves, sampled densely', () => {
    const sliding = text('t', 'eyebrow', { tracks: { x: [k(0, 0), k(1000, 500)], y: [k(0, 180)] } });
    const n = nudge({ scale: 2 });
    const out = applySlotTransforms([follower, sliding], { 'text:eyebrow': n }, design)[0];
    for (const ms of [0, 250, 500, 1000]) {
      const a = { x: sampleTrack(sliding.tracks.x ?? [], ms) ?? 0, y: 180 };
      const want = carry({ x: 300, y: 200 }, a, n, design);
      expect(sampleTrack(out?.tracks.x ?? [], ms)).toBeCloseTo(want.x, 3);
    }
  });

  it('is stacked with its leader: brought to the front, it stays right behind', () => {
    const other = shape('o', { kind: 'shape', key: 'other', label: 'Other' });
    const out = applySlotTransforms([follower, leader, other], { 'text:eyebrow': nudge({ z: 1 }) }, design);
    expect(out.map((l) => l.id)).toEqual(['o', 'p', 't']);
  });

  it('costs nothing while nothing is nudged', () => {
    const layers = [follower, leader];
    expect(applySlotTransforms(layers, {}, design)).toBe(layers);
  });
});

describe('part styles', () => {
  const base = [text('t', 'eyebrow'), shape('p', pill, { follows: 'text:eyebrow' })];
  const styled = (shapeOverrides: Record<string, ShapeOverride>, more: Partial<SceneInputs> = {}): readonly Layer[] =>
    applyShapeStyles(base, inputs({ shapeOverrides, ...more }));

  it('is the same array when nothing is overridden', () => {
    expect(hasShapeStyles(inputs())).toBe(false);
    expect(shapeStylesKey(inputs())).toBe('');
    expect(applyShapeStyles(base, inputs())).toBe(base);
  });

  it('recolours the part and keeps its words legible on it', () => {
    const out = styled({ 'shape:pill': { color: { hex: '#1040ff' } } });
    const part = out[1];
    const words = out[0];
    expect(part?.type === 'shape' && part.props.fill).toEqual({ kind: 'color', value: '#1040ff' });
    expect(words?.type === 'text' && resolvePaint(words.props.fill, palette)).toBe('#ffffff');
    const light = styled({ 'shape:pill': { color: { hex: '#fff2a0' } } })[0];
    expect(light?.type === 'text' && resolvePaint(light.props.fill, palette)).toBe('#141418');
  });

  it('leaves words beside a recoloured part, not on it, in their own colour', () => {
    const footer = text('f', 'footer');
    const words = footer.type === 'text' ? { ...footer, props: { ...footer.props, fill: roleFill('inkMuted') } } : footer;
    const rule = shape('r', { kind: 'shape', key: 'rule', label: 'Rule' }, { follows: 'text:footer' });
    const out = applyShapeStyles([words, rule], inputs({ shapeOverrides: { 'shape:rule': { color: { hex: '#00ff00' } } } }));
    expect(out[0]).toBe(words);
  });

  it('keeps a see-through piece see-through', () => {
    const sheen = shape('s', pill, {}, roleFill('accent', 0.3));
    const out = applyShapeStyles([sheen], inputs({ shapeOverrides: { 'shape:pill': { color: { role: 'ink' } } } }));
    expect(out[0]?.type === 'shape' && out[0].props.fill).toEqual(roleFill('ink', 0.3));
  });

  it('drops a deleted part, and its words fall back to the text colour', () => {
    const out = styled({ 'shape:pill': { hidden: true } });
    expect(out.map((l) => l.id)).toEqual(['t']);
    expect(out[0]?.type === 'text' && out[0].props.fill).toEqual(roleFill('ink'));
  });

  it("puts a text slot's colour on every layer set in its style, without a rebuild", () => {
    const out = styled({}, { styleOverrides: { texts: { eyebrow: { color: '#ff0000' } } } });
    expect(out[0]?.type === 'text' && out[0].props.fill).toEqual({ kind: 'color', value: '#ff0000' });
  });

  it('lists every part once, with what it can change', () => {
    const chip = shape('c', { kind: 'shape', key: 'chip', label: 'Chip', tint: 'surface' }, {}, roleFill('surface'));
    const withEdge = chip.type === 'shape' ? { ...chip, props: { ...chip.props, stroke: { paint: roleFill('ink', 0.12), width: 1 } } } : chip;
    expect(partsIn([...base, withEdge, withEdge]).map((p) => [p.key, p.tint, p.hasOutline])).toEqual([
      ['shape:pill', 'accent', false],
      ['shape:chip', 'surface', true],
    ]);
  });

  it('counts a list’s entries and names them', () => {
    const steps: Layer[] = [
      text('a', 'steps', { props: { ...(base[0] as Extract<Layer, { type: 'text' }>).props, slot: { kind: 'text', key: 'steps', item: 0, label: 'Step 1' } } }),
      shape('d', { kind: 'shape', key: 'step2', label: 'Step 2’s number', text: { slot: 'stepNumbers', item: 1 } }),
    ];
    expect(entriesDrawn(steps, 'steps')).toBe(1);
    expect(entriesDrawn(steps, 'stepNumbers')).toBe(2);
    expect(labelIn(steps, 'text:steps#0')).toBe('Step 1');
  });
});

describe('part boxes', () => {
  const measure: TextMeasureContext = { font: '', letterSpacing: '', textBaseline: 'alphabetic', measureText: (t: string) => ({ width: t.length * 10 }) };
  const drawn = (layers: readonly Layer[]) => ({ sceneId: 's', layers, design: projectDesign('1:1') });

  it('labels a part, and gives none to a deleted or scattered one', () => {
    const scattered = shape('c', { kind: 'shape', key: 'confetti', label: 'Confetti', pick: false });
    const layers = [shape('p', pill), scattered];
    expect(slotBoxes(drawn(layers), 0, { slotTransforms: {} }, '1:1', measure).map((b) => b.label)).toEqual(['Pill']);
    expect(slotBoxes(drawn(layers), 0, { slotTransforms: {}, shapeOverrides: { 'shape:pill': { hidden: true } } }, '1:1', measure)).toEqual([]);
  });

  it('puts a follower’s box where its leader carried it', () => {
    const layers = [shape('p', pill, { follows: 'text:eyebrow' }), text('t', 'eyebrow')];
    const t = nudge({ offsetX: 0.1 });
    const [box] = slotBoxes(drawn(layers), 0, { slotTransforms: { 'text:eyebrow': t } }, '1:1', measure);
    expect(box?.key).toBe('shape:pill');
    expect(box?.box.cx).toBeCloseTo(300 + 0.1 * 1080, 3);
  });

  it('picks a group part by its whole extent, and says what typing into it changes', () => {
    const group: Layer = {
      id: 'g', type: 'group', startMs: 0, endMs: 6000, tracks: { x: [k(0, 500)], y: [k(0, 500)] },
      props: { slot: { kind: 'shape', key: 'mark', label: 'Brand mark', text: { slot: 'mark' } }, box: { x: -40, y: -20, w: 80, h: 40 } },
      children: [shape('tile', undefined, { tracks: { x: [k(0, -20)], y: [k(0, 0)] } })],
    };
    const [box] = slotBoxes(drawn([group]), 0, { slotTransforms: {} }, '1:1', measure);
    expect(box?.box).toMatchObject({ cx: 500, cy: 500, w: 80, h: 40 });
    expect(box?.edits).toEqual({ slot: 'mark' });
  });
});
