import type { Aspect } from '@/core/types';
import { TEMPLATE_MANIFEST, aspectPosterUrl, type TemplateSummary } from '@/templates/manifest';
import { purposeOf, type Purpose } from '@/templates/purpose';

/**
 * The landing page's designs, by purpose (D-175), from the library's own
 * table and the library's own purposes (D-143), so the page never lists a
 * design the studio does not have. A chunk of its own, fetched as the
 * showcase comes near the screen: the table is the largest thing the page
 * would otherwise carry.
 */

export type ShowcaseFilter = {
  readonly id: string;
  readonly label: string;
};

export type ShowcaseCard = {
  readonly id: string;
  readonly name: string;
  readonly purpose: Purpose;
  readonly pro: boolean;
  readonly video: boolean;
  /** The shape the card's still is in, and the design opens in. */
  readonly aspect: Aspect;
  readonly still: string;
};

/** A few of the library's purposes, the ones most people arrive for, and video. */
const FILTERS: readonly (ShowcaseFilter & { readonly purposes: readonly Purpose[] | 'video' | 'all' })[] = [
  { id: 'all', label: 'All', purposes: 'all' },
  { id: 'galleries', label: 'Photo galleries', purposes: ['Photo galleries', 'Photo stacks', 'Moodboards'] },
  { id: 'business', label: 'Business posts', purposes: ['Business posts', 'Business & apps', 'Numbers & results'] },
  { id: 'products', label: 'Products and sales', purposes: ['Products', 'Sales & prices'] },
  { id: 'covers', label: 'Thumbnails and covers', purposes: ['Thumbnails & covers'] },
  { id: 'words', label: 'Headlines and quotes', purposes: ['Headlines & hooks', 'Quotes & reviews'] },
  { id: 'video', label: 'Videos', purposes: 'video' },
];

export const SHOWCASE_FILTERS: readonly ShowcaseFilter[] = FILTERS.map(({ id, label }) => ({ id, label }));

/** How many cards a filter shows: two rows on a computer, enough to scroll on a phone. */
const PER_FILTER = 8;

/** The square-ish post shape for designs, the phone's tall frame for videos. */
function cardAspect(summary: TemplateSummary): Aspect {
  const wanted: Aspect = summary.kind === 'ad' ? '9:16' : '4:5';
  return summary.supportedAspects.includes(wanted) ? wanted : summary.supportedAspects[0] ?? wanted;
}

function card(summary: TemplateSummary): ShowcaseCard {
  const aspect = cardAspect(summary);
  return {
    id: summary.id,
    name: summary.name,
    purpose: purposeOf(summary),
    pro: summary.tier === 'pro',
    video: summary.kind === 'ad',
    aspect,
    still: aspectPosterUrl(summary.id, aspect),
  };
}

/**
 * "All": the first of each of these purposes in turn — photographs first,
 * because a page about photos in motion should open on photos.
 */
const ALL_ORDER: readonly Purpose[] = [
  'Photo galleries', 'Products', 'Thumbnails & covers', 'Business posts',
  '3D & depth', 'Hero photos', 'Photo stacks', 'Quotes & reviews',
];

function spread(listed: readonly TemplateSummary[]): TemplateSummary[] {
  return ALL_ORDER
    .map((purpose) => listed.find((t) => purposeOf(t) === purpose))
    .filter((t): t is TemplateSummary => t !== undefined)
    .slice(0, PER_FILTER);
}

export function showcaseCards(filterId: string): readonly ShowcaseCard[] {
  const filter = FILTERS.find((f) => f.id === filterId) ?? FILTERS[0];
  const listed = TEMPLATE_MANIFEST.filter((t) => t.listed !== false && t.id !== 'blank');
  // Free designs first: what anyone can open today.
  const free = [...listed].sort((a, b) => (a.tier === b.tier ? 0 : a.tier === 'free' ? -1 : 1));
  if (!filter || filter.purposes === 'all') return spread(free.filter((t) => t.kind === 'scene')).map(card);
  const purposes = filter.purposes;
  const chosen = purposes === 'video'
    ? free.filter((t) => t.kind === 'ad')
    : free.filter((t) => t.kind === 'scene' && purposes.includes(purposeOf(t)));
  return chosen.slice(0, PER_FILTER).map(card);
}

/** How many designs and videos the library has, said on the page as it is. */
export function libraryCount(): number {
  return TEMPLATE_MANIFEST.filter((t) => t.listed !== false && t.id !== 'blank').length;
}
