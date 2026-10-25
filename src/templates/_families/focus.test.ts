import { describe, expect, it } from 'vitest';
import { projectDesign, safeBox } from '@/core/render/bounds';
import type { TextMeasureContext } from '@/core/text/layout';
import type { Aspect, Layer, Palette } from '@/core/types';
import { fontString } from '@/fonts/registry';
import { SCENE_VARIANTS } from '../catalog';
import { createBuildContext } from '../buildContext';
import { TEMPLATE_MANIFEST } from '../manifest';
import { loadSceneTemplate } from '../registry';
import { measureFocus, sampleInputs, type FocusMeasurement } from '../_test/focusMeasure';
import { specFor } from '../_shared/text';

/**
 * D-157: one photo in focus at every moment, for the photo families of Ring
 * Path, Flow Track, Marquee, Tile Field, Deck Motion and Photo Collage (part
 * 1), Depth Stage, Hero Stage, Timeline, Product Display and Business, and
 * the hand-written Angle Stage, Depth Stage and Split Frame designs (part 2).
 *
 * Every multi-photo design keeps one clear focus (the heaviest photo at least
 * 1.5× the next) for at least 80% of the moments after its entrance, in every
 * frame shape; its library still and image resting frame (`posterAtMs`) land
 * on a clear focus; and the photo in focus stays inside the frame and above
 * the content floor — and, round a collage's centred words, clear of them.
 */

const FAMILIES = new Set(['orbit', 'flow', 'marquee', 'tiles', 'deck', 'halo', 'depth', 'hero', 'timeline', 'product', 'business']);
/** The hand-written folders whose designs are held to it too. */
const FOLDERS = /^(angle|depth|split)-/;
const ASPECTS: readonly Aspect[] = ['1:1', '9:16', '16:9', '4:5'];

/** Designs whose subject is the top of a pile: the top card covers the rest, which the measure cannot see. */
const STACKS: Readonly<Record<string, string>> = {
  'flow-stack-push': 'a notification pile: the newest card covers the ones beneath, which darken by depth',
  'deck-story-pile': 'a pile of stories: the top card covers the ones beneath, which darken by depth',
  'hero-peel-deck': 'a deck: the top card covers the next until it peels away to show it',
  'biz-case-studies': 'windows stepping forward: the newest covers the ones behind, which step back',
  'depth-stack': 'a dealt stack: the front card covers the rest',
  // Not piles, but deliberately even: the point is the two side by side.
  'pd-compare': 'before and after: two photos the size of the frame, compared across a divider',
  'split-pair': 'two photos meeting on a seam, compared side by side',
  'biz-webinar': 'the speaker beside their slides, a pair held together throughout',
};

/** Designs whose focused photo may pass the edges: reel strips slide through their window as they spin. */
const SLIDING: Readonly<Record<string, string>> = {
  'tile-slot-reels': 'the winning reel keeps its light while its strip spins through the window',
  'tile-column-fall': 'the winning column keeps its light while its strip slides through the window',
  'depth-tunnel': 'held whole at the nearest station, each photo then flies out past the camera, over the frame’s edge',
  // Full-frame designs: the photo in focus is the picture, edge to edge.
  'pd-compare': 'two photos the size of the frame',
  'split-inset': 'the main photo fills the frame, the rest inset over it',
  'split-panels': 'panels divide the whole frame, edge to edge',
  ...Object.fromEntries(SCENE_VARIANTS.filter((v) => v.id.startsWith('reveal-')).map((v) => [v.id, 'a full-frame photo'])),
};

/** A design held to the rule: its id, and where its still is taken. */
type Design = { readonly id: string; readonly family: string; readonly posterAtMs?: number };

const variants: readonly Design[] = [
  ...SCENE_VARIANTS.filter((v) => FAMILIES.has(v.family) && v.photos.default >= 2),
  ...TEMPLATE_MANIFEST.filter((t) => FOLDERS.test(t.id) && t.kind === 'scene').map((t) => ({ id: t.id, family: t.category, ...(t.posterAtMs === undefined ? {} : { posterAtMs: t.posterAtMs }) })),
];
/** Hand-written designs are listed by folder, so those with fewer than two photos are dropped once loaded. */
const multi = new Map<string, boolean>();
async function manyPhotos(v: Design): Promise<boolean> {
  const hit = multi.get(v.id);
  if (hit !== undefined) return hit;
  const many = (await loadSceneTemplate(v.id)).photoSlots.default >= 2;
  multi.set(v.id, many);
  return many;
}

