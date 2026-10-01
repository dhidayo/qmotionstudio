import type { AdTemplate } from '../schema';

/**
 * Soft Showcase — five beats, twenty-four seconds.
 *
 * A product ad built from Soft Pop: the range drifts and lifts across the
 * frame, a customer speaks, and it closes on a block of copy with a button. For
 * the brand whose product is the calm thing — skincare, ceramics, linen,
 * jewellery — where a fast cut would say the wrong thing about it.
 *
 * Every hand-over is a crossfade of the same length. Mixing transitions is what
 * makes most ads lively, and liveliness is exactly what this one is avoiding;
 * the variety is inside the beats, in how each set of photographs leaves.
 *
 * Opens and closes on a single photograph so the product is the first and last
 * thing seen, with the sets of three in between doing the showing.
 *
 * Total: 24,000ms after overlaps.
 */
const template: AdTemplate = {
  kind: 'ad',
  id: 'soft-showcase',
  name: 'Soft Showcase',
  category: 'Story Ads',
  mode: 'motionAd',
  tier: 'pro',
  isNew: true,
  supportedAspects: ['9:16', '4:5', '1:1', '4:3', '16:9'],
  defaultDurationMs: 24_000,
  minDurationMs: 5_000,
  maxDurationMs: 60_000,
  paletteId: 'paper',
  blurb: 'A calm product ad: the range drifts and lifts, a customer speaks, then the offer.',
  scenes: [
    {
      templateId: 'pop-dream',
      durationMs: 5_000,
      transitionIn: null,
      texts: { headline: 'Made slowly. Made well.', caption: 'The autumn collection' },
      photoCount: 2,
    },
    {
      templateId: 'pop-scatter',
      durationMs: 6_500,
      transitionIn: { kind: 'crossFade', durationMs: 600 },
      texts: { headline: 'Every piece, by hand', caption: 'Four finishes, one maker' },
      photoCount: 3,
    },
    {
      templateId: 'kinetic-quote',
      durationMs: 4_500,
      transitionIn: { kind: 'crossFade', durationMs: 600 },
      texts: {
        quote: 'It feels like it was made just for me.',
        attribution: '— Amara O., Lagos',
      },
      photoCount: 1,
    },
    {
      templateId: 'pop-float',
      durationMs: 6_000,
      transitionIn: { kind: 'crossFade', durationMs: 600 },
      texts: { headline: 'Light enough to forget', caption: 'Until someone asks where it’s from' },
      photoCount: 3,
    },
    {
      templateId: 'split-band',
      durationMs: 4_400,
      transitionIn: { kind: 'crossFade', durationMs: 600 },
      texts: {
        eyebrow: 'Now available',
        headline: 'Find your piece',
        body: 'Made to order in small batches. Free delivery on orders over $80.',
        cta: 'Shop the collection',
      },
      photoCount: 1,
    },
  ],
};

export default template;
