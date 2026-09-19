import type { AdTemplate } from '../schema';

/**
 * Quick Pitch — five beats, fifteen seconds exactly.
 *
 * Sized to the free tier's cap (§1.2) on purpose, so the one ad a free user can
 * export end to end is a complete piece of work rather than a longer template
 * with its last third amputated.
 *
 * Every sub-template here supports all five aspects, which is what lets this be
 * the one ad that survives the aspect switcher untouched.
 *
 * Total: 15,000ms after overlaps.
 */
const template: AdTemplate = {
  kind: 'ad',
  id: 'quick-pitch',
  name: 'Quick Pitch',
  category: 'Story Ads',
  mode: 'motionAd',
  tier: 'free',
  isNew: true,
  supportedAspects: ['9:16', '4:5', '1:1', '4:3', '16:9'],
  defaultDurationMs: 15_000,
  minDurationMs: 5_000,
  maxDurationMs: 60_000,
  paletteId: 'tide',
  blurb: 'Five beats in fifteen seconds — the whole free-tier cap, used well.',
  scenes: [
    {
      templateId: 'kinetic-statement',
      durationMs: 3_200,
      transitionIn: null,
      texts: { headline: 'You have fifteen seconds', footer: 'so does everyone else' },
      photoCount: 1,
    },
    {
      templateId: 'angle-fan',
      durationMs: 4_000,
      transitionIn: { kind: 'crossFade', durationMs: 650 },
      texts: { headline: 'Show the work, not the pitch' },
      photoCount: 5,
    },
    {
      templateId: 'kinetic-statement',
      durationMs: 3_000,
      transitionIn: { kind: 'push', durationMs: 500, direction: 'left' },
      texts: { headline: 'One idea per beat', footer: 'that is the whole trick' },
      photoCount: 1,
    },
    {
      templateId: 'depth-parallax',
      durationMs: 4_000,
      transitionIn: { kind: 'whiteFlash', durationMs: 450 },
      texts: { headline: 'Then get out of the way', caption: 'before they scroll' },
      photoCount: 3,
    },
    {
      templateId: 'kinetic-statement',
      durationMs: 3_000,
      transitionIn: { kind: 'crossFade', durationMs: 600 },
      texts: { headline: 'Your turn', footer: 'yourname.com' },
      photoCount: 1,
    },
  ],
};

export default template;
