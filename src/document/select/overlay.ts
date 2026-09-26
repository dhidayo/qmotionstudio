import { createProps, resolveProps } from '@/core/anim/interpolate';
import type { AnimatedProp, Ease, Keyframe, PropValues, Tracks } from '@/core/types';
import type { Overlay, OverlayEasing, OverlayPose } from '../types';

/**
 * Overlay motion (§6.1's keyframes, put where a person can reach them).
 *
 * The render core has done keyframed position since M1 — `Tracks`, easings and
 * springs are the heart of it. What was missing was any way for a user to say
 * so. This is the translation: a list of poses in the document becomes the
 * tracks the renderer already understands.
 *
 * Kept pure and document-level so the actions, the renderer and the editor all
 * agree about what an overlay is doing at a given moment. Three separate
 * answers to that question is how a keyframe editor starts lying to people.
 */

/** The props a pose carries. `blur` and the rest are not user motion. */
export const POSE_PROPS = ['x', 'y', 'scaleX', 'scaleY', 'rotation', 'opacity'] as const;

export type PoseProp = (typeof POSE_PROPS)[number];

/**
 * An overlay's resting values.
 *
 * Not `DEFAULT_PROPS`: that has x and y at zero, which is the top-left corner
 * of the frame. An overlay with nothing said about it belongs in the middle
 * (D-044), and a pose that omitted a property would otherwise teleport it into
 * the corner the moment anything else was keyframed.
 */
export const POSE_DEFAULTS: Readonly<Record<PoseProp, number>> = Object.freeze({
  x: 0.5,
  y: 0.5,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  opacity: 1,
});

const SPRING: Ease = { kind: 'spring', stiffness: 170, damping: 20, mass: 1 };

export function easeOf(easing: OverlayEasing | undefined): Ease {
  switch (easing) {
    case 'linear': return 'linear';
    case 'springy': return SPRING;
    default: return 'inOutCubic';
  }
}

/** Is this overlay following a path, rather than sitting still? */
export function isAnimated(overlay: Overlay): boolean {
  return (overlay.poses?.length ?? 0) > 0;
}

/** The poses, or the single implied one for an overlay that is not animated. */
export function posesOf(overlay: Overlay): readonly OverlayPose[] {
  const { poses } = overlay;
  if (poses && poses.length > 0) return poses;
  return [{ atMs: 0, transform: overlay.transform }];
}

/** Reads one property out of a pose, falling back to the resting value. */
export function poseValue(pose: OverlayPose, prop: PoseProp): number {
  const value = pose.transform[prop];
  if (value !== undefined) return value;
  // scaleY follows scaleX when only one was given, matching how the rest of
  // the editor treats a single "Size".
  if (prop === 'scaleY') return pose.transform.scaleX ?? POSE_DEFAULTS.scaleY;
  return POSE_DEFAULTS[prop];
}

/**
 * The keyframes for one property of the path, in the overlay's own local time.
 *
 * `scale` maps a normalised x/y through `toDesign` so the renderer gets design
 * units while the document keeps fractions of the frame (D-044).
 */
export function poseTrack(
  overlay: Overlay,
  prop: PoseProp,
  toDesign: (value: number) => number = (value) => value,
): readonly Keyframe[] {
  const ease = easeOf(overlay.easing);
  return posesOf(overlay).map((pose) => ({
    t: Math.max(0, pose.atMs),
    v: toDesign(poseValue(pose, prop)),
    ease,
  }));
}

/**
 * Where the overlay is at a given moment, in document terms.
 *
 * This is what a new keyframe is seeded from: dropping one at the playhead has
 * to capture *everything* the overlay is doing there, or the properties nobody
 * touched would snap to their defaults the instant a keyframe appeared.
 */
export function poseAt(overlay: Overlay, atMs: number): PropValues {
  const poses = posesOf(overlay);
  const first = poses[0];
  if (poses.length === 1 && first) return { ...first.transform };

  const tracks: Tracks = {};
  for (const prop of POSE_PROPS) {
    tracks[prop as AnimatedProp] = poseTrack(overlay, prop);
  }

  const resolved = resolveProps(tracks, atMs, createProps());
  return {
    x: resolved.x,
    y: resolved.y,
    scaleX: resolved.scaleX,
    scaleY: resolved.scaleY,
    rotation: resolved.rotation,
    opacity: resolved.opacity,
  };
}

/** The pose at `atMs`, if one sits close enough to count as the same moment. */
export function poseIndexAt(
  overlay: Overlay,
  atMs: number,
  toleranceMs: number,
): number {
  const poses = overlay.poses ?? [];
  let best = -1;
  let bestGap = toleranceMs;
  poses.forEach((pose, index) => {
    const gap = Math.abs(pose.atMs - atMs);
    if (gap <= bestGap) {
      best = index;
      bestGap = gap;
    }
  });
  return best;
}
