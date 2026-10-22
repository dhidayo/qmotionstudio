import { describe, expect, it } from 'vitest';
import type { Overlay, Project, Scene } from '@/document/types';
import { createProject, createScene } from '@/document/defaults';
import * as actions from '@/document/actions';
import { sceneSpans } from '@/document/select/timeline';
import { addMotionAction, motionTargetOf, motionWindow, type MotionSelection } from './motionTarget';

/** "+ Motion" in the add bar (D-153): what it acts on, and where the motion lands. */

const caption = (patch: Partial<Overlay> = {}): Overlay => ({
  id: 'o1',
  track: 0,
  startMs: 1_000,
  endMs: 5_000,
  kind: 'text',
  content: { kind: 'text', text: 'Hi', style: {
    fontId: 'headline', weight: 700, align: 'center', sizePct: 100, color: '',
    wrap: true, shadow: false, outline: false, pill: false, wrapWidthPct: 100, letterSpacingPct: 0,
  } },
  transform: { x: 0.3, y: 0.4, scaleX: 1.5, rotation: 12, opacity: 0.8 },
  enterAnim: 'none',
  exitAnim: 'none',
  ...patch,
});

function ad(overlays: readonly Overlay[] = [caption()], speeds: readonly number[] = [1, 2, 1]): Project {
  const base = createProject({ mode: 'motionAd', templateId: 'kinetic-statement' });
  const scenes = speeds.map((speed): Scene => {
    const scene = createScene('kinetic-statement', 6_000);
    return { ...scene, inputs: { ...scene.inputs, look: { ...scene.inputs.look, speed } } };
  });
  return { ...base, scenes, overlays };
}

const nothing: MotionSelection = { selectedOverlay: null, selectedSlot: null, selectedScene: 0, playheadMs: 0 };

describe('what + Motion acts on', () => {
  it('an overlay, with the playhead in its own clock, kept inside it', () => {
    const project = ad();
    expect(motionTargetOf(project, { ...nothing, selectedOverlay: 'o1', playheadMs: 2_500 }))
      .toEqual({ kind: 'overlay', id: 'o1', localMs: 1_500, finishBy: 4_000, has: false });
    expect(motionTargetOf(project, { ...nothing, selectedOverlay: 'o1', playheadMs: 200 })).toMatchObject({ localMs: 0 });
    expect(motionTargetOf(project, { ...nothing, selectedOverlay: 'o1', playheadMs: 9_000 })).toMatchObject({ localMs: 4_000 });
  });

  it('a template element, in its scene’s own clock after the scene’s speed', () => {
    const project = ad();
    const second = sceneSpans(project.scenes)[1];
    if (!second) throw new Error('no scene 2');
    const target = motionTargetOf(project, { ...nothing, selectedSlot: 'photo:0', selectedScene: 1, playheadMs: second.startMs + 1_000 });
    // Scene 2 plays at 2×, so a second of timeline is two of the scene's.
    expect(target).toEqual({ kind: 'slot', key: 'photo:0', sceneIndex: 1, localMs: 2_000, sceneMs: 6_000, has: false });
  });

  it('nothing selected, or a selection that cannot move, is nothing', () => {
    expect(motionTargetOf(ad(), nothing)).toBeNull();
    expect(motionTargetOf(ad(), { ...nothing, selectedOverlay: 'gone' })).toBeNull();
    expect(motionTargetOf(ad(), { ...nothing, selectedSlot: 'photo:0', selectedScene: 9 })).toBeNull();
  });

  it('knows when there is already a motion — two poses, not one', () => {
    const one = ad([caption({ poses: [{ atMs: 0, transform: {} }] })]);
    const two = ad([caption({ poses: [{ atMs: 0, transform: {} }, { atMs: 2_000, transform: {} }] })]);
    expect(motionTargetOf(one, { ...nothing, selectedOverlay: 'o1' })).toMatchObject({ has: false });
    expect(motionTargetOf(two, { ...nothing, selectedOverlay: 'o1' })).toMatchObject({ has: true });
  });
});

