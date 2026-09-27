import type { AdTemplate } from '../schema';

/**
 * Proof Reel — six beats, twenty-one seconds.
 *
 * Built the other way round from Launch Story. That one opens on a hook and
 * spends its length building desire; this one opens with the claim and then does
 * nothing but substantiate it — a number, what is actually included, the range
 * itself, and somebody who bought it. The close is the only place it asks for
 * anything.
 *
 * For the case where the product is not in doubt but the seller is: a new
 * account, a first campaign, a category where everyone is making the same
 * promise. Desire is not the missing ingredient there, evidence is.
 *
 * Every beat is a different sub-template on purpose. Six scenes of the same
 * layout with different copy reads as a slideshow, and a slideshow makes the
 * claims look like filler however good they are.
 *
 * Total: 21,000ms after overlaps.
 */
const template: AdTemplate = {
  kind: 'ad',
  id: 'proof-reel',
  name: 'Proof Reel',
  category: 'Story Ads',
  mode: 'motionAd',
  tier: 'pro',
  isNew: true,
  supportedAspects: ['9:16', '4:5', '1:1', '4:3', '16:9'],
  defaultDurationMs: 21_000,
  minDurationMs: 5_000,
  maxDurationMs: 60_000,
  paletteId: 'bone',
  blurb: 'Six beats of evidence: the claim, the number, the detail, the voice.',
  scenes: [
    {
      templateId: 'kinetic-statement',
      durationMs: 3_500,
      transitionIn: null,
      texts: { headline: 'Everyone says hand-made', footer: 'here is ours being made' },
      photoCount: 1,
    },
    {
      templateId: 'kinetic-counter',
      durationMs: 3_500,
      transitionIn: { kind: 'crossFade', durationMs: 500 },
      texts: {
        figure: '14',
        label: 'hours of work in every one',
        source: 'Measured across the 2025 run',
      },
      photoCount: 1,
    },
    {
      templateId: 'kinetic-list',
      durationMs: 4_300,
      transitionIn: { kind: 'push', durationMs: 500, direction: 'left' },
      texts: {
        title: "What you're paying for",
        item1: 'Full-grain leather, vegetable tanned',
        item2: 'Hand-stitched seams, not glued',
        item3: 'Repaired free for ten years',
        item4: '',
      },
      photoCount: 1,
    },
    {
      templateId: 'split-panels',
      durationMs: 4_000,
      transitionIn: { kind: 'wipe', durationMs: 500, direction: 'left' },
      texts: { headline: 'Three finishes', caption: 'all of them numbered' },
      photoCount: 3,
    },
    {
      templateId: 'kinetic-quote',
      durationMs: 4_000,
      transitionIn: { kind: 'crossFade', durationMs: 500 },
      texts: {
        quote: 'Second one I have bought. The first is four years old and looks better than new.',
        attribution: '— Daniel O., Manchester',
      },
      photoCount: 1,
    },
    {
      templateId: 'split-band',
      durationMs: 4_150,
      transitionIn: { kind: 'whiteFlash', durationMs: 450 },
      texts: {
        eyebrow: 'Made to order',
        headline: 'Four weeks from now, yours',
        body: 'We cut to order, so nothing is sitting in a warehouse waiting to be discounted.',
        cta: 'Start an order',
      },
      photoCount: 1,
    },
  ],
};

export default template;
