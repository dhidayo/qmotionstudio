import type { Aspect } from '@/core/types';
import type { AdTemplate, Tier } from './schema';
import { AD_FILM_TEMPLATES, SCENE_VARIANTS, type SceneVariant } from './catalog';

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
  /**
   * False for templates offered only where they make sense rather than in the
   * library grid — Blank, which is reached from "+ Scene" and "New blank
   * canvas". Omitted means listed.
   */
  readonly listed?: boolean;
  /**
   * The look a design opens in (D-121): one of the Style tab's looks, by id.
   * Varied on purpose — cream, white, colour and dark across the library — so
   * the library is not a wall of near-black cards, and so what a card shows
   * is what picking it gives.
   */
  readonly look?: string;
};

export const CATEGORIES: readonly string[] = [
  // Corporate Ads: whole films.
  'Story Ads', 'Text Stories', 'Product Films', 'Business Promos',
  // Scenes: words first, then products, then photographs in motion.
  'Text Motion', 'Elements', 'Kinetic Type', 'Product Display', 'Business',
  'Ring Path', 'Flow Track', 'Depth Stage', 'Angle Stage', 'Tile Field', 'Deck Motion',
  'Hero Stage', 'Photo Reveal', 'Scene Cuts', 'Photo Collage', 'Timeline',
  'Soft Pop', 'Split Frame', 'Basics',
];

const ALL_ASPECTS: readonly Aspect[] = ['9:16', '4:5', '1:1', '4:3', '16:9'];

/**
 * Each category's looks, dealt in turn to its designs unless a design names
 * its own (D-121). Words-first categories lean light and coloured, where
 * organisations' own brand pages live; photographs in depth lean dark, where a
 * tunnel or a glow reads.
 */
const CATEGORY_LOOKS: Readonly<Record<string, readonly string[]>> = {
  'Text Motion': ['cream', 'navy', 'sunshine', 'linen', 'cobalt', 'blush', 'midnight', 'mint', 'coral', 'lilac', 'emerald', 'paper', 'orchid', 'sky', 'terracotta'],
  Elements: ['linen', 'sky', 'sunshine', 'navy', 'lilac', 'coral', 'cream', 'cobalt', 'mint', 'midnight', 'blush', 'emerald', 'paper', 'orchid', 'terracotta'],
  'Product Display': ['linen', 'midnight', 'cream', 'sky', 'blush', 'navy', 'mint', 'bone', 'lilac', 'sunshine', 'paper', 'tide'],
  Business: ['sky', 'navy', 'linen', 'lilac', 'cobalt', 'cream', 'mint', 'midnight', 'paper', 'emerald', 'blush', 'sunshine'],
  'Depth Stage': ['midnight', 'navy', 'orchid', 'tide', 'ember', 'cobalt', 'forest', 'emerald'],
};
const PHOTO_LOOKS = ['midnight', 'cream', 'navy', 'linen', 'orchid', 'sky', 'ember', 'blush', 'tide', 'paper', 'emerald', 'lilac', 'forest', 'sunshine', 'cobalt', 'terracotta'];

function variantLooks(variants: readonly SceneVariant[]): ReadonlyMap<string, string> {
  const dealt = new Map<string, number>();
  const looks = new Map<string, string>();
  for (const variant of variants) {
    const turn = dealt.get(variant.category) ?? 0;
    dealt.set(variant.category, turn + 1);
    const list = CATEGORY_LOOKS[variant.category] ?? PHOTO_LOOKS;
    looks.set(variant.id, variant.look ?? list[turn % list.length] ?? 'midnight');
  }
  return looks;
}

const VARIANT_LOOKS = variantLooks(SCENE_VARIANTS);

/** The library's view of a catalogue variant (D-119). */
function sceneSummary(variant: SceneVariant): TemplateSummary {
  const look = VARIANT_LOOKS.get(variant.id);
  return {
    id: variant.id,
    name: variant.name,
    category: variant.category,
    kind: 'scene',
    tier: variant.tier ?? 'free',
    ...(variant.isNew === true ? { isNew: true } : {}),
    supportedAspects: ALL_ASPECTS,
    photoSlots: { min: variant.photos.min, max: variant.photos.max },
    blurb: variant.blurb,
    ...(variant.posterAtMs === undefined ? {} : { posterAtMs: variant.posterAtMs }),
    ...(look === undefined ? {} : { look }),
  };
}

