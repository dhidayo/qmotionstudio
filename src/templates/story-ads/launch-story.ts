import type { AdTemplate } from '../schema';

/**
 * Launch Story — eight beats, thirty seconds.
 *
 * The shape is the one every product launch reel lands on because it works:
 * hook, context, claim, proof, detail, claim again, breathe, ask. Type-only
 * beats alternate with photo beats so the eye gets a rest between crowded
 * frames, and the transitions get harder toward the middle — a whiteFlash at
 * beat four is the turn, a zoomBlur at beat seven is the run-up to the close.
 *
 * Durations are chosen so no transition exceeds half of either neighbour, which
 * is the point at which D-004's overlap model would start clamping and the
 * declared length would stop matching the rendered one.
 *
 * Total: 30,000ms after overlaps.
 */
const template: AdTemplate = {
  kind: 'ad',
  id: 'launch-story',
  name: 'Launch Story',
  category: 'Story Ads',
  mode: 'motionAd',
  tier: 'free',
  isNew: true,
  supportedAspects: ['9:16', '4:5', '1:1', '4:3'],
  defaultDurationMs: 30_000,
  minDurationMs: 5_000,
  maxDurationMs: 60_000,
  paletteId: 'midnight',
  blurb: 'Eight beats: hook, proof, close. The full launch reel.',
  scenes: [
    {
      templateId: 'kinetic-statement',
      durationMs: 4_000,
      transitionIn: null,
      texts: { headline: 'Six months of work', footer: 'starts here' },
      photoCount: 1,
    },
    {
      templateId: 'depth-parallax',
      durationMs: 4_400,
      transitionIn: { kind: 'crossFade', durationMs: 600 },
      texts: { headline: 'Built for the way you actually work', caption: 'No setup. No account.' },
      photoCount: 3,
    },
    {
      templateId: 'kinetic-statement',
      durationMs: 3_400,
      transitionIn: { kind: 'push', durationMs: 500, direction: 'left' },
      texts: { headline: 'Everything runs on your own machine', footer: 'nothing is uploaded' },
      photoCount: 1,
    },
    {
      templateId: 'angle-fan',
      durationMs: 4_600,
      transitionIn: { kind: 'whiteFlash', durationMs: 400 },
      texts: { headline: 'Twenty-five templates' },
      photoCount: 5,
    },
    {
      templateId: 'depth-stack',
      durationMs: 4_400,
      transitionIn: { kind: 'crossFade', durationMs: 600 },
      texts: { headline: 'One deck, every format' },
      photoCount: 4,
    },
    {
      templateId: 'kinetic-statement',
      durationMs: 3_400,
      transitionIn: { kind: 'wipe', durationMs: 500, direction: 'left' },
      texts: { headline: 'Export in seconds, not minutes', footer: 'MP4 and WebM' },
      photoCount: 1,
    },
    {
      templateId: 'depth-parallax',
      durationMs: 4_400,
      transitionIn: { kind: 'zoomBlur', durationMs: 600 },
      texts: { headline: 'Made by one person, for anyone', caption: 'and it is free to try' },
      photoCount: 3,
    },
    {
      templateId: 'kinetic-statement',
      durationMs: 5_100,
      transitionIn: { kind: 'scale', durationMs: 500 },
      texts: { headline: 'Open it and make something', footer: 'yourname.com' },
      photoCount: 1,
    },
  ],
};

export default template;
