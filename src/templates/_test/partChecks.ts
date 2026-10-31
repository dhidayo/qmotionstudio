import { describe, expect, it } from 'vitest';
import { projectDesign, safeBox } from '@/core/render/bounds';
import { slotKey, slotOf } from '@/core/render/slots';
import type { TextMeasureContext } from '@/core/text/layout';
import { ASPECTS, type Aspect, type Layer, type Palette } from '@/core/types';
import type { SceneInputs } from '@/document/types';
import { createBuildContext } from '../buildContext';
import type { SceneVariant } from '../catalog';
import type { SceneTemplate } from '../schema';

/**
 * The checks every family converted to parts (D-159) is held to — for tests
 * only. A shape the design draws is a part, moves with one (follows) or is a
 * piece inside one; only the ground and its glow stay put. Every follower's
 * leader is a sibling that follows nothing; every text the person can type
 * into is tagged.
 */

const measure: TextMeasureContext = { font: '', letterSpacing: '', textBaseline: 'alphabetic', measureText: (t: string) => ({ width: t.length * 10 }) };
const palette: Palette = { bg: '#0e1b3d', surface: '#1a2b57', ink: '#f4f6fb', inkMuted: '#9aa7c7', accent: '#f3b23f' };

export function sampleInputs(template: SceneTemplate, texts: Readonly<Record<string, string>> = {}): SceneInputs {
  return {
    photos: Array.from({ length: template.photoSlots.default }, (_, i) => ({ mediaId: `m${i}`, frame: '3:4' as const, sizeMode: 'template' as const, sizePct: 100, cropMode: 'template' as const })),
    texts,
    logo: { mediaId: null, sizePct: 12, placement: 'bottomRight', x: 0.5, y: 0.5, opacity: 1, lockup: false, lockupText: '' },
    look: { palette, background: 'gradient', grain: 0, vignette: 0, speed: 1, cornerRadius: 24 },
    styleOverrides: { texts: {} },
    slotTransforms: {},
  };
}

export function* flatten(layers: readonly Layer[]): Generator<Layer> {
  for (const layer of layers) {
    yield layer;
    if (layer.type === 'group' || layer.type === 'mask') yield* flatten(layer.children);
  }
}

export function buildVariant(template: SceneTemplate, variant: SceneVariant, aspect: Aspect = '16:9', texts: Readonly<Record<string, string>> = {}): Layer[] {
  const design = projectDesign(aspect);
  const ctx = createBuildContext({ design, safe: safeBox(design), palette, durationMs: variant.durationMs, measureContext: measure });
  return template.build(sampleInputs(template, texts), ctx);
}

/**
 * What stays unpicked on purpose (D-159): light — glows, scrims, pools, all
 * gradients — and shapes that fill much of the frame, such as the doors a
 * split reveal opens or a flash between cuts. A part that size would take
 * every click meant for the background (D-120).
 */
export function unpicked(layer: Layer, design: { readonly w: number; readonly h: number }): boolean {
  if (layer.type === 'gradient') return true;
  return layer.type === 'shape' && layer.props.w * layer.props.h >= design.w * design.h * 0.4;
}

/** The three part checks, for each of a family's designs. */
export function describePartChecks(variants: readonly SceneVariant[], create: (variant: SceneVariant) => SceneTemplate): void {
  describeTemplateChecks(variants.map((variant) => ({ template: create(variant), variant })));
}

/** The same, for templates already made — the designs built a layer at a time, or the whole library. */
export function describeTemplateChecks(list: readonly { readonly template: SceneTemplate; readonly variant?: SceneVariant }[]): void {
  const entries = list.map(({ template, variant }) => [template.id, template, variant ?? ({ id: template.id, durationMs: template.defaultDurationMs } as SceneVariant)] as const);
  describe.each(entries)('%s, part by part', (_id, template, variant) => {

    it('leaves no decoration fixed', () => {
      for (const aspect of ASPECTS) {
        const design = projectDesign(aspect);
        const fixed = (layers: readonly Layer[]): string[] => layers.flatMap((layer) => {
          if (slotOf(layer) !== null || layer.follows !== undefined || unpicked(layer, design)) return [];
          if (layer.type === 'shape' || layer.type === 'gradient') return [layer.id];
          return layer.type === 'mask' || layer.type === 'group' ? fixed(layer.children) : [];
        });
        const [, ...rest] = buildVariant(template, variant, aspect);
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
      for (const aspect of ASPECTS) check(buildVariant(template, variant, aspect));
    });

    it('keeps every text the person can type into tagged', () => {
      // Words inside a part (a badge's, a quotation mark) are the part's: it is what is picked.
      const loose = (layers: readonly Layer[]): Layer[] => layers.flatMap((l) => (slotOf(l)?.kind === 'shape' ? [] : l.type === 'group' || l.type === 'mask' ? loose(l.children) : [l]));
      const untagged = loose(buildVariant(template, variant)).filter((l) => l.type === 'text' && slotOf(l) === null && !l.props.styleOf);
      expect(untagged.map((l) => l.id)).toEqual([]);
    });
  });
}
