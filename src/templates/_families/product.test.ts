import { describe, expect, it } from 'vitest';
import { slotOf } from '@/core/render/slots';
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

  it('moves a spec bullet with its words and the strike with the old price', () => {
    expect(build('pd-spec-sheet').filter((l) => l.id.startsWith('bullet-')).map((l) => l.follows)).toEqual(['text:spec1', 'text:spec2', 'text:spec3']);
    expect(build('pd-price-reveal').find((l) => l.id.startsWith('strike-'))?.follows).toBe('text:was');
  });
});
