import { describe, expect, it } from 'vitest';
import type { Overlay, Project } from '@/document/types';
import { createProject } from '@/document/defaults';
import { isAnimated, poseAt } from '@/document/select/overlay';
import * as actions from './index';

/**
 * Overlay keyframes, at the document level.
 *
 * The behaviour worth pinning is the seeding: a keyframe dropped at the
 * playhead has to capture everything the overlay is already doing, or nudging
 * one property would silently reset the others. That is the single commonest
 * way a keyframe editor surprises someone.
 */

const scope: actions.ActionScope = { sceneIndex: 0 };

function withOverlay(patch: Partial<Overlay> = {}): Project {
  const base = createProject({ templateId: 'kinetic-statement' });
  const overlay: Overlay = {
    id: 'o1',
    track: 0,
    startMs: 0,
    endMs: 4_000,
    kind: 'text',
    content: {
      kind: 'text',
      text: 'Hello',
      style: {
        fontId: 'headline', weight: 700, align: 'center', sizePct: 100, color: '',
        wrap: true, shadow: false, outline: false, pill: false,
        wrapWidthPct: 100, letterSpacingPct: 0,
      },
    },
    transform: { x: 0.3, y: 0.4, scaleX: 1.5, rotation: 12, opacity: 0.8 },
    enterAnim: 'none',
    exitAnim: 'none',
    ...patch,
  };
  return { ...base, mode: 'motionAd', overlays: [overlay] };
}

const only = (project: Project): Overlay => {
  const overlay = project.overlays[0];
  if (!overlay) throw new Error('no overlay');
  return overlay;
};

describe('turning movement on and off', () => {
  it('starts from where the overlay already sits, so nothing jumps', () => {
    const before = withOverlay();
    const after = actions.setOverlayAnimated('o1', true, 0).apply(before, scope);
    const overlay = only(after);

    expect(isAnimated(overlay)).toBe(true);
    expect(overlay.poses).toHaveLength(1);
    expect(overlay.poses?.[0]?.transform).toEqual(only(before).transform);
  });

  it('freezes it where the playhead is when switched off', () => {
    const animated = actions.setOverlayAnimated('o1', true, 0).apply(withOverlay(), scope);
    const moved = actions.setOverlayPose('o1', 2_000, { x: 0.9 }).apply(animated, scope);

    // Halfway along, then stop animating: it stays where it looked.
    const atHalf = poseAt(only(moved), 1_000);
    const stopped = actions.setOverlayAnimated('o1', false, 1_000).apply(moved, scope);

    expect(isAnimated(only(stopped))).toBe(false);
    expect(only(stopped).transform.x).toBeCloseTo(atHalf.x ?? -1, 6);
  });
});

describe('writing a keyframe', () => {
  it('captures everything the overlay is doing, not just what was patched', () => {
    const animated = actions.setOverlayAnimated('o1', true, 0).apply(withOverlay(), scope);
    const moved = actions.setOverlayPose('o1', 2_000, { x: 0.9 }).apply(animated, scope);

    const added = only(moved).poses?.[1];
    expect(added?.atMs).toBe(2_000);
    expect(added?.transform.x).toBeCloseTo(0.9, 6);
    // Everything else came along rather than snapping to a default.
    expect(added?.transform.scaleX).toBeCloseTo(1.5, 6);
    expect(added?.transform.rotation).toBeCloseTo(12, 6);
    expect(added?.transform.opacity).toBeCloseTo(0.8, 6);
    expect(added?.transform.y).toBeCloseTo(0.4, 6);
  });

  it('keeps the keyframes in order however they are added', () => {
    let project = actions.setOverlayAnimated('o1', true, 0).apply(withOverlay(), scope);
    project = actions.setOverlayPose('o1', 3_000, { x: 0.9 }).apply(project, scope);
    project = actions.setOverlayPose('o1', 1_500, { x: 0.6 }).apply(project, scope);

    expect(only(project).poses?.map((p) => p.atMs)).toEqual([0, 1_500, 3_000]);
  });

  it('replaces the one already there rather than stacking a second', () => {
    let project = actions.setOverlayAnimated('o1', true, 0).apply(withOverlay(), scope);
    project = actions.setOverlayPose('o1', 2_000, { x: 0.9 }).apply(project, scope);
    // Within the tolerance: the same moment, as far as anyone dragging is
    // concerned — otherwise one gesture would leave a smear of keyframes.
    project = actions.setOverlayPose('o1', 2_030, { x: 0.7 }).apply(project, scope);

    expect(only(project).poses).toHaveLength(2);
    expect(only(project).poses?.[1]?.atMs).toBe(2_000);
    expect(only(project).poses?.[1]?.transform.x).toBeCloseTo(0.7, 6);
  });

  it('turns movement on by itself if it was off', () => {
    const project = actions.setOverlayPose('o1', 1_000, { x: 0.9 }).apply(withOverlay(), scope);
    expect(isAnimated(only(project))).toBe(true);
    expect(only(project).poses?.map((p) => p.atMs)).toEqual([0, 1_000]);
  });
});

describe('removing a keyframe', () => {
  it('takes out the one under the playhead', () => {
    let project = actions.setOverlayAnimated('o1', true, 0).apply(withOverlay(), scope);
    project = actions.setOverlayPose('o1', 2_000, { x: 0.9 }).apply(project, scope);
    project = actions.removeOverlayPose('o1', 2_000).apply(project, scope);

    expect(only(project).poses).toHaveLength(1);
  });

  it('does nothing when the playhead is not on one', () => {
    let project = actions.setOverlayAnimated('o1', true, 0).apply(withOverlay(), scope);
    project = actions.setOverlayPose('o1', 2_000, { x: 0.9 }).apply(project, scope);
    const before = only(project).poses;

    project = actions.removeOverlayPose('o1', 900).apply(project, scope);
    expect(only(project).poses).toEqual(before);
  });

  it('stops animating rather than leaving an empty path', () => {
    // An animated overlay with no keyframes has no defined position at all.
    let project = actions.setOverlayAnimated('o1', true, 0).apply(withOverlay(), scope);
    project = actions.removeOverlayPose('o1', 0).apply(project, scope);

    expect(isAnimated(only(project))).toBe(false);
    expect(only(project).transform.x).toBeCloseTo(0.3, 6);
  });
});

describe('undo grouping', () => {
  it('coalesces a drag at one keyframe, but not across two', () => {
    const a = actions.setOverlayPose('o1', 1_000, {});
    const b = actions.setOverlayPose('o1', 1_040, {});
    const c = actions.setOverlayPose('o1', 2_500, {});

    expect(a.coalesceKey).toBe(b.coalesceKey);
    expect(a.coalesceKey).not.toBe(c.coalesceKey);
  });
});
