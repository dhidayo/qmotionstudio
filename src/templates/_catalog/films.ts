import type { Transition } from '@/document/types';
import type { AdTemplate, SceneTemplateRef } from '../schema';

/**
 * Corporate Ads films (D-119): whole stories, scene after scene, for what
 * organisations actually announce — news, a mission, a hire, an event, a
 * year's results, a customer's story, a launch, a sale, a thank-you — told
 * in words alone, or with the product, or with the business's own screens,
 * people and clients.
 *
 * Each beat is one of the library's own scenes with its copy written in, so
 * every word is editable on the canvas and every scene can be swapped.
 */

type Beat = {
  readonly scene: string;
  readonly ms: number;
  readonly texts: Readonly<Record<string, string>>;
  readonly photos?: number;
  /** How this beat arrives; ignored on the first (D-004). */
  readonly via?: Transition;
};

const FADE: Transition = { kind: 'crossFade', durationMs: 500 };
const PUSH: Transition = { kind: 'push', durationMs: 500, direction: 'left' };
const UP: Transition = { kind: 'push', durationMs: 500, direction: 'up' };
const WIPE: Transition = { kind: 'wipe', durationMs: 550, direction: 'right' };
const ZOOM: Transition = { kind: 'zoomBlur', durationMs: 500 };
const FLASH: Transition = { kind: 'whiteFlash', durationMs: 400 };
const SCALE: Transition = { kind: 'scale', durationMs: 500 };

function film(
  id: string,
  name: string,
  category: 'Text Stories' | 'Product Films' | 'Business Promos',
  paletteId: string,
  blurb: string,
  beats: readonly Beat[],
): AdTemplate {
  const scenes: SceneTemplateRef[] = beats.map((beat, i) => ({
    templateId: beat.scene,
    durationMs: beat.ms,
    transitionIn: i === 0 ? null : beat.via ?? FADE,
    texts: beat.texts,
    photoCount: beat.photos ?? 0,
  }));
  // Its length as the timeline will play it: each transition overlaps the beat before (D-004).
  const length = scenes.reduce((total, ref, i) => {
    const overlap = i === 0 || ref.transitionIn === null || ref.transitionIn.kind === 'cut' ? 0 : ref.transitionIn.durationMs;
    return total + ref.durationMs - overlap;
  }, 0);
  return {
    kind: 'ad',
    id,
    name,
    category,
    mode: 'motionAd',
    tier: 'free',
    isNew: true,
    supportedAspects: ['9:16', '4:5', '1:1', '4:3', '16:9'],
    defaultDurationMs: length,
    minDurationMs: 5_000,
    maxDurationMs: 60_000,
    paletteId,
    blurb,
    scenes,
  };
}

const END = (headline: string, brand: string, button: string, site: string): Beat => ({
  scene: 'el-end-card', ms: 3_600, via: ZOOM, texts: { headline, brand, button, site },
});

