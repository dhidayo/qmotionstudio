import type { ProjectMode } from './types';

/**
 * What the two modes are called on screen (D-155).
 *
 * The document keeps its original ids — 'showcase' and 'motionAd' — because
 * every saved project carries one, and renaming a stored value to change a
 * label would mean a migration for nothing. The names live here, in the
 * document layer, so an undo label ("Switch to Image") can say them without
 * the document reaching into the UI; every other per-mode word is in
 * `src/ui/shell/modeLabels.ts`, built on this.
 *
 *   Image    one design: a post, a thumbnail, a cover. It plays once and rests
 *            on its picture, and saves as an image or a short clip (D-155;
 *            was Design, Lifestyle, Showcase)
 *   Video    scenes in order, with transitions, layers and music; saves as a
 *            video (was Corporate Ads, Motion Ads)
 */
export const MODE_LABEL: Readonly<Record<ProjectMode, string>> = {
  showcase: 'Image',
  motionAd: 'Video',
};
