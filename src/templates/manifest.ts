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
    id: 'social-post',
    name: 'Social Post',
    category: 'Story Ads',
    kind: 'ad',
    tier: 'free',
    isNew: true,
    supportedAspects: ['9:16', '4:5', '1:1', '4:3', '16:9'],
    photoSlots: { min: 1, max: 1 },
    sceneCount: 3,
    durationMs: 10_000,
    blurb: 'Three beats in ten seconds: the claim, the number, the customer.',
    // Late in the opening beat, once the button has arrived.
    posterAtMs: 2_600,
  },
  {
    id: 'proof-reel',
    name: 'Proof Reel',
    category: 'Story Ads',
    kind: 'ad',
    tier: 'pro',
    isNew: true,
    supportedAspects: ['9:16', '4:5', '1:1', '4:3', '16:9'],
    photoSlots: { min: 1, max: 3 },
    sceneCount: 6,
    durationMs: 21_000,
    blurb: 'Six beats of evidence: the claim, the number, the detail, the voice.',
    // Inside the opening statement, before the first cut.
    posterAtMs: 1_800,
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
    id: 'depth-tunnel',
    name: 'Depth Tunnel',
    category: 'Depth Stage',
    kind: 'scene',
    tier: 'free',
    isNew: true,
    supportedAspects: ['16:9', '4:3', '1:1', '4:5', '9:16'],
    photoSlots: { min: 2, max: 8 },
    blurb: 'Photos travelling out of a vanishing point and past the camera.',
    // Mid-flight, with arrivals at three different distances.
    posterAtMs: 3_000,
  },
  {
    id: 'depth-spotlight',
    name: 'Spotlight',
    category: 'Depth Stage',
    kind: 'scene',
    tier: 'free',
    isNew: true,
    supportedAspects: ['16:9', '4:3', '1:1', '4:5', '9:16'],
    photoSlots: { min: 2, max: 6 },
    blurb: 'A shelf of photos with one brought forward and lit, taking turns.',
    // Once the first photo has reached the front and settled.
    posterAtMs: 1_800,
  },
  {
    id: 'depth-focus',
    name: 'Pull Focus',
    category: 'Depth Stage',
    kind: 'scene',
    tier: 'pro',
    isNew: true,
    supportedAspects: ['16:9', '4:3', '1:1', '4:5', '9:16'],
    photoSlots: { min: 2, max: 4 },
    blurb: 'Photos at fixed depths while the focus racks through them.',
    // After the first rack has settled and the type is in.
    posterAtMs: 1_600,
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
    id: 'angle-cascade',
    name: 'Cascade',
    category: 'Angle Stage',
    kind: 'scene',
    tier: 'free',
    isNew: true,
    supportedAspects: ['16:9', '4:3', '1:1', '4:5', '9:16'],
    photoSlots: { min: 2, max: 7 },
    blurb: 'Photos falling into a diagonal stair, one beat after another.',
    // Once the last card has landed and stopped bouncing.
    posterAtMs: 2_200,
  },
  {
    id: 'angle-flip',
    name: 'Flip Cards',
    category: 'Angle Stage',
    kind: 'scene',
    tier: 'free',
    isNew: true,
    supportedAspects: ['16:9', '4:3', '1:1', '4:5', '9:16'],
    photoSlots: { min: 2, max: 6 },
    blurb: 'Photos turning through one card on a vertical axis.',
    // Mid-turn and fully face-on — never near a flip, which is an edge.
    posterAtMs: 1_500,
  },
  {
    id: 'angle-pinwheel',
    name: 'Pinwheel',
    category: 'Angle Stage',
    kind: 'scene',
    tier: 'pro',
    isNew: true,
    supportedAspects: ['16:9', '4:3', '1:1', '4:5', '9:16'],
    photoSlots: { min: 3, max: 8 },
    blurb: 'Photos set around a turning ring, each facing outward.',
    // After every spoke has sprung out, with the hub type in.
    posterAtMs: 2_400,
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
    id: 'split-grid',
    name: 'Contact Sheet',
    category: 'Split Frame',
    kind: 'scene',
    tier: 'free',
    isNew: true,
    supportedAspects: ['16:9', '4:3', '1:1', '4:5', '9:16'],
    photoSlots: { min: 3, max: 9 },
    blurb: 'Photos assembling into a grid, one beat after another.',
    // Once the sheet has filled.
    posterAtMs: 2_600,
  },
  {
    id: 'split-band',
    name: 'Side Band',
    category: 'Split Frame',
    kind: 'scene',
    tier: 'free',
    isNew: true,
    supportedAspects: ['16:9', '4:3', '1:1', '4:5', '9:16'],
    photoSlots: { min: 1, max: 1 },
    blurb: 'A photo beside a block of colour holding the whole message.',
    // Once the button has settled — the last thing to arrive.
    posterAtMs: 2_900,
  },
  {
    id: 'split-panels',
    name: 'Panels',
    category: 'Split Frame',
    kind: 'scene',
    tier: 'free',
    isNew: true,
    supportedAspects: ['16:9', '4:3', '1:1', '4:5', '9:16'],
    photoSlots: { min: 2, max: 5 },
    blurb: 'The frame divided into equal panels, arriving from alternating ends.',
    // After the panels have landed and the centre band is up.
    posterAtMs: 2_500,
  },
  {
    id: 'split-inset',
    name: 'Picture in Picture',
    category: 'Split Frame',
    kind: 'scene',
    tier: 'pro',
    isNew: true,
    supportedAspects: ['16:9', '4:3', '1:1', '4:5', '9:16'],
    photoSlots: { min: 2, max: 4 },
    blurb: 'One photo filling the frame with the rest inset along the bottom.',
    // Once the insets have risen into place.
    posterAtMs: 2_700,
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
  {
    id: 'kinetic-counter',
    name: 'Big Number',
    category: 'Kinetic Type',
    kind: 'scene',
    tier: 'free',
    isNew: true,
    supportedAspects: ['16:9', '4:3', '1:1', '4:5', '9:16'],
    photoSlots: { min: 1, max: 1 },
    blurb: 'One figure, what it measures, and where it came from.',
    // After the figure, the rule and the label are all in.
    posterAtMs: 2_600,
  },
  {
    id: 'kinetic-list',
    name: 'List Drop',
    category: 'Kinetic Type',
    kind: 'scene',
    tier: 'free',
    isNew: true,
    supportedAspects: ['16:9', '4:3', '1:1', '4:5', '9:16'],
    photoSlots: { min: 1, max: 1 },
    blurb: 'A heading and up to four lines, each arriving with its own mark.',
    // Once every line has dropped.
    posterAtMs: 2_800,
  },
  {
    id: 'kinetic-quote',
    name: 'Pull Quote',
    category: 'Kinetic Type',
    kind: 'scene',
    tier: 'free',
    isNew: true,
    supportedAspects: ['16:9', '4:3', '1:1', '4:5', '9:16'],
    photoSlots: { min: 1, max: 1 },
    blurb: 'Somebody\u2019s words, their face, and their name.',
    // After the attribution has faded up.
    posterAtMs: 2_600,
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