const TEXT_STORIES: readonly AdTemplate[] = [
  film('story-big-news', 'Big Announcement', 'Text Stories', 'navy',
    'News, told in four beats: the tease, the news, the number, where to find you.', [
      { scene: 'type-mask-wipe', ms: 3_000, texts: { headline: 'We have news', subline: 'And we could not wait to tell you' } },
      { scene: 'type-stack-drop', ms: 2_800, via: PUSH, texts: { headline: 'We are opening in Lagos' } },
      { scene: 'type-big-number', ms: 3_000, texts: { headline: '3 new cities', subline: 'this year alone' } },
      END('Come and see us', 'Your Brand', 'Find us', 'yourbrand.com'),
    ]),
  film('story-mission', 'Our Mission', 'Text Stories', 'cream',
    'Why you exist and what you stand for, in words that arrive one by one.', [
      { scene: 'type-soft-focus', ms: 3_200, texts: { headline: 'We believe work should feel good', subline: 'That is why we started' } },
      { scene: 'type-cascade-rise', ms: 3_200, via: UP, texts: { headline: 'So we build tools people love', subline: 'Simple. Honest. Fast.' } },
      { scene: 'el-checklist', ms: 3_600, via: WIPE, texts: { headline: 'What we stand for', item1: 'People first', item2: 'Do it right', item3: 'Keep it simple' } },
      { scene: 'type-underline-draw', ms: 3_000, texts: { headline: 'Join us', subline: 'yourbrand.com' } },
    ]),
  film('story-hiring', 'We Are Hiring', 'Text Stories', 'sunshine',
    'A job ad that moves: the hook, the roles, the reasons, the button.', [
      { scene: 'type-punch-swap', ms: 3_000, texts: { headline: 'Love your work?', alt: 'Come do it here.' } },
      { scene: 'el-chips', ms: 3_200, via: SCALE, texts: { headline: 'Open roles', chips: 'Designer, Engineer, Sales, Support, Marketing' } },
      { scene: 'el-checklist', ms: 3_400, via: PUSH, texts: { headline: 'Why join us', item1: 'Remote friendly', item2: 'Learning budget', item3: 'Great people' } },
      { scene: 'el-cta-button', ms: 3_200, via: ZOOM, texts: { headline: 'Apply today', subline: 'It takes five minutes', button: 'See roles' } },
    ]),
  film('story-event', 'Event Invite', 'Text Stories', 'lilac',
    'An invitation: the event, the date, the push to register, the details.', [
      { scene: 'el-eyebrow-title', ms: 3_200, texts: { eyebrow: 'YOU ARE INVITED', headline: 'The Growth Summit', subline: 'A day of ideas for small businesses' } },
      { scene: 'el-date-card', ms: 3_200, via: UP, texts: { headline: 'Save the date', day: '24', month: 'OCT', subline: 'Lagos · 10am' } },
      { scene: 'el-countdown', ms: 3_000, via: FLASH, texts: { headline: 'Seats are going fast', subline: 'Register free today' } },
      END('See you there', 'Growth Summit', 'Register', 'growthsummit.com'),
    ]),
  film('story-impact', 'Impact Report', 'Text Stories', 'emerald',
    'A year in numbers for a charity, a school or a team: counted up, then thanked.', [
      { scene: 'type-tracking-in', ms: 3_000, texts: { headline: 'Our year in numbers', subline: '2026 impact report' } },
      { scene: 'el-metric-cards', ms: 3_800, via: WIPE, texts: { headline: 'What you helped us do', stat1: '12,000', label1: 'meals shared', stat2: '48', label2: 'schools', stat3: '300+', label3: 'volunteers' } },
      { scene: 'type-big-number', ms: 3_000, via: SCALE, texts: { headline: '1,000,000', subline: 'people reached' } },
      { scene: 'type-cross-dissolve', ms: 3_000, texts: { headline: 'Thank you', alt: 'We could not do it without you' } },
    ]),
  film('story-customer', 'Customer Story', 'Text Stories', 'linen',
    'A customer\'s problem, their words, their rating, and your invitation.', [
      { scene: 'type-question-answer', ms: 3_400, texts: { headline: 'Losing hours to paperwork?', alt: 'So was Amaka.' } },
      { scene: 'type-quote', ms: 3_800, via: FADE, texts: { headline: 'We got our evenings back.', subline: '— Amaka O., Retail owner' } },
      { scene: 'el-review-card', ms: 3_400, via: UP, texts: { headline: 'Rated by real customers', name: 'Amaka O., Retail owner', stars: '★★★★★' } },
      { scene: 'el-cta-button', ms: 3_000, via: ZOOM, texts: { headline: 'Your turn', subline: 'Start free today', button: 'Try it free' } },
    ]),
  film('story-new-service', 'New Service', 'Text Stories', 'cobalt',
    'Launch a service without a single photo: the reveal, what it is, the price.', [
      { scene: 'type-zoom-title', ms: 2_800, texts: { headline: 'Introducing', subline: 'something new from us' } },
      { scene: 'type-split-slide', ms: 3_200, via: PUSH, texts: { headline: 'Same-day delivery', subline: 'Across the whole city' } },
      { scene: 'el-price-tag', ms: 3_200, via: SCALE, texts: { headline: 'From only', price: '$5', was: '$12' } },
      END('Order today', 'Your Brand', 'Book now', 'yourbrand.com'),
    ]),
  film('story-sale', 'Flash Sale', 'Text Stories', 'coral',
    'A weekend sale: loud, short, and ending in a button.', [
      { scene: 'type-scale-pop', ms: 2_800, texts: { headline: 'Flash sale', subline: 'This weekend only' } },
      { scene: 'el-price-tag', ms: 3_000, via: FLASH, texts: { headline: 'Everything in store', price: '$29', was: '$49' } },
      { scene: 'el-countdown', ms: 3_000, via: PUSH, texts: { headline: 'Ends Sunday', subline: 'Do not miss it' } },
      { scene: 'el-cta-button', ms: 3_000, via: ZOOM, texts: { headline: 'Shop now', subline: 'Online and in store', button: 'Shop the sale' } },
    ]),
  film('story-webinar', 'Webinar Invite', 'Text Stories', 'sky',
    'Fill a webinar: the topic, the date, what they will learn, the seat.', [
      { scene: 'el-eyebrow-title', ms: 3_000, texts: { eyebrow: 'FREE WEBINAR', headline: 'Grow your sales online', subline: 'Live with our experts' } },
      { scene: 'el-date-card', ms: 3_000, via: UP, texts: { headline: 'Join us live', day: '14', month: 'NOV', subline: 'Thursday · 2pm GMT' } },
      { scene: 'el-checklist', ms: 3_400, via: WIPE, texts: { headline: 'You will learn', item1: 'Where to find customers', item2: 'How to price with confidence', item3: 'How to sell on social' } },
      { scene: 'el-cta-button', ms: 3_000, via: ZOOM, texts: { headline: 'Save your seat', subline: 'It is free', button: 'Register' } },
    ]),
  film('story-thank-you', 'Thank You', 'Text Stories', 'blush',
    'A year-end thank-you to customers, partners and the team.', [
      { scene: 'type-wave', ms: 3_000, texts: { headline: 'Thank you', subline: 'for an amazing year' } },
      { scene: 'type-rotate-settle', ms: 3_400, via: FADE, texts: { headline: 'To our customers, partners and team', subline: 'You made it happen' } },
      { scene: 'el-stamp-seal', ms: 3_400, via: SCALE, texts: { headline: 'Here is to the next one', ring: 'THANK YOU · 2026 ·' } },
    ]),
];

