import type { ProjectMode } from '@/document/types';

/**
 * What the two modes are called on screen.
 *
 * The document keeps its original ids — 'showcase' and 'motionAd' — because
 * every saved project carries one, and renaming a stored value to change a
 * label would mean a migration for nothing. The names people see are here, in
 * one place, so the next rename is one line.
 *
 *   Design   one scene, perfected: a post, a story, a slide — and kept, to
 *            become a scene of a video later (D-140; was Lifestyle, Showcase)
 *   Video    scenes in sequence — new ones or your saved designs — with
 *            transitions, layers, logo and music (was Corporate Ads, Motion Ads)
 */
export const MODE_LABEL: Readonly<Record<ProjectMode, string>> = {
  showcase: 'Design',
  motionAd: 'Video',
};
