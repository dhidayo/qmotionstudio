import { describe, expect, it } from 'vitest';
import type { Overlay, OverlayPose } from '../types';
import { easeOf, isAnimated, poseAt, poseIndexAt, poseValue, posesOf } from './overlay';

/**
 * Overlay motion, at the document level.
 *
 * The properties that matter here are about *not* surprising anyone: an
 * overlay with no path behaves exactly as one with a single pose, and a pose
 * that says nothing about a property leaves it where it was rather than
 * snapping it to a default.
 */

function overlay(patch: Partial<Overlay> = {}): Overlay {
  return {
    id: 'o1',
    track: 0,
    startMs: 1_000,
    endMs: 5_000,
    kind: 'photo',
    content: { kind: 'photo', mediaId: 'm' },
    transform: { x: 0.25, y: 0.75, scaleX: 1.5, rotation: 10 },
    enterAnim: 'none',
    exitAnim: 'none',
    ...patch,
  };
}

const pose = (atMs: number, transform: OverlayPose['transform']): OverlayPose => ({ atMs, transform });

describe('an overlay with no path', () => {
  it('is not animated', () => {
    expect(isAnimated(overlay())).toBe(false);
    expect(isAnimated(overlay({ poses: [] }))).toBe(false);
    expect(isAnimated(overlay({ poses: [pose(0, { x: 0.5 })] }))).toBe(true);
  });

  it('behaves as though it had one pose at its start', () => {
    const still = overlay();
    expect(posesOf(still)).toEqual([{ atMs: 0, transform: still.transform }]);
    expect(poseAt(still, 0)).toEqual(still.transform);
    expect(poseAt(still, 9_999)).toEqual(still.transform);
  });
});

describe('resting values', () => {
  it('puts an unspecified overlay in the middle, not in the corner', () => {
    // DEFAULT_PROPS has x and y at zero, which is the top-left of the frame.
    // An overlay that says nothing belongs in the centre (D-044), and getting
    // this wrong would fling one into the corner the moment anything else
    // about it was keyframed.
    const empty = pose(0, {});
    expect(poseValue(empty, 'x')).toBe(0.5);
    expect(poseValue(empty, 'y')).toBe(0.5);
    expect(poseValue(empty, 'scaleX')).toBe(1);
    expect(poseValue(empty, 'opacity')).toBe(1);
    expect(poseValue(empty, 'rotation')).toBe(0);
  });

  it('lets scaleY follow scaleX, matching the single Size control', () => {
    expect(poseValue(pose(0, { scaleX: 2 }), 'scaleY')).toBe(2);
    expect(poseValue(pose(0, { scaleX: 2, scaleY: 3 }), 'scaleY')).toBe(3);
  });
});

describe('reading the path', () => {
  const moving = overlay({
    easing: 'linear',
    poses: [pose(0, { x: 0.2, y: 0.5, opacity: 1 }), pose(2_000, { x: 0.8, y: 0.5, opacity: 0.5 })],
  });

  it('holds the first pose before it, and the last after it', () => {
    expect(poseAt(moving, -500).x).toBeCloseTo(0.2, 6);
    expect(poseAt(moving, 0).x).toBeCloseTo(0.2, 6);
    expect(poseAt(moving, 5_000).x).toBeCloseTo(0.8, 6);
  });

  it('interpolates in between', () => {
    const half = poseAt(moving, 1_000);
    expect(half.x).toBeCloseTo(0.5, 6);
    expect(half.opacity).toBeCloseTo(0.75, 6);
  });

  it('returns every property, so a new keyframe can be seeded from it', () => {
    const at = poseAt(moving, 1_000);
    expect(at.x).toBeDefined();
    expect(at.y).toBeDefined();
    expect(at.scaleX).toBeDefined();
    expect(at.scaleY).toBeDefined();
    expect(at.rotation).toBeDefined();
    expect(at.opacity).toBeDefined();
  });
});

describe('finding the keyframe under the playhead', () => {
  const moving = overlay({ poses: [pose(0, { x: 0.2 }), pose(2_000, { x: 0.8 })] });

  it('matches within the tolerance and not outside it', () => {
    expect(poseIndexAt(moving, 2_000, 60)).toBe(1);
    expect(poseIndexAt(moving, 2_040, 60)).toBe(1);
    expect(poseIndexAt(moving, 2_200, 60)).toBe(-1);
    expect(poseIndexAt(moving, 1_000, 60)).toBe(-1);
  });

  it('finds nothing on an overlay that is not animated', () => {
    expect(poseIndexAt(overlay(), 0, 60)).toBe(-1);
  });
});

describe('easing', () => {
  it('maps the three choices, and defaults to smooth', () => {
    expect(easeOf('linear')).toBe('linear');
    expect(easeOf('smooth')).toBe('inOutCubic');
    expect(easeOf(undefined)).toBe('inOutCubic');
    expect(easeOf('springy')).toMatchObject({ kind: 'spring' });
  });
});