/** A film's running time: its scenes, less the overlap of each transition (D-004). */
function filmLengthMs(film: AdTemplate): number {
  return film.scenes.reduce((total, ref, i) => {
    const overlap = i === 0 || ref.transitionIn === null || ref.transitionIn.kind === 'cut' ? 0 : ref.transitionIn.durationMs;
    return total + ref.durationMs - overlap;
  }, 0);
}

/** The library's view of an ad film. */
function filmSummary(film: AdTemplate): TemplateSummary {
  const counts = film.scenes.map((scene) => scene.photoCount ?? 0);
  return {
    id: film.id,
    name: film.name,
    category: film.category,
    kind: 'ad',
    tier: film.tier,
    ...(film.isNew === true ? { isNew: true } : {}),
    supportedAspects: film.supportedAspects,
    photoSlots: { min: Math.min(...counts), max: Math.max(...counts) },
    sceneCount: film.scenes.length,
    durationMs: filmLengthMs(film),
    blurb: film.blurb ?? '',
    ...(film.paletteId === undefined ? {} : { look: film.paletteId }),
    // Late in the first beat — its words fully in — before the next arrives.
    posterAtMs: Math.max(0, (film.scenes[0]?.durationMs ?? 3_000) - (film.scenes[1]?.transitionIn?.durationMs ?? 0) - 200),
  };
}