const PRODUCT_FILMS: readonly AdTemplate[] = [
  film('film-product-launch', 'Product Launch', 'Product Films', 'midnight',
    'Unbox it, point out what matters, show every finish, reveal the price.', [
      { scene: 'pd-unbox', ms: 3_600, photos: 1, texts: { headline: 'Something new is here', subline: 'Unbox yours today' } },
      { scene: 'pd-callouts', ms: 4_000, via: FADE, photos: 1, texts: { headline: 'Built to last', point1: 'All-day battery', point2: 'Water resistant', point3: 'Recycled materials' } },
      { scene: 'pd-finishes', ms: 4_000, via: PUSH, photos: 4, texts: { headline: 'Pick your colour', subline: 'Four finishes, one design' } },
      { scene: 'pd-price-reveal', ms: 3_600, via: FLASH, photos: 1, texts: { headline: 'Now at a better price', price: '$129', was: '$159' } },
      END('Get yours today', 'Your Brand', 'Shop now', 'yourbrand.com'),
    ]),
  film('film-feature-spotlight', 'Feature Spotlight', 'Product Films', 'sky',
    'One product, closer and closer: the spotlight, the specs, the detail, the promise.', [
      { scene: 'pd-spotlight', ms: 3_600, photos: 1, texts: { headline: 'Meet the new standard', subline: 'Designed for everyday life' } },
      { scene: 'pd-spec-sheet', ms: 4_000, via: WIPE, photos: 1, texts: { headline: 'Everything you need', spec1: '12-hour battery', spec2: 'Weighs only 240 g', spec3: 'Two-year warranty' } },
      { scene: 'pd-detail-lens', ms: 4_000, via: ZOOM, photos: 1, texts: { headline: 'Look closer', subline: 'Every stitch, by hand' } },
      { scene: 'el-claim-pill', ms: 3_000, via: SCALE, texts: { headline: 'Made to last a lifetime', promise: 'Guaranteed' } },
      END('Find yours', 'Your Brand', 'Shop now', 'yourbrand.com'),
    ]),
  film('film-lookbook', 'Lookbook Drop', 'Product Films', 'cream',
    'A collection drop: the range gliding past, the line-up, the names, the link.', [
      { scene: 'type-letter-scatter', ms: 2_800, texts: { headline: 'The new collection', subline: 'Autumn 2026' } },
      { scene: 'flow-coverflow', ms: 5_000, via: FADE, photos: 6, texts: { headline: 'Browse the range' } },
      { scene: 'pd-range', ms: 3_600, via: PUSH, photos: 3, texts: { headline: 'Choose your fit', name1: 'Classic', name2: 'Sport', name3: 'Pro' } },
      END('Out now', 'Your Brand', 'Shop the drop', 'yourbrand.com'),
    ]),
  film('film-product-tour', 'Product Tour', 'Product Films', 'bone',
    'Turn it round, list what it does, show the price — a full tour of one product.', [
      { scene: 'pd-turntable', ms: 4_000, photos: 1, texts: { headline: 'From every angle', subline: 'Precision in every detail' } },
      { scene: 'pd-spec-sheet', ms: 4_000, via: PUSH, photos: 1, texts: { headline: 'Everything you need', spec1: '12-hour battery', spec2: 'Weighs only 240 g', spec3: 'Two-year warranty' } },
      { scene: 'el-checklist', ms: 3_400, via: WIPE, texts: { headline: 'In the box', item1: 'The product', item2: 'Fast charger', item3: 'Travel case' } },
      { scene: 'pd-price-reveal', ms: 3_600, via: FLASH, photos: 1, texts: { headline: 'Yours for less', price: '$129', was: '$159' } },
      END('Order today', 'Your Brand', 'Shop now', 'yourbrand.com'),
    ]),
  film('film-product-range', 'Collection Film', 'Product Films', 'linen',
    'Everything you make, on a shelf, side by side, and before and after.', [
      { scene: 'pd-lineup', ms: 3_800, photos: 5, texts: { headline: 'The full collection', subline: 'Something for everyone' } },
      { scene: 'pd-compare', ms: 4_000, via: WIPE, photos: 2, texts: { before: 'Before', after: 'After' } },
      { scene: 'pd-new-arrival', ms: 3_400, via: FLASH, photos: 1, texts: { headline: 'Just landed', badge: 'NEW', subline: 'Available in store and online' } },
      END('Visit the shop', 'Your Brand', 'Shop now', 'yourbrand.com'),
    ]),
];

