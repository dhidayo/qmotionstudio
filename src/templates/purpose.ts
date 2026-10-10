import type { TemplateSummary } from './manifest';

/**
 * What a design is for (D-143): "It makes sense truly to organize the design
 * based on purpose."
 *
 * The categories say what a design looks like — a ring, a deck, a kinetic
 * line. An organisation arrives knowing what it needs to say: news, a price,
 * a hire, an event, a product. These are the groups the library opens on; the
 * old ones are a switch away for anyone browsing by look.
 */
export const DESIGN_PURPOSES = [
  'Headlines & hooks',
  'Products',
  'Sales & prices',
  'Calls to action',
  'Numbers & results',
  'Quotes & reviews',
  'People & teams',
  'Events & dates',
  'Lists & how it works',
  'Business & apps',
  'Before & after',
  'Photo galleries',
  'Photo stacks',
  '3D & depth',
  'Hero photos',
  'Photo stories',
  'Moodboards',
  'Timelines & journeys',
] as const;

export const VIDEO_PURPOSES = [
  'Announcements',
  'Product launches & offers',
  'Brand & company',
  'Customer stories & results',
  'Hiring',
  'Events & webinars',
  'Thanks & celebrations',
] as const;

export type Purpose = (typeof DESIGN_PURPOSES)[number] | (typeof VIDEO_PURPOSES)[number];

/** Particular designs whose purpose is not their family's. */
const BY_ID: Readonly<Record<string, Purpose>> = {
  // Words
  'type-big-number': 'Numbers & results',
  'type-quote': 'Quotes & reviews',
  'type-lower-third': 'People & teams',
  'kinetic-counter': 'Numbers & results',
  'kinetic-quote': 'Quotes & reviews',
  'kinetic-list': 'Lists & how it works',
  // Elements
  'el-cta-button': 'Calls to action',
  'el-end-card': 'Calls to action',
  'el-capsule-type': 'Calls to action',
  'el-claim-pill': 'Sales & prices',
  'el-price-tag': 'Sales & prices',
  'el-metric-cards': 'Numbers & results',
  'el-progress-bar': 'Numbers & results',
  'el-review-card': 'Quotes & reviews',
  'el-date-card': 'Events & dates',
  'el-countdown': 'Events & dates',
  'el-checklist': 'Lists & how it works',
  'el-chips': 'Lists & how it works',
  // Products
  'pd-price-reveal': 'Sales & prices',
  'pd-compare': 'Before & after',
  'pd-spec-sheet': 'Lists & how it works',
  // Business
  'biz-pricing': 'Sales & prices',
  'biz-testimonials': 'Quotes & reviews',
  'biz-team': 'People & teams',
  'biz-speakers': 'People & teams',
  'biz-hiring': 'People & teams',
  'biz-org-chart': 'People & teams',
  'biz-webinar': 'Events & dates',
  'biz-how-it-works': 'Lists & how it works',
  'biz-process-photos': 'Lists & how it works',
  // Films
  'story-big-news': 'Announcements',
  'story-new-service': 'Announcements',
  'story-thank-you': 'Thanks & celebrations',
  'story-hiring': 'Hiring',
  'promo-hiring': 'Hiring',
  'story-event': 'Events & webinars',
  'story-webinar': 'Events & webinars',
  'promo-webinar': 'Events & webinars',
  'story-sale': 'Product launches & offers',
  'story-mission': 'Brand & company',
  'story-customer': 'Customer stories & results',
  'story-impact': 'Customer stories & results',
  'promo-saas': 'Brand & company',
  'promo-agency': 'Brand & company',
  'promo-company-intro': 'Brand & company',
  'launch-story': 'Product launches & offers',
  'product-drop': 'Product launches & offers',
  'soft-showcase': 'Product launches & offers',
  'quick-pitch': 'Brand & company',
  'social-post': 'Brand & company',
  'proof-reel': 'Customer stories & results',
};

/** Whole families and hand-made groups, by the start of their ids. */
const BY_PREFIX: readonly (readonly [string, Purpose])[] = [
  ['film-', 'Product launches & offers'],
  ['type-', 'Headlines & hooks'],
  ['el-', 'Headlines & hooks'],
  ['kinetic-', 'Headlines & hooks'],
  ['pd-', 'Products'],
  ['biz-', 'Business & apps'],
  ['split-', 'Before & after'],
  ['ring-', 'Photo galleries'],
  ['flow-', 'Photo galleries'],
  ['mq-', 'Photo galleries'],
  ['tile-', 'Photo galleries'],
  ['deck-', 'Photo stacks'],
  ['angle-', 'Photo stacks'],
  ['dp-', '3D & depth'],
  ['depth-', '3D & depth'],
  ['hero-', 'Hero photos'],
  ['reveal-', 'Hero photos'],
  ['cut-', 'Photo stories'],
  ['halo-', 'Moodboards'],
  ['pop-', 'Moodboards'],
  ['tl-', 'Timelines & journeys'],
];

export function purposeOf(summary: Pick<TemplateSummary, 'id' | 'kind'>): Purpose {
  const named = BY_ID[summary.id];
  if (named) return named;
  for (const [prefix, purpose] of BY_PREFIX) if (summary.id.startsWith(prefix)) return purpose;
  return summary.kind === 'ad' ? 'Brand & company' : 'Headlines & hooks';
}

export function purposesFor(kind: 'scene' | 'ad'): readonly Purpose[] {
  return kind === 'ad' ? VIDEO_PURPOSES : DESIGN_PURPOSES;
}