describe('adding it', () => {
  const scope: actions.ActionScope = { sceneIndex: 0 };

  it('is one step that matches the old two (animate, then add the motion)', () => {
    for (const at of [0, 700, 2_000, 3_999]) {
      const target = motionTargetOf(ad(), { ...nothing, selectedOverlay: 'o1', playheadMs: 1_000 + at });
      if (!target) throw new Error('no target');
      const one = addMotionAction(target).apply(ad(), scope);
      const two = actions.addOverlayMotion('o1', at).apply(actions.setOverlayAnimated('o1', true, at).apply(ad(), scope), scope);
      expect(one.overlays[0]).toEqual(two.overlays[0]);
    }
    for (const key of ['photo:0', 'text:headline']) {
      const target = motionTargetOf(ad(), { ...nothing, selectedSlot: key, playheadMs: 1_500 });
      if (!target) throw new Error('no target');
      const one = addMotionAction(target).apply(ad(), scope);
      const two = actions.addSlotMotion(key, 1_500, 6_000).apply(actions.setSlotAnimated(key, true, 1_500).apply(ad(), scope), scope);
      expect(one.scenes[0]?.inputs.slotTransforms[key]).toEqual(two.scenes[0]?.inputs.slotTransforms[key]);
    }
  });

  it('finishes an overlay’s motion where its exit begins, so its last moment can be seen', () => {
    // A four-second caption that fades out takes its last 420ms to go.
    const fading = ad([caption({ exitAnim: 'fade' })]);
    const target = motionTargetOf(fading, { ...nothing, selectedOverlay: 'o1', playheadMs: 1_000 });
    if (!target) throw new Error('no target');
    expect(target).toMatchObject({ finishBy: 3_580 });
    const poses = addMotionAction(target).apply(fading, scope).overlays[0]?.poses ?? [];
    expect(poses.map((pose) => pose.atMs)).toEqual([0, 3_580]);
    expect(motionWindow(addMotionAction(target).apply(fading, scope), target)).toEqual({ startMs: 1_000, endMs: 4_580 });

    // Too short to finish early and still be a motion: it keeps the whole overlay.
    const brief = ad([caption({ exitAnim: 'fade', endMs: 1_400 })]);
    const short = motionTargetOf(brief, { ...nothing, selectedOverlay: 'o1', playheadMs: 1_000 });
    if (!short) throw new Error('no target');
    expect(addMotionAction(short).apply(brief, scope).overlays[0]?.poses?.map((pose) => pose.atMs)).toEqual([0, 400]);
  });

  it('leaves the element where it is: both ends hold its pose', () => {
    const target = motionTargetOf(ad(), { ...nothing, selectedOverlay: 'o1', playheadMs: 1_000 });
    if (!target) throw new Error('no target');
    const poses = addMotionAction(target).apply(ad(), scope).overlays[0]?.poses ?? [];
    expect(poses).toHaveLength(2);
    expect(poses[0]?.transform).toEqual(poses[1]?.transform);
  });
});

describe('where the motion is on the timeline', () => {
  const scope: actions.ActionScope = { sceneIndex: 1 };

  it('an overlay’s ends, in project time, never the instant it disappears', () => {
    const before = ad();
    const target = motionTargetOf(before, { ...nothing, selectedOverlay: 'o1', playheadMs: 1_000 });
    if (!target) throw new Error('no target');
    expect(motionWindow(before, target)).toBeNull();
    const after = addMotionAction(target).apply(before, scope);
    // The overlay is four seconds long, so the five-second default is clamped to it.
    expect(motionWindow(after, target)).toEqual({ startMs: 1_000, endMs: 4_999 });
  });

  it('a template element’s, through its scene’s start and speed', () => {
    const before = ad();
    const second = sceneSpans(before.scenes)[1];
    if (!second) throw new Error('no scene 2');
    const target = motionTargetOf(before, { ...nothing, selectedSlot: 'photo:0', selectedScene: 1, playheadMs: second.startMs });
    if (!target) throw new Error('no target');
    const after = addMotionAction(target).apply(before, scope);
    // Five seconds of the scene's clock at 2× is two and a half on the timeline.
    expect(motionWindow(after, target)).toEqual({ startMs: second.startMs, endMs: second.startMs + 2_500 });
  });
});
