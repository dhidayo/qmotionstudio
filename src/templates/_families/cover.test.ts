import { describe, expect, it } from 'vitest';
import { resolveProps } from '@/core/anim/interpolate';
import { projectDesign, safeBox } from '@/core/render/bounds';
import { layoutText, type TextMeasureContext } from '@/core/text/layout';
import { ASPECTS, type Layer, type Palette } from '@/core/types';
import type { SceneInputs } from '@/document/types';
import { createBuildContext } from '../buildContext';
import { COVER_SCENES } from '../_catalog/covers';
import type { SceneTemplate } from '../schema';
import { contentFloor } from '../_shared/chrome';
import { create } from './cover';
import { slotKey, slotOf } from '@/core/render/slots';

/**
 * Covers & Thumbnails (D-151): "Text must never overflow the frame." The
 * words are fitted to their column, so however long the person's copy runs —
 * up to each text's own limit — every line stays inside the frame and above
 * the band the free-tier mark uses, in every frame shape.
 *
 * Measured with a stand-in that is wider than the real faces (0.6 of the size
 * per letter), so a pass here leaves room to spare in the browser.
 */

const measure: TextMeasureContext = {
  font: '',
  letterSpacing: '',
  textBaseline: 'alphabetic',
  measureText(text: string) {
    const size = Number(/(\d+(?:\.\d+)?)px/.exec(this.font)?.[1] ?? 10);
    return { width: text.length * size * 0.6 };
  },
};

const palette: Palette = { bg: '#0e1b3d', surface: '#1a2b57', ink: '#f4f6fb', inkMuted: '#9aa7c7', accent: '#f3b23f' };

function inputs(template: SceneTemplate, texts: Readonly<Record<string, string>>): SceneInputs {
  return {
    photos: Array.from({ length: template.photoSlots.default }, (_, i) => ({ mediaId: `m${i}`, frame: '3:4' as const, sizeMode: 'template' as const, sizePct: 100, cropMode: 'template' as const })),
    texts,
    logo: { mediaId: null, sizePct: 12, placement: 'bottomRight', x: 0.5, y: 0.5, opacity: 1, lockup: false, lockupText: '' },
    look: { palette, background: 'gradient', grain: 0, vignette: 0, speed: 1, cornerRadius: 24 },
    styleOverrides: { texts: {} },
    slotTransforms: {},
  };
}

/** Copy as long as each text allows, in real words: what a wordy marketing team would type. */
function longCopy(template: SceneTemplate): Record<string, string> {
  const prose = 'Our biggest and most important announcement of the whole year is finally here for everyone';
  const list = 'Partnerships, Content, Social, Growth, Community, Events';
  const texts: Record<string, string> = {};
  for (const slot of template.textSlots) {
    const source = slot.label.includes('separated by commas') ? list : slot.id === 'figure' ? '+1,250,000' : prose;
    const cut = source.slice(0, slot.maxChars);
    texts[slot.id] = cut.length < source.length && cut.includes(' ') ? cut.slice(0, cut.lastIndexOf(' ')) : cut;
  }
  return texts;
}

function* flatten(layers: readonly Layer[]): Generator<Layer> {
  for (const layer of layers) {
    yield layer;
    if (layer.type === 'group' || layer.type === 'mask') yield* flatten(layer.children);
  }
}

/** Every layer with where its parent puts it: a part (D-159) is a group at its centre, its pieces placed round it. */
function* placedIn(layers: readonly Layer[], ms: number, ox = 0, oy = 0): Generator<{ layer: Layer; ox: number; oy: number }> {
  for (const layer of layers) {
    yield { layer, ox, oy };
    if (layer.type === 'group' || layer.type === 'mask') {
      const at = resolveProps(layer.tracks, ms - layer.startMs);
      yield* placedIn(layer.children, ms - layer.startMs, ox + at.x, oy + at.y);
    }
  }
}

