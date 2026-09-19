import { describe, expect, it } from 'vitest';
import type { Overlay, Project, Scene } from '@/document/types';
import { createProject, createScene } from '@/document/defaults';
import * as actions from './index';

/**
 * Scene sequencing and overlays (M5).
 *
 * The invariants under test are the ones the renderer depends on and cannot
 * check for itself: a project always has a scene, the first scene never carries
 * a transition (D-004), and an inspector edit lands on the scoped scene rather
 * than on scene zero (D-045).
 */

const scope = (sceneIndex: number): actions.ActionScope => ({ sceneIndex });

function adProject(): Project {
  const base = createProject({ templateId: 'kinetic-statement' });
  const scenes: Scene[] = [
    createScene('kinetic-statement', 3_000),
    { ...createScene('depth-parallax', 4_000), transitionIn: { kind: 'crossFade', durationMs: 500 } },
    { ...createScene('angle-fan', 5_000), transitionIn: { kind: 'push', durationMs: 400, direction: 'left' } },
  ];
  return { ...base, mode: 'motionAd', scenes };
}

describe('the action scope (D-045)', () => {
  it('lands an inspector edit on the selected scene, not on the first', () => {
    const project = adProject();
    const next = actions.setText('headline', 'Beat three').apply(project, scope(2));

    expect(next.scenes[2]?.inputs.texts['headline']).toBe('Beat three');
    expect(next.scenes[0]?.inputs.texts['headline']).toBeUndefined();
  });

  it('leaves the document untouched when the scope points past the end', () => {
    const project = adProject();
    expect(actions.setText('headline', 'nowhere').apply(project, scope(9))).toBe(project);
  });

  it('still edits the single scene in Showcase mode', () => {
    const project = createProject({ templateId: 'kinetic-statement' });
    const next = actions.setGrain(0.4).apply(project, actions.FIRST_SCENE);
    expect(next.scenes[0]?.inputs.look.grain).toBe(0.4);
  });
});

describe('adding and removing scenes', () => {
  it('gives every scene but the first a transition by default', () => {
    const project = adProject();
    const next = actions.addScene(createScene('kinetic-swap', 4_000)).apply(project, scope(0));

    expect(next.scenes).toHaveLength(4);
    expect(next.scenes[3]?.transitionIn).not.toBeNull();
  });

  it('strips the transition from whatever ends up first (D-004)', () => {
    const project = adProject();
    const next = actions.addScene(createScene('kinetic-swap', 4_000), 0).apply(project, scope(0));

    expect(next.scenes[0]?.templateId).toBe('kinetic-swap');
    expect(next.scenes[0]?.transitionIn).toBeNull();
    // …and the one it displaced keeps its own.
    expect(next.scenes[1]?.transitionIn).toBeNull();
  });

  it('refuses to remove the last scene — §5 says a project has one', () => {
    const project = createProject();
    expect(actions.removeScene(0).apply(project, scope(0))).toBe(project);
  });

  it('clears the transition when the second scene becomes the first', () => {
    const project = adProject();
    const next = actions.removeScene(0).apply(project, scope(0));

    expect(next.scenes).toHaveLength(2);
    expect(next.scenes[0]?.templateId).toBe('depth-parallax');
    expect(next.scenes[0]?.transitionIn).toBeNull();
  });

  it('duplicates a scene with a fresh id, so the two are independently editable', () => {
    const project = adProject();
    const next = actions.duplicateScene(1).apply(project, scope(1));

    expect(next.scenes).toHaveLength(4);
    expect(next.scenes[2]?.templateId).toBe('depth-parallax');
    expect(next.scenes[2]?.id).not.toBe(next.scenes[1]?.id);
  });

  it('reorders and re-normalises the first transition in one step', () => {
    const project = adProject();
    const next = actions.moveScene(2, 0).apply(project, scope(0));

    expect(next.scenes.map((s) => s.templateId)).toEqual(['angle-fan', 'kinetic-statement', 'depth-parallax']);
    expect(next.scenes[0]?.transitionIn).toBeNull();
  });

  it('ignores a move that goes nowhere or out of range', () => {
    const project = adProject();
    expect(actions.moveScene(1, 1).apply(project, scope(1))).toBe(project);
    expect(actions.moveScene(1, 7).apply(project, scope(1))).toBe(project);
  });
});