const BUSINESS_PROMOS: readonly AdTemplate[] = [
  film('promo-saas', 'Software Promo', 'Business Promos', 'navy',
    'For software: the problem, the product on screen and on phones, the price.', [
      { scene: 'type-question-answer', ms: 3_200, texts: { headline: 'Still running on spreadsheets?', alt: 'There is a better way.' } },
      { scene: 'biz-dashboard-parade', ms: 4_400, via: ZOOM, photos: 4, texts: { headline: 'See it all at a glance' } },
      { scene: 'biz-app-showcase', ms: 4_400, via: PUSH, photos: 5, texts: { headline: 'And in your pocket' } },
      { scene: 'biz-pricing', ms: 4_400, via: UP, texts: { headline: 'Simple, honest pricing' } },
      END('Start free today', 'Your Brand', 'Try it free', 'yourbrand.com'),
    ]),
  film('promo-agency', 'Agency Reel', 'Business Promos', 'linen',
    'For a studio or agency: who you are, the work, the clients, what they say.', [
      { scene: 'type-cascade-rise', ms: 3_000, texts: { headline: 'We make brands people remember', subline: 'Strategy, design and film' } },
      { scene: 'biz-case-studies', ms: 4_400, via: FADE, photos: 4, texts: { headline: 'Work we are proud of' } },
      { scene: 'biz-logo-wall', ms: 3_800, via: WIPE, photos: 8, texts: { headline: 'Trusted by teams everywhere' } },
      { scene: 'biz-testimonials', ms: 4_400, via: PUSH, photos: 3, texts: { headline: 'What our clients say' } },
      END('Let us talk', 'Your Studio', 'Book a call', 'yourstudio.com'),
    ]),
  film('promo-company-intro', 'Company Intro', 'Business Promos', 'mint',
    'Introduce the organisation: the people, how you work, the numbers.', [
      { scene: 'type-soft-focus', ms: 3_000, texts: { headline: 'Hello, we are Your Brand', subline: 'Nice to meet you' } },
      { scene: 'biz-team', ms: 4_000, via: UP, photos: 6, texts: { headline: 'Meet the team' } },
      { scene: 'biz-how-it-works', ms: 4_400, via: PUSH, texts: { headline: 'How we work' } },
      { scene: 'el-metric-cards', ms: 3_800, via: SCALE, texts: { headline: 'So far', stat1: '10 years', label1: 'in business', stat2: '2,400+', label2: 'clients', stat3: '24/7', label3: 'support' } },
      END('Work with us', 'Your Brand', 'Get in touch', 'yourbrand.com'),
    ]),
  film('promo-webinar', 'Webinar Promo', 'Business Promos', 'lilac',
    'Fill a webinar or panel: the session, the date, the speakers, the seat.', [
      { scene: 'biz-webinar', ms: 4_200, photos: 2, texts: { headline: 'Join our free webinar' } },
      { scene: 'el-date-card', ms: 3_200, via: UP, texts: { headline: 'Save the date', day: '14', month: 'NOV', subline: 'Thursday · 2pm GMT' } },
      { scene: 'biz-speakers', ms: 4_000, via: PUSH, photos: 4, texts: { headline: 'Meet our speakers' } },
      { scene: 'el-cta-button', ms: 3_000, via: ZOOM, texts: { headline: 'Save your seat', subline: 'It is free', button: 'Register' } },
    ]),
  film('promo-hiring', 'Hiring Campaign', 'Business Promos', 'sunshine',
    'Recruit with faces: the team, the roles, the way you work, the button.', [
      { scene: 'type-stack-drop', ms: 2_800, texts: { headline: 'We are hiring' } },
      { scene: 'biz-hiring', ms: 4_000, via: SCALE, photos: 6, texts: { headline: 'Join this team' } },
      { scene: 'biz-process-photos', ms: 4_400, via: PUSH, photos: 5, texts: { headline: 'How we work' } },
      { scene: 'el-cta-button', ms: 3_000, via: ZOOM, texts: { headline: 'Apply today', subline: 'It takes five minutes', button: 'See roles' } },
    ]),
];

export const AD_FILMS: readonly AdTemplate[] = [...TEXT_STORIES, ...PRODUCT_FILMS, ...BUSINESS_PROMOS];
