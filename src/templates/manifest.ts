import type { Aspect } from '@/core/types';
import type { Tier } from './schema';

/**
 * Eager template metadata.
 *
 * The library grid (§1.1) needs names, categories, tiers and thumbnails to
 * render, and it cannot wait on a dynamic import per template to get them.
 * Template *code* stays lazy (see registry.ts); only this table is eager, and
 * it is small enough not to matter.
 *
 * Hand-maintained on purpose — a generated file would be one more thing to keep
 * in the repository and to forget to regenerate. `npm run lint:templates`
 * asserts that this table and the files on disk agree on every field, so drift
 * fails the build rather than shipping a library card that opens the wrong
 * template.
 */

export type TemplateSummary = {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  /**
   * Which library the card belongs in (D-013).
   *
   * Showcase mode lists scene templates; Motion Ads lists ad templates. They
   * are not interchangeable — picking an ad replaces the whole scene list,
   * picking a scene template replaces one scene — so the mode switch filters on
   * this rather than offering both and failing at the click.
   */
  readonly kind: 'scene' | 'ad';
  readonly tier: Tier;
  readonly isNew?: boolean;
  readonly supportedAspects: readonly Aspect[];
  /** Scene templates only; an ad's counts belong to its own beats. */
  readonly photoSlots: { readonly min: number; readonly max: number };
  /** Scene count and total run time, for an ad card's second line. */
  readonly sceneCount?: number;
  readonly durationMs?: number;
  /** One line for the card, and for the template's own accessible description. */
  readonly blurb: string;
  /**
   * When `npm run thumbs` should grab the poster frame, in ms.
   *
   * Templates that cycle need to declare this: a fixed time for everything
   * catches whichever of them happens to be mid-transition at that instant,
   * and a poster showing a card halfway out of frame sells nothing.
   */
  readonly posterAtMs?: number;
};

export const CATEGORIES: readonly string[] = [
  'Story Ads', 'Depth Stage', 'Angle Stage', 'Kinetic Type', 'Split Frame',
];

export const TEMPLATE_MANIFEST: readonly TemplateSummary[] = [
  {
    id: 'launch-story',
    name: 'Launch Story',
    category: 'Story Ads',
    kind: 'ad',
    tier: 'free',
    isNew: true,
    supportedAspects: ['9:16', '4:5', '1:1', '4:3'],
    photoSlots: { min: 1, max: 8 },
    sceneCount: 8,
    durationMs: 30_000,
    blurb: 'Eight beats: hook, proof, close. The full launch reel.',
    posterAtMs: 1_800,
  },
  {
    id: 'product-drop',
    name: 'Product Drop',
    category: 'Story Ads',
    kind: 'ad',
    tier: 'pro',
    supportedAspects: ['9:16', '4:5', '1:1', '16:9'],
    photoSlots: { min: 1, max: 6 },
    sceneCount: 7,
    durationMs: 25_500,
    blurb: 'Seven cold, tight beats built around two phrase swaps.',
    posterAtMs: 1_600,
  },
  {
    id: 'quick-pitch',
    name: 'Quick Pitch',
    category: 'Story Ads',
    kind: 'ad',
    tier: 'free',
    isNew: true,
    supportedAspects: ['9:16', '4:5', '1:1', '4:3', '16:9'],
    photoSlots: { min: 1, max: 5 },
    sceneCount: 5,
    durationMs: 15_000,
    blurb: 'Five beats in fifteen seconds — the whole free-tier cap, used well.',
    posterAtMs: 1_600,
  },
  {
    id: 'depth-parallax',
    name: 'Parallax Depth',
    category: 'Depth Stage',
    kind: 'scene',
    tier: 'free',
    supportedAspects: ['16:9', '4:3', '1:1', '4:5', '9:16'],
    photoSlots: { min: 2, max: 6 },
    blurb: 'Photos on receding planes drifting at different speeds.',
  },
  {
    id: 'depth-stack',
    name: 'Card Stack',
    category: 'Depth Stage',
    kind: 'scene',
    tier: 'free',
    isNew: true,
    supportedAspects: ['1:1', '4:5', '9:16', '4:3'],
    photoSlots: { min: 2, max: 8 },
    blurb: 'A stack of cards dealing forward one at a time.',
    // Mid-turn, after the stack has settled and before the next card leaves.
    posterAtMs: 4_200,
  },
  {
    id: 'angle-fan',
    name: 'Fan Out',
    category: 'Angle Stage',
    kind: 'scene',
    tier: 'free',
    supportedAspects: ['16:9', '4:3', '1:1', '4:5', '9:16'],
    photoSlots: { min: 3, max: 8 },
    blurb: 'Photos fanned across an arc, springing in from the centre.',
  },
  {
    id: 'angle-tilt',
    name: 'Tilt Sweep',
    category: 'Angle Stage',
    kind: 'scene',
    tier: 'pro',
    supportedAspects: ['16:9', '4:3', '1:1', '4:5', '9:16'],
    photoSlots: { min: 2, max: 6 },
    blurb: 'A tilted row sweeping past, nearest photo largest.',
  },
  {
    id: 'split-pair',
    name: 'Split Pair',
    category: 'Split Frame',
    kind: 'scene',
    tier: 'free',
    isNew: true,
    supportedAspects: ['16:9', '4:3', '1:1', '4:5', '9:16'],
    photoSlots: { min: 2, max: 2 },
    blurb: 'Two photos meeting on a seam — before and after, side by side.',
    // After the halves have landed and the type has arrived.
    posterAtMs: 2_000,
  },
  {
    id: 'kinetic-statement',
    name: 'Statement',
    category: 'Kinetic Type',
    kind: 'scene',
    tier: 'free',
    supportedAspects: ['16:9', '4:3', '1:1', '4:5', '9:16'],
    photoSlots: { min: 1, max: 1 },
    blurb: 'A full-bleed photo under a headline that types itself in.',
  },
  {
    id: 'kinetic-swap',
    name: 'Phrase Swap',
    category: 'Kinetic Type',
    kind: 'scene',
    tier: 'pro',
    isNew: true,
    supportedAspects: ['1:1', '4:5', '9:16', '16:9'],
    photoSlots: { min: 1, max: 3 },
    blurb: 'Two phrases trading places over a masked photo.',
    // Before the phrase swap, so the poster shows the primary headline.
    posterAtMs: 3_000,
  },
];

export function summaryFor(id: string): TemplateSummary | undefined {
  return TEMPLATE_MANIFEST.find((t) => t.id === id);
}

export function templatesInCategory(category: string): readonly TemplateSummary[] {
  return TEMPLATE_MANIFEST.filter((t) => t.category === category);
}

/** What the library shows for a given editor mode (§1.1 vs §1.2). */
export function templatesForMode(mode: 'showcase' | 'motionAd'): readonly TemplateSummary[] {
  return TEMPLATE_MANIFEST.filter((t) => (mode === 'motionAd' ? t.kind === 'ad' : t.kind === 'scene'));
}

export function posterUrl(id: string): string {
  return `/thumbs/${id}.webp`;
}

export function previewUrl(id: string): string {
  return `/thumbs/${id}.webm`;
}
