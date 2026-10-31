import { describe, expect, it } from 'vitest';
import { projectDesign, safeBox } from '@/core/render/bounds';
import { slotKey, slotOf } from '@/core/render/slots';
import type { TextMeasureContext } from '@/core/text/layout';
import { ASPECTS, type Aspect, type Layer, type Palette } from '@/core/types';
import type { SceneInputs } from '@/document/types';
import { createBuildContext } from '../buildContext';
import { BUSINESS_SCENES } from '../_catalog/business';
import type { SceneTemplate } from '../schema';
import { create } from './business';

/**
 * Business, part by part (D-159): every frame, card, badge and line is the
 * person's to change. A shape the design draws is a part, moves with one
 * (follows), or is a piece inside one; only the ground and its glow stay put.
 */

const measure: TextMeasureContext = { font: '', letterSpacing: '', textBaseline: 'alphabetic', measureText: (t: string) => ({ width: t.length * 10 }) };
const palette: Palette = { bg: '#0e1b3d', surface: '#1a2b57', ink: '#f4f6fb', inkMuted: '#9aa7c7', accent: '#f3b23f' };

function inputs(template: SceneTemplate, texts: Readonly<Record<string, string>> = {}): SceneInputs {
  return {
    photos: Array.from({ length: template.photoSlots.default }, (_, i) => ({ mediaId: `m${i}`, frame: '3:4' as const, sizeMode: 'template' as const, sizePct: 100, cropMode: 'template' as const })),
    texts,
    logo: { mediaId: null, sizePct: 12, placement: 'bottomRight', x: 0.5, y: 0.5, opacity: 1, lockup: false, lockupText: '' },
    look: { palette, background: 'gradient', grain: 0, vignette: 0, speed: 1, cornerRadius: 24 },
    styleOverrides: { texts: {} },
    slotTransforms: {},
  };
}

function* flatten(layers: readonly Layer[]): Generator<Layer> {
  for (const layer of layers) {
    yield layer;
    if (layer.type === 'group' || layer.type === 'mask') yield* flatten(layer.children);
  }
}

describe.each(BUSINESS_SCENES.map((v) => [v.id, v] as const))('%s, part by part', (_id, variant) => {
  const template = create(variant);
  const build = (aspect: Aspect = '16:9', texts: Readonly<Record<string, string>> = {}): Layer[] => {
    const design = projectDesign(aspect);
    const ctx = createBuildContext({ design, safe: safeBox(design), palette, durationMs: variant.durationMs, measureContext: measure });
    return template.build(inputs(template, texts), ctx);
  };

  it('leaves no decoration fixed', () => {
    for (const aspect of ASPECTS) {
      const fixed = (layers: readonly Layer[]): string[] => layers.flatMap((layer) => {
        if (slotOf(layer) !== null || layer.follows !== undefined) return [];
        if (layer.type === 'shape' || layer.type === 'gradient') return layer.id.startsWith('glow-') || layer.id.startsWith('background') ? [] : [layer.id];
        return layer.type === 'mask' || layer.type === 'group' ? fixed(layer.children) : [];
      });
      const [, ...rest] = build(aspect);
      expect(fixed(rest), aspect).toEqual([]);
    }
  });

  it('only follows a sibling that is there and follows nothing itself', () => {
    const check = (layers: readonly Layer[]): void => {
      const leaders = new Map(layers.flatMap((l) => {
        const slot = slotOf(l);
        return slot ? [[slotKey(slot), l] as const] : [];
      }));
      for (const layer of layers) {
        if (layer.follows !== undefined) {
          const leader = leaders.get(layer.follows);
          expect(leader, `${layer.id} follows ${layer.follows}`).toBeDefined();
          expect(leader?.follows, `${layer.follows} follows something itself`).toBeUndefined();
        }
        if (layer.type === 'group' || layer.type === 'mask') check(layer.children);
      }
    };
    for (const aspect of ASPECTS) check(build(aspect));
  });

  it('keeps every text the person can type into tagged', () => {
    const untagged = [...flatten(build())].filter((l) => l.type === 'text' && slotOf(l) === null && !l.props.styleOf);
    expect(untagged.map((l) => l.id)).toEqual([]);
  });
});

describe('business numbers and entries (D-159)', () => {
  const textsOf = (id: string, texts: Readonly<Record<string, string>>): string[] => {
    const variant = BUSINESS_SCENES.find((v) => v.id === id);
    if (!variant) throw new Error(id);
    const template = create(variant);
    const design = projectDesign('16:9');
    const ctx = createBuildContext({ design, safe: safeBox(design), palette, durationMs: variant.durationMs, measureContext: measure });
    return [...flatten(template.build(inputs(template, texts), ctx))].flatMap((l) => (l.type === 'text' ? [l.props.text] : []));
  };

  it('numbers the steps in the pattern typed', () => {
    expect(textsOf('biz-how-it-works', { stepNumbers: 'A' })).toEqual(expect.arrayContaining(['A', 'B', 'C', 'D']));
  });

  it('shows the like counts typed', () => {
    expect(textsOf('biz-social-feed', { likes: '5, 10' }).filter((t) => t.startsWith('♥')).slice(0, 3)).toEqual(['♥ 5   @yourbrand', '♥ 10   @yourbrand', '♥ 11   @yourbrand']);
  });

  it('keeps the featured badge and the LIVE badge typed into', () => {
    expect(textsOf('biz-pricing', { badge: 'BEST VALUE' })).toContain('BEST VALUE');
    expect(textsOf('biz-webinar', { live: 'ON AIR' })).toContain('ON AIR');
  });
});