const cache = new Map<string, FocusMeasurement>();
async function measured(v: Design, aspect: Aspect): Promise<FocusMeasurement> {
  const key = `${v.id}@${aspect}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const m = measureFocus(await loadSceneTemplate(v.id), aspect);
  cache.set(key, m);
  return m;
}

describe('D-157: one photo in focus', () => {
  it('covers every multi-photo design of the families and folders', () => {
    // 68 in part 1; 52 family designs and 15 hand-written ones in part 2.
    expect(variants.length).toBeGreaterThanOrEqual(135);
  });

  it.each(variants.filter((v) => !(v.id in STACKS)).map((v) => [v.id, v] as const))('%s keeps one clear focus in every frame shape', async (_, v) => {
    if (!(await manyPhotos(v))) return;
    for (const aspect of ASPECTS) {
      const m = await measured(v, aspect);
      expect({ aspect, share: m.clearShare >= 0.8 ? 'clear' : m.clearShare }).toEqual({ aspect, share: 'clear' });
    }
  });

  it.each(variants.filter((v) => !(v.id in STACKS)).map((v) => [v.id, v] as const))('%s rests on a clear focus', async (_, v) => {
    if (!(await manyPhotos(v))) return;
    expect(v.posterAtMs).toBeDefined();
    const template = await loadSceneTemplate(v.id);
    for (const aspect of ASPECTS) {
      const at = measureFocus(template, aspect, { fromMs: v.posterAtMs ?? 0, stepMs: 1e9 }).moments[0];
      expect({ aspect, ratio: (at?.ratio ?? 0) >= 1.6 ? 'clear' : at?.ratio }).toEqual({ aspect, ratio: 'clear' });
    }
  });

  it.each(variants.filter((v) => !(v.id in SLIDING)).map((v) => [v.id, v] as const))('%s keeps the photo in focus inside the frame, above the floor', async (_, v) => {
    if (!(await manyPhotos(v))) return;
    for (const aspect of ASPECTS) {
      const m = await measured(v, aspect);
      // Keyframes are sampled, so a card may stray a hair between two samples.
      const slack = Math.min(m.design.w, m.design.h) * 0.01;
      const strays = m.moments
        .filter((mo) => mo.ratio >= 1.5)
        .filter((mo) => {
          const t = mo.top;
          return t.x - t.w / 2 < -slack || t.x + t.w / 2 > m.design.w + slack || t.y - t.h / 2 < -slack || t.y + t.h / 2 > m.floor + slack;
        })
        .map((mo) => mo.ms);
      expect({ aspect, strays }).toEqual({ aspect, strays: [] });
    }
  });

  it.each(variants.filter((v) => v.family === 'halo').map((v) => [v.id, v] as const))('%s never puts the photo in focus under the words', async (_, v) => {
    const template = await loadSceneTemplate(v.id);
    for (const aspect of ASPECTS) {
      const words = wordsBox(template, aspect);
      const m = await measured(v, aspect);
      const slack = Math.min(m.design.w, m.design.h) * 0.01;
      const covered = m.moments
        .filter((mo) => mo.ratio >= 1.5)
        .filter((mo) => {
          const t = mo.top;
          return Math.abs(t.x - words.cx) < (t.w + words.w) / 2 - slack && Math.abs(t.y - words.cy) < (t.h + words.h) / 2 - slack;
        })
        .map((mo) => mo.ms);
      expect({ aspect, covered }).toEqual({ aspect, covered: [] });
    }
  });
});

const MEASURE: TextMeasureContext = {
  font: '',
  letterSpacing: '',
  textBaseline: 'alphabetic',
  measureText: (text: string) => ({ width: text.length * 10 }),
};
const PALETTE: Palette = { bg: '#0c0c11', surface: '#1b1b27', ink: '#f5f5f7', inkMuted: '#9a9aab', accent: '#7c6cf5' };

/** The box round a collage's words, laid out as `measureFocus` lays them out. */
function wordsBox(template: Awaited<ReturnType<typeof loadSceneTemplate>>, aspect: Aspect): { cx: number; cy: number; w: number; h: number } {
  const design = projectDesign(aspect);
  const ctx = createBuildContext({ design, safe: safeBox(design), palette: PALETTE, durationMs: template.defaultDurationMs, measureContext: MEASURE });
  const texts = template.build(sampleInputs(template), ctx).filter((l): l is Extract<Layer, { type: 'text' }> => l.type === 'text');
  const boxes = texts.map((l) => {
    const run = ctx.measure(specFor(l.props, fontString(l.props.fontId, l.props.fontSizePx, l.props.weight)));
    const x = l.tracks.x?.[0]?.v ?? 0;
    const y = l.tracks.y?.[0]?.v ?? 0;
    return { l: x - run.width * (l.anchorX ?? 0.5), r: x + run.width * (1 - (l.anchorX ?? 0.5)), t: y - run.height * (l.anchorY ?? 0), b: y + run.height * (1 - (l.anchorY ?? 0)) };
  });
  const l = Math.min(...boxes.map((b) => b.l));
  const r = Math.max(...boxes.map((b) => b.r));
  const t = Math.min(...boxes.map((b) => b.t));
  const b = Math.max(...boxes.map((b2) => b2.b));
  return { cx: (l + r) / 2, cy: (t + b) / 2, w: r - l, h: b - t };
}