describe('transitions', () => {
  it('clamps the length to something a scene can actually absorb', () => {
    const project = adProject();
    const next = actions.setSceneTransition(1, { durationMs: 99_000 }).apply(project, scope(1));
    expect(next.scenes[1]?.transitionIn?.durationMs).toBe(2_000);
  });

  it('keeps the direction when only the kind changes', () => {
    const project = adProject();
    const next = actions.setSceneTransition(2, { kind: 'wipe' }).apply(project, scope(2));
    expect(next.scenes[2]?.transitionIn).toEqual({ kind: 'wipe', durationMs: 400, direction: 'left' });
  });

  it('will not put a transition on the first scene', () => {
    const project = adProject();
    const next = actions.setSceneTransition(0, { kind: 'zoomBlur' }).apply(project, scope(0));
    expect(next.scenes[0]?.transitionIn).toBeNull();
  });
});

describe('switching modes', () => {
  it('keeps everything on the way into Motion Ads', () => {
    const project = createProject();
    const next = actions.setMode('motionAd').apply(project, scope(0));
    expect(next.mode).toBe('motionAd');
    expect(next.scenes).toHaveLength(1);
  });

  it('keeps the selected scene, not the first, on the way back to Showcase', () => {
    const project = adProject();
    const next = actions.setMode('showcase').apply(project, scope(2));

    expect(next.mode).toBe('showcase');
    expect(next.scenes).toHaveLength(1);
    expect(next.scenes[0]?.templateId).toBe('angle-fan');
    expect(next.scenes[0]?.transitionIn).toBeNull();
  });

  it('drops overlays and audio, which Showcase has no way to show (§5)', () => {
    const overlay = { id: 'o', track: 0, startMs: 0, endMs: 1_000 } as Overlay;
    const project = { ...adProject(), overlays: [overlay] };
    const next = actions.setMode('showcase').apply(project, scope(0));

    expect(next.overlays).toEqual([]);
    expect(next.audio).toEqual([]);
  });
});

describe('overlays', () => {
  const overlay = actions.makeOverlay(
    { kind: 'photo', mediaId: 'sample:dune' },
    { startMs: 1_000, endMs: 4_000, track: 0 },
  );

  const withOverlay = (): Project => actions.addOverlay(overlay).apply(adProject(), scope(0));

  it('adds one at the requested place on the global timeline', () => {
    const project = withOverlay();
    expect(project.overlays).toHaveLength(1);
    expect(project.overlays[0]?.startMs).toBe(1_000);
    expect(project.overlays[0]?.transform).toEqual({ x: 0.5, y: 0.5 });
  });

  it('moves without inverting, however hard it is dragged', () => {
    const project = actions.setOverlayTime(overlay.id, 5_000, 4_800).apply(withOverlay(), scope(0));
    const moved = project.overlays[0];
    expect(moved?.endMs).toBeGreaterThan(moved?.startMs ?? 0);
  });

  it('never goes negative', () => {
    const project = actions.setOverlayTime(overlay.id, -900, 2_000).apply(withOverlay(), scope(0));
    expect(project.overlays[0]?.startMs).toBe(0);
  });

  it('merges a transform patch rather than replacing it', () => {
    let project = actions.setOverlayTransform(overlay.id, { x: 0.2 }).apply(withOverlay(), scope(0));
    project = actions.setOverlayTransform(overlay.id, { rotation: 15 }).apply(project, scope(0));
    expect(project.overlays[0]?.transform).toEqual({ x: 0.2, y: 0.5, rotation: 15 });
  });

  it('ignores a text edit aimed at a photo overlay', () => {
    const before = withOverlay();
    expect(actions.setOverlayText(overlay.id, 'nope').apply(before, scope(0))).toBe(before);
  });

  it('removes by id and leaves the rest alone', () => {
    const project = actions.removeOverlay(overlay.id).apply(withOverlay(), scope(0));
    expect(project.overlays).toEqual([]);
  });

  it('is a no-op for an id that is not there', () => {
    const before = withOverlay();
    expect(actions.removeOverlay('missing').apply(before, scope(0))).toBe(before);
    expect(actions.setOverlayTrack('missing', 2).apply(before, scope(0))).toBe(before);
  });
});