describe.each(COVER_SCENES.map((v) => [v.id, v] as const))('%s', (_id, variant) => {
  const template = create(variant);

  it.each([['its own copy', false], ['copy as long as it allows', true]] as const)('keeps every line inside the frame and above the floor, with %s', (_label, long) => {
    for (const aspect of ASPECTS) {
      const design = projectDesign(aspect);
      const safe = safeBox(design);
      const ctx = createBuildContext({ design, safe, palette, durationMs: variant.durationMs, measureContext: measure });
      const layers = template.build(inputs(template, long ? longCopy(template) : {}), ctx);
      const floor = contentFloor(design, safe);
      for (const { layer, ox, oy } of placedIn(layers, variant.durationMs - 1)) {
        if (layer.type !== 'text') continue;
        const { props } = layer;
        const run = layoutText(measure, {
          text: props.text, font: `${props.weight} ${props.fontSizePx}px x`, fontSizePx: props.fontSizePx,
          letterSpacingPx: (props.letterSpacingPct / 100) * props.fontSizePx, lineHeight: props.lineHeight, align: props.align, maxWidthPx: props.maxWidthPx,
        });
        const own = resolveProps(layer.tracks, variant.durationMs - 1);
        const at = { x: own.x + ox, y: own.y + oy };
        const box = props.maxWidthPx ?? run.width;
        const left = at.x - box * (layer.anchorX ?? 0.5) + (props.align === 'left' ? 0 : props.align === 'right' ? box - run.width : (box - run.width) / 2);
        const where = `"${props.text.slice(0, 24)}" at ${aspect}`;
        expect.soft(left, `${where} starts left of the frame`).toBeGreaterThanOrEqual(-1);
        expect.soft(left + run.width, `${where} runs off the right`).toBeLessThanOrEqual(design.w + 1);
        expect.soft(at.y, `${where} starts above the frame`).toBeGreaterThanOrEqual(-1);
        expect.soft(at.y + run.height, `${where} sinks below the floor`).toBeLessThanOrEqual(floor + 1);
      }
    }
  });

  it('draws nothing for a text the person has deleted, and no shape that went with it', () => {
    const emptied = Object.fromEntries(template.textSlots.map((slot) => [slot.id, '']));
    const design = projectDesign('16:9');
    const ctx = createBuildContext({ design, safe: safeBox(design), palette, durationMs: variant.durationMs, measureContext: measure });
    const layers = [...flatten(template.build(inputs(template, emptied), ctx))];
    expect(layers.filter((layer) => layer.type === 'text' && layer.props.slot !== undefined)).toEqual([]);
    for (const prefix of ['mark-', 'eyebrowPill-', 'button-', 'footRule-', 'chip-', 'listDisc-', 'optionPill-', 'livePill-', 'sticker-']) {
      expect(layers.map((layer) => layer.id).filter((id) => id.startsWith(prefix)), prefix).toEqual([]);
    }
  });
});

/**
 * Every decoration is the person's to change (D-159): "The T and the
 * background box cannot be modified, changed, or customized." A shape the
 * cover draws is a part, moves with one (follows), or is a piece inside one;
 * only the ground stays put.
 */
describe.each(COVER_SCENES.map((v) => [v.id, v] as const))('%s, part by part', (_id, variant) => {
  const template = create(variant);
  const build = (texts: Readonly<Record<string, string>> = {}, aspect: (typeof ASPECTS)[number] = '16:9'): Layer[] => {
    const design = projectDesign(aspect);
    const ctx = createBuildContext({ design, safe: safeBox(design), palette, durationMs: variant.durationMs, measureContext: measure });
    return template.build(inputs(template, texts), ctx);
  };

  it('leaves no decoration fixed', () => {
    for (const aspect of ASPECTS) {
      const [, ...rest] = build({}, aspect);
      const fixed = (layers: readonly Layer[]): string[] => layers.flatMap((layer) => {
        const tagged = slotOf(layer) !== null || layer.follows !== undefined;
        if (tagged) return [];
        if (layer.type === 'shape' || layer.type === 'gradient') return [layer.id];
        return layer.type === 'mask' || layer.type === 'group' ? fixed(layer.children) : [];
      });
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
    check(build());
  });

  it('names every part', () => {
    for (const layer of flatten(build())) {
      const slot = slotOf(layer);
      if (slot?.kind === 'shape') expect(slot.label.length, layer.id).toBeGreaterThan(2);
    }
  });
});

describe('cover words drawn inside parts (D-159)', () => {
  const variant = (id: string) => {
    const found = COVER_SCENES.find((v) => v.id === id);
    if (!found) throw new Error(id);
    return found;
  };
  const textsIn = (id: string, texts: Readonly<Record<string, string>>): string[] => {
    const template = create(variant(id));
    const design = projectDesign('16:9');
    const ctx = createBuildContext({ design, safe: safeBox(design), palette, durationMs: 6000, measureContext: measure });
    return [...flatten(template.build(inputs(template, texts), ctx))].flatMap((l) => (l.type === 'text' ? [l.props.text] : []));
  };

  it("takes the brand mark's letter from the company name until one is typed", () => {
    expect(textsIn('tn-youtube-bold', {})).toContain('Y');
    expect(textsIn('tn-youtube-bold', { brand: 'Quarry' })).toContain('Q');
    expect(textsIn('tn-youtube-bold', { brand: 'Quarry', mark: 'Z' })).toContain('Z');
  });

  it('numbers steps and pillars in the pattern typed', () => {
    expect(textsIn('tn-how-to', { stepNumbers: 'A' })).toEqual(expect.arrayContaining(['A', 'B', 'C']));
    expect(textsIn('bp-marketing-strategy', { pillarNumbers: '01, 02, 5' })).toEqual(expect.arrayContaining(['01', '02', '5', '6']));
    expect(textsIn('tn-top-five', { numbers: '5, 4, 3, 2, 1' })).toEqual(expect.arrayContaining(['5', '4', '3', '2', '1']));
  });
});
