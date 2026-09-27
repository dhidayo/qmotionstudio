import type { AdTemplate } from '../schema';

/**
 * Social Post — three beats, ten seconds.
 *
 * The shortest complete thing in the library, and the one to reach for when the
 * output is a single feed post rather than a reel. Quick Pitch is fifteen seconds
 * and five beats, which is a small film; this is a post that happens to move.
 *
 * Hook, proof, voice, in that order, and it ends on somebody else talking rather
 * than on the house — a claim followed by a number followed by a customer is the
 * whole of advertising compressed as far as it will go.
 *
 * Every sub-template takes exactly one photograph, so this is also the one ad a
 * user can fill from a single picture and still have read as deliberate.
 *
 * Total: 10,000ms after overlaps.
 */
const template: AdTemplate = {
  kind: 'ad',
  id: 'social-post',
  name: 'Social Post',
  category: 'Story Ads',
  mode: 'motionAd',
  tier: 'free',
  isNew: true,
  supportedAspects: ['9:16', '4:5', '1:1', '4:3', '16:9'],
  defaultDurationMs: 10_000,
  minDurationMs: 5_000,
  maxDurationMs: 60_000,
  paletteId: 'paper',
  blurb: 'Three beats in ten seconds: the claim, the number, the customer.',
  scenes: [
    {
      templateId: 'split-band',
      durationMs: 4_000,
      transitionIn: null,
      texts: {
        eyebrow: 'Back in stock',
        headline: 'The one you kept checking for',
        body: 'Restocked in all four sizes this morning. It went in eleven days last time.',
        cta: 'Shop the range',
      },
      photoCount: 1,
    },
    {
      templateId: 'kinetic-counter',
      durationMs: 3_500,
      transitionIn: { kind: 'crossFade', durationMs: 500 },
      texts: {
        figure: '11',
        label: 'days to sell out last time',
        source: 'Spring run, 400 units',
      },
      photoCount: 1,
    },
    {
      templateId: 'kinetic-quote',
      durationMs: 3_500,
      transitionIn: { kind: 'push', durationMs: 500, direction: 'left' },
      texts: {
        quote: 'I wore it three days straight and nobody guessed it was new.',
        attribution: '— Rita M., verified buyer',
      },
      photoCount: 1,
    },
  ],
};

export default template;
