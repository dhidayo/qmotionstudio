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
  readonly tier: Tier;
  readonly isNew?: boolean;
  readonly supportedAspects: readonly Aspect[];
  readonly photoSlots: { readonly min: number; readonly max: number };
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

export const CATEGORIES: readonly string[] = ['Depth Stage', 'Angle Stage', 'Kinetic Type'];

export const TEMPLATE_MANIFEST: readonly TemplateSummary[] = [
  {
    id: 'depth-parallax',
    name: 'Parallax Depth',
    category: 'Depth Stage',
    tier: 'free',
    supportedAspects: ['16:9', '4:3', '1:1', '4:5', '9:16'],
    photoSlots: { min: 2, max: 6 },
    blurb: 'Photos on receding planes drifting at different speeds.',
  },
  {
    id: 'depth-stack',
    name: 'Card Stack',
    category: 'Depth Stage',
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
    tier: 'free',
    supportedAspects: ['16:9', '4:3', '1:1', '4:5', '9:16'],
    photoSlots: { min: 3, max: 8 },
    blurb: 'Photos fanned across an arc, springing in from the centre.',
  },
  {
    id: 'angle-tilt',
    name: 'Tilt Sweep',
    category: 'Angle Stage',
    tier: 'pro',
    supportedAspects: ['16:9', '4:3', '1:1', '4:5', '9:16'],
    photoSlots: { min: 2, max: 6 },
    blurb: 'A tilted row sweeping past, nearest photo largest.',
  },
  {
    id: 'kinetic-statement',
    name: 'Statement',
    category: 'Kinetic Type',
    tier: 'free',
    supportedAspects: ['16:9', '4:3', '1:1', '4:5', '9:16'],
    photoSlots: { min: 1, max: 1 },
    blurb: 'A full-bleed photo under a headline that types itself in.',
  },
  {
    id: 'kinetic-swap',
    name: 'Phrase Swap',
    category: 'Kinetic Type',
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

export function posterUrl(id: string): string {
  return `/thumbs/${id}.webp`;
}

export function previewUrl(id: string): string {
  return `/thumbs/${id}.webm`;
}