export const TEMPLATE_MANIFEST: readonly TemplateSummary[] = [
  ...AD_FILM_TEMPLATES.map(filmSummary),
  ...SCENE_VARIANTS.map(sceneSummary),
  {
    id: 'blank',
    name: 'Blank',
    category: 'Basics',
    kind: 'scene',
    tier: 'free',
    supportedAspects: ['16:9', '4:3', '1:1', '4:5', '9:16'],
    photoSlots: { min: 0, max: 0 },
    blurb: 'A background and nothing else, to build on from scratch.',
    listed: false,
  },
  {
    id: 'launch-story',
    name: 'Launch Story',
    category: 'Story Ads',
    kind: 'ad',
    look: 'midnight',
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
    look: 'bone',
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
    look: 'tide',
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
    look: 'paper',
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
    look: 'bone',
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
    id: 'soft-showcase',
    name: 'Soft Showcase',
    category: 'Story Ads',
    kind: 'ad',
    look: 'paper',
    tier: 'pro',
    isNew: true,
    supportedAspects: ['9:16', '4:5', '1:1', '4:3', '16:9'],
    photoSlots: { min: 1, max: 3 },
    sceneCount: 5,
    durationMs: 24_000,
    blurb: 'A calm product ad: the range drifts and lifts, a customer speaks, then the offer.',
    // In the opening beat, once the first photo has come into focus. Timed for the 10s scene a
    // `?template=` link opens, which is what `npm run thumbs` photographs.
    posterAtMs: 1_250,
  },
  {
    id: 'pop-scatter',
    name: 'Scatter',
    category: 'Soft Pop',
    kind: 'scene',
    look: 'blush',
    tier: 'free',
    isNew: true,
    supportedAspects: ['16:9', '4:3', '1:1', '4:5', '9:16'],
    photoSlots: { min: 2, max: 8 },
    blurb: 'Each photo drifts apart in soft pieces as the next settles beneath.',
    // Mid-scatter, so the card shows the exit rather than a still photo. Timed for the 10s scene a
    // `?template=` link opens, which is what `npm run thumbs` photographs.
    posterAtMs: 1_850,
  },
  {
    id: 'pop-blowout',
    name: 'Blowout',
    category: 'Soft Pop',
    kind: 'scene',
    look: 'sunshine',
    tier: 'pro',
    isNew: true,
    supportedAspects: ['16:9', '4:3', '1:1', '4:5', '9:16'],
    photoSlots: { min: 2, max: 8 },
    blurb: 'Each photo is lifted away in fine pieces on a passing breeze.',
    // Mid-sweep: part of the photo still whole, part carried off. Timed for the 10s scene a
    // `?template=` link opens, which is what `npm run thumbs` photographs.
    posterAtMs: 1_800,
  },
  {
    id: 'pop-fizzle',
    name: 'Fizzle',
    category: 'Soft Pop',
    kind: 'scene',
    look: 'lilac',
    tier: 'pro',
    isNew: true,
    supportedAspects: ['16:9', '4:3', '1:1', '4:5', '9:16'],
    photoSlots: { min: 2, max: 8 },
    blurb: 'Each photo softens and fades as points of light rise from it.',
    // Half dissolved, with the motes at their brightest. Timed for the 10s scene a
    // `?template=` link opens, which is what `npm run thumbs` photographs.
    posterAtMs: 1_950,
  },
  {
    id: 'pop-flip',
    name: 'Flip Out',
    category: 'Soft Pop',
    kind: 'scene',
    look: 'sky',
    tier: 'free',
    isNew: true,
    supportedAspects: ['16:9', '4:3', '1:1', '4:5', '9:16'],
    photoSlots: { min: 2, max: 8 },
    blurb: 'Each photo turns away like an album page, uncovering the next.',
    // Half-way through the turn, with the next photo showing beneath. Timed for the 10s scene a
    // `?template=` link opens, which is what `npm run thumbs` photographs.
    posterAtMs: 1_900,
  },
  {
    id: 'pop-float',
    name: 'Float Away',
    category: 'Soft Pop',
    kind: 'scene',
    look: 'cream',
    tier: 'free',
    isNew: true,
    supportedAspects: ['16:9', '4:3', '1:1', '4:5', '9:16'],
    photoSlots: { min: 2, max: 8 },
    blurb: 'Each photo drifts up and away as the next rises into place.',
    // Both photos in the air at once, passing in the same direction. Timed for the 10s scene a
    // `?template=` link opens, which is what `npm run thumbs` photographs.
    posterAtMs: 2_000,
  },
  {
    id: 'pop-dream',
    name: 'Dream Fade',
    category: 'Soft Pop',
    kind: 'scene',
    look: 'midnight',
    tier: 'free',
    isNew: true,
    supportedAspects: ['16:9', '4:3', '1:1', '4:5', '9:16'],
    photoSlots: { min: 2, max: 8 },
    blurb: 'Full-frame photos that ease back and dissolve through soft focus.',
    // The first photo sharp and settled, before the first hand-over. Timed for the 10s scene a
    // `?template=` link opens, which is what `npm run thumbs` photographs.
    posterAtMs: 1_250,
  },
  {
    id: 'depth-parallax',
    name: 'Parallax Depth',
    category: 'Depth Stage',
    kind: 'scene',
    look: 'cream',
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
    look: 'navy',
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
    look: 'midnight',
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
    look: 'orchid',
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
    look: 'tide',
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
    look: 'linen',
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
    look: 'navy',
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
    look: 'blush',
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
    look: 'cobalt',
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
    look: 'mint',
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
    look: 'paper',
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
    look: 'midnight',
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
    look: 'sky',
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
    look: 'linen',
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
    look: 'cream',
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
    look: 'midnight',
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
    look: 'coral',
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
    look: 'navy',
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
    look: 'sunshine',
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
    look: 'cream',
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
  return TEMPLATE_MANIFEST.filter(
    (t) => t.listed !== false && (mode === 'motionAd' ? t.kind === 'ad' : t.kind === 'scene'),
  );
}

/**
 * Every template that can be a scene, listed or not — what "+ Scene" offers.
 *
 * In Motion Ads the library shows ad templates, because picking one there
 * replaces the whole ad. That left no way at all to choose what kind of scene
 * to add, or to change one beat's design: "+ Scene" could only copy the scene
 * already selected. This is the list that fixes it.
 */
export function sceneTemplates(): readonly TemplateSummary[] {
  return TEMPLATE_MANIFEST.filter((t) => t.kind === 'scene');
}

/**
 * Which set of thumbnails is current. Bump it whenever `npm run thumbs`
 * rewrites them: the service worker keeps posters cache-first and browsers
 * keep the loops, so an unchanged address goes on showing yesterday's picture
 * — a dark card for a design that now opens in cream (D-121).
 */
export const THUMBS_REVISION = 2;

export function posterUrl(id: string): string {
  return `/thumbs/${id}.webp?v=${THUMBS_REVISION}`;
}

export function previewUrl(id: string): string {
  return `/thumbs/${id}.webm?v=${THUMBS_REVISION}`;
}
