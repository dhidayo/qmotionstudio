import type { ProjectMode } from '@/document/types';

/**
 * What the two modes are called on screen.
 *
 * The document keeps its original ids — 'showcase' and 'motionAd' — because
 * every saved project carries one, and renaming a stored value to change a
 * label would mean a migration for nothing. The names people see are here, in
 * one place, so the next rename is one line.
 *
 *   Lifestyle       one looping scene: a reel, a post, a moment (was Showcase)
 *   Corporate Ads   several scenes, transitions, layers, logo and music
 *                   (was Motion Ads)
 */
export const MODE_LABEL: Readonly<Record<ProjectMode, string>> = {
  showcase: 'Lifestyle',
  motionAd: 'Corporate Ads',
};
