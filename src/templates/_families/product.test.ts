import { describe, expect, it } from 'vitest';
import { resolveProps } from '@/core/anim/interpolate';
import { projectDesign } from '@/core/render/bounds';
import { applySlotTransforms, slotOf } from '@/core/render/slots';
import { PRODUCT_SCENES } from '../_catalog/product';
import { buildVariant, describePartChecks, flatten } from '../_test/partChecks';
import { create } from './product';

/** Product Display, part by part (D-159). */
describePartChecks(PRODUCT_SCENES, create);

describe('product parts', () => {
  const build = (id: string, texts: Readonly<Record<string, string>> = {}) => {
    const variant = PRODUCT_SCENES.find((v) => v.id === id);
    if (!variant) throw new Error(id);
    return [...flatten(buildVariant(create(variant), variant, '16:9', texts))];
  };

  it('makes the NEW badge a part typed into, moving with the product', () => {
    const badge = build('pd-new-arrival', { badge: 'SALE' }).find((l) => slotOf(l)?.kind === 'shape' && l.id.startsWith('badge-'));
    expect(badge?.follows).toBe('photo:0');
    expect(badge?.type === 'group' && badge.children.some((c) => c.type === 'text' && c.props.text === 'SALE')).toBe(true);
  });

  it("keeps a callout's dot on the product while its line reaches to the dragged words (D-170)", () => {
    const variant = PRODUCT_SCENES.find((v) => v.id === 'pd-callouts');
    if (!variant) throw new Error('pd-callouts');
    const layers = buildVariant(create(variant), variant, '16:9');
    const callout = layers.find((l) => l.type === 'group' && slotOf(l)?.kind === 'shape' && l.id.startsWith('callout-'));
    if (callout?.type !== 'group') throw new Error('no callout');
    expect(callout.follows).toBe('photo:0');
    const lineOf = (group: typeof callout) => group.children.find((c) => c.reaches === 'text:point1');
    const line = lineOf(callout);
    if (line?.type !== 'shape') throw new Error('no line');

    const design = projectDesign('16:9');
    const nudge = { offsetX: 0.05, offsetY: -0.08, scale: 1, rotation: 0, z: 0 };
    const moved = applySlotTransforms(layers, { 'text:point1': nudge }, design);
    const after = moved.find((l) => l.id === callout.id);
    if (after?.type !== 'group') throw new Error('callout gone');
    // The dot's part has not moved.
    expect(after.tracks).toEqual(callout.tracks);
    const stretched = lineOf(after);
    if (stretched?.type !== 'shape') throw new Error('line gone');
    // The far end, once drawn in: the anchor, plus the line turned and stretched.
    const end = (l: typeof line, ms: number) => {
      const p = resolveProps(l.tracks, ms);
      const length = l.props.w * p.scaleX * ((l.anchorX ?? 0.5) >= 0.5 ? -1 : 1);
      const radians = (p.rotation * Math.PI) / 180;
      return { x: p.x + length * Math.cos(radians), y: p.y + length * Math.sin(radians) };
    };
    const ms = 5000;
    const was = end(line, ms);
    const now = end(stretched, ms);
    expect(now.x - was.x).toBeCloseTo(nudge.offsetX * design.w, 3);
    expect(now.y - was.y).toBeCloseTo(nudge.offsetY * design.h, 3);
    // Its near end, on the dot, stays.
    expect(resolveProps(stretched.tracks, ms).x).toBeCloseTo(resolveProps(line.tracks, ms).x, 6);
    expect(resolveProps(stretched.tracks, ms).y).toBeCloseTo(resolveProps(line.tracks, ms).y, 6);
  });

  it('moves a spec bullet with its words and the strike with the old price', () => {
    expect(build('pd-spec-sheet').filter((l) => l.id.startsWith('bullet-')).map((l) => l.follows)).toEqual(['text:spec1', 'text:spec2', 'text:spec3']);
    expect(build('pd-price-reveal').find((l) => l.id.startsWith('strike-'))?.follows).toBe('text:was');
  });
});
