import type { AdTemplate } from '../schema';

/**
 * Product Drop — seven beats, twenty-five seconds.
 *
 * Tighter and colder than Launch Story. The phrase-swap beats do the selling,
 * so the photo beats are deliberately sparse: a tilt sweep and a single
 * parallax plate, nothing that competes with the type.
 *
 * Pro, because both kinetic-swap and angle-tilt are (§12 badges the card; the
 * gate is on export, not on looking).
 *
 * Total: 25,500ms after overlaps.
 */
const template: AdTemplate = {
  kind: 'ad',
  id: 'product-drop',
  name: 'Product Drop',
  category: 'Story Ads',
  mode: 'motionAd',
  tier: 'pro',
  supportedAspects: ['9:16', '4:5', '1:1', '16:9'],
  defaultDurationMs: 25_500,
  minDurationMs: 5_000,
  maxDurationMs: 60_000,
  paletteId: 'bone',
  blurb: 'Seven cold, tight beats built around two phrase swaps.',
  scenes: [
    {
      templateId: 'kinetic-statement',
      durationMs: 3_200,
      transitionIn: null,
      texts: { headline: 'Thursday. 9am.', footer: 'set a reminder' },
      photoCount: 1,
    },
    {
      templateId: 'kinetic-swap',
      durationMs: 4_600,
      transitionIn: { kind: 'crossFade', durationMs: 500 },
      texts: { headline: 'Smaller', alt: 'Sharper', support: 'the second edition' },
      photoCount: 2,
    },
    {
      templateId: 'angle-tilt',
      durationMs: 5_200,
      transitionIn: { kind: 'push', durationMs: 500, direction: 'up' },
      texts: { kicker: 'Four finishes', headline: 'Pick the one you will not get bored of' },
      photoCount: 4,
    },
    {
      templateId: 'kinetic-statement',
      durationMs: 3_000,
      transitionIn: { kind: 'whiteFlash', durationMs: 350 },
      texts: { headline: 'Same price', footer: 'no, really' },
      photoCount: 1,
    },
    {
      templateId: 'depth-parallax',
      durationMs: 4_400,
      transitionIn: { kind: 'zoomBlur', durationMs: 600 },
      texts: { headline: 'Shipped flat, assembled in a minute', caption: 'one tool, included' },
      photoCount: 3,
    },
    {
      templateId: 'kinetic-swap',
      durationMs: 4_400,
      transitionIn: { kind: 'wipe', durationMs: 500, direction: 'right' },
      texts: { headline: 'Limited', alt: 'Properly limited', support: 'four hundred units' },
      photoCount: 2,
    },
    {
      templateId: 'kinetic-statement',
      durationMs: 3_600,
      transitionIn: { kind: 'scale', durationMs: 450 },
      texts: { headline: 'Thursday.', footer: 'yourname.com/drop' },
      photoCount: 1,
    },
  ],
};

export default template;
