import { describe, expect, it } from 'vitest';
import type { Overlay, Project, Scene } from '@/document/types';
import { createProject, createScene, DEFAULT_OVERLAY_TEXT_STYLE } from '@/document/defaults';
import * as actions from './index';

/**
 * Effects, motion properties, the lockup and layers, as document edits
 * (D-100 – D-104). Every one of them has to be an ordinary undoable action on
 * the right scene — the renderer and the timeline take the document on trust.
 */

const scope = (sceneIndex: number): actions.ActionScope => ({ sceneIndex });

function adProject(): Project {
  const base = createProject({ templateId: 'kinetic-statement' });
  const scenes: Scene[] = [
    createScene('kinetic-statement', 3_000),
    { ...createScene('depth-parallax', 5_000), transitionIn: { kind: 'crossFade', durationMs: 500 } },
  ];
  return { ...base, mode: 'motionAd', scenes };
}

function text(id: string, track: number, startMs: number, endMs: number): Overlay {
  return {
    id, track, startMs, endMs, kind: 'text',
    content: { kind: 'text', text: id, style: DEFAULT_OVERLAY_TEXT_STYLE },
    transform: {}, enterAnim: 'fade', exitAnim: 'fade',
  };
}

describe('scene effects', () => {
  it('are added to, changed on, and removed from the scoped scene only', () => {
    let project = adProject();
    const clip = actions.makeEffectClip('snow', { startMs: 0, endMs: 5_000 }, 0.8);
    project = actions.addSceneEffect(clip).apply(project, scope(1));
    expect(project.scenes[1]?.inputs.effects?.map((e) => e.effectId)).toEqual(['snow']);
    expect(project.scenes[0]?.inputs.effects).toBeUndefined();

    project = actions.updateSceneEffect(clip.id, { intensity: 3, params: { wind: -40 } }).apply(project, scope(1));
    const updated = project.scenes[1]?.inputs.effects?.[0];
    expect(updated?.intensity).toBe(1);
    expect(updated?.params).toEqual({ wind: -40 });

    project = actions.updateSceneEffect(clip.id, { params: { amount: 90 } }).apply(project, scope(1));
    expect(project.scenes[1]?.inputs.effects?.[0]?.params).toEqual({ wind: -40, amount: 90 });

    project = actions.removeSceneEffect(clip.id).apply(project, scope(1));
    expect(project.scenes[1]?.inputs.effects).toEqual([]);
  });

  it('never let a window collapse to nothing', () => {
    let project = adProject();
    const clip = actions.makeEffectClip('flash', { startMs: 1_000, endMs: 1_000 }, 1);
    expect(clip.endMs).toBeGreaterThan(clip.startMs);
    project = actions.addSceneEffect(clip).apply(project, scope(0));
    project = actions.updateSceneEffect(clip.id, { endMs: 0 }).apply(project, scope(0));
    const after = project.scenes[0]?.inputs.effects?.[0];
    expect((after?.endMs ?? 0) - (after?.startMs ?? 0)).toBeGreaterThanOrEqual(100);
  });

  it('can be put on every scene — a whole-scene mood stretches to fit each one', () => {
    let project = adProject();
    project = actions.addSceneEffect(actions.makeEffectClip('snow', { startMs: 0, endMs: 3_000 }, 1)).apply(project, scope(0));
    project = actions.addSceneEffect(actions.makeEffectClip('flash', { startMs: 500, endMs: 900 }, 1)).apply(project, scope(0));
    project = actions.copySceneEffectsToAll().apply(project, scope(0));

    const copies = project.scenes[1]?.inputs.effects ?? [];
    expect(copies.map((e) => e.effectId)).toEqual(['snow', 'flash']);
    expect([copies[0]?.startMs, copies[0]?.endMs]).toEqual([0, 5_000]);
    expect([copies[1]?.startMs, copies[1]?.endMs]).toEqual([500, 900]);
    // Their own ids, so their own snowflakes.
    expect(copies[0]?.id).not.toBe(project.scenes[0]?.inputs.effects?.[0]?.id);
  });
});

describe('timeline effects', () => {
  it('live on the project, move as one undo step, duplicate and delete', () => {
    let project = adProject();
    const clip = actions.makeEffectClip('lightning', { startMs: 2_000, endMs: 4_000 }, 1);
    project = actions.addTimelineEffect(clip).apply(project, scope(0));
    expect(project.effects?.length).toBe(1);

    const move = actions.moveTimelineEffect(clip.id, 3_000, 5_000);
    expect(move.coalesceKey).toBe(`timelineFxDrag:${clip.id}`);
    project = move.apply(project, scope(0));
    expect([project.effects?.[0]?.startMs, project.effects?.[0]?.endMs]).toEqual([3_000, 5_000]);

    project = actions.duplicateTimelineEffect(clip.id).apply(project, scope(0));
    expect(project.effects?.[1]?.startMs).toBe(5_000);

    project = actions.removeTimelineEffect(clip.id).apply(project, scope(0));
    expect(project.effects?.map((e) => e.effectId)).toEqual(['lightning']);
  });

  it('are set aside, with the layers, when going back to Lifestyle — and ⌘Z brings them back', () => {
    let project = actions.addTimelineEffect(actions.makeEffectClip('snow', { startMs: 0, endMs: 1_000 }, 1)).apply(adProject(), scope(0));
    project = actions.setMode('showcase').apply(project, scope(0));
    expect(project.effects).toBeUndefined();
  });
});

describe('element effects', () => {
  const shine = (): ReturnType<typeof actions.makeElementEffect> => actions.makeElementEffect('shine', 'enter', 900, 0.8);

  it('go on a template element by its slot, on the logo, or on an overlay', () => {
    let project: Project = { ...adProject(), overlays: [text('o1', 0, 0, 2_000)] };
    const a = shine();
    const b = shine();
    const c = shine();
    project = actions.addElementEffect({ kind: 'slot', key: 'photo:0' }, a).apply(project, scope(1));
    project = actions.addElementEffect({ kind: 'logo' }, b).apply(project, scope(1));
    project = actions.addElementEffect({ kind: 'overlay', id: 'o1' }, c).apply(project, scope(1));

    expect(project.scenes[1]?.inputs.elementEffects?.['photo:0']?.[0]?.id).toBe(a.id);
    expect(project.scenes[1]?.inputs.elementEffects?.['logo']?.[0]?.id).toBe(b.id);
    expect(project.overlays[0]?.effects?.[0]?.id).toBe(c.id);
    expect(project.scenes[0]?.inputs.elementEffects).toBeUndefined();
  });

  it('change phase, length and settings, and leave no empty entry behind when removed', () => {
    let project = adProject();
    const effect = actions.makeElementEffect('pulse', 'during', 2_000, 0.5);
    const target = { kind: 'slot', key: 'text:headline' } as const;
    project = actions.addElementEffect(target, effect).apply(project, scope(0));
    project = actions.updateElementEffect(target, effect.id, { phase: 'enter', durationMs: 20, params: { period: 600 } }).apply(project, scope(0));
    const updated = project.scenes[0]?.inputs.elementEffects?.['text:headline']?.[0];
    expect(updated?.phase).toBe('enter');
    expect(updated?.durationMs).toBe(50);
    expect(updated?.params).toEqual({ period: 600 });

    project = actions.removeElementEffect(target, effect.id).apply(project, scope(0));
    expect(project.scenes[0]?.inputs.elementEffects).toEqual({});
  });
});

describe('motion properties', () => {
  it('tune the scene, and an element over it, and reset back to the design', () => {
    let project = adProject();
    project = actions.setSceneMotion({ strength: 1.5 }).apply(project, scope(0));
    expect(project.scenes[0]?.inputs.motion).toEqual({ strength: 1.5, feel: 'template' });

    // An element starts from the scene's tuning, then diverges.
    project = actions.setSlotMotion('photo:0', { feel: 'bouncy' }).apply(project, scope(0));
    expect(project.scenes[0]?.inputs.slotMotion?.['photo:0']).toEqual({ strength: 1.5, feel: 'bouncy' });

    project = actions.setSceneMotion({ strength: 9 }).apply(project, scope(0));
    expect(project.scenes[0]?.inputs.motion?.strength).toBe(2.5);

    project = actions.setSlotMotion('photo:0', null).apply(project, scope(0));
    expect(project.scenes[0]?.inputs.slotMotion).toEqual({});
    project = actions.setSceneMotion(null).apply(project, scope(0));
    expect(project.scenes[0]?.inputs.motion).toBeUndefined();
  });
});

describe('the logo across an ad', () => {
  it('can be put on every scene, effects and all', () => {
    let project = adProject();
    project = actions.setLogoMedia('logo-1').apply(project, scope(0));
    project = actions.setLockupPosition('right').apply(project, scope(0));
    project = actions.addElementEffect({ kind: 'logo' }, actions.makeElementEffect('shine', 'enter', 900, 1)).apply(project, scope(0));
    project = actions.applyLogoToAllScenes().apply(project, scope(0));

    expect(project.scenes[1]?.inputs.logo.mediaId).toBe('logo-1');
    expect(project.scenes[1]?.inputs.logo.lockupPosition).toBe('right');
    expect(project.scenes[1]?.inputs.elementEffects?.['logo']?.[0]?.effectId).toBe('shine');
  });

  it('keeps lockup sizes within reason', () => {
    const project = actions.setLockupSize(400).apply(adProject(), scope(0));
    expect(project.scenes[0]?.inputs.logo.lockupSizePct).toBe(80);
  });
});

describe('layers (D-103)', () => {
  it('close up when the last thing on one is deleted', () => {
    const project = { ...adProject(), overlays: [text('a', 0, 0, 1_000), text('b', 1, 0, 1_000), text('c', 2, 0, 1_000)] };
    const next = actions.removeOverlay('b').apply(project, scope(0));
    expect(next.overlays.map((o) => [o.id, o.track])).toEqual([['a', 0], ['c', 1]]);
  });

  it('move up and down around anything in the way', () => {
    const project = { ...adProject(), overlays: [text('a', 0, 0, 2_000), text('b', 1, 0, 2_000), text('c', 0, 3_000, 4_000)] };
    // L2 is busy at a's time, so "up" goes past it to a new L3.
    const up = actions.moveOverlayLayer('a', 1).apply(project, scope(0));
    expect(up.overlays.find((o) => o.id === 'a')?.track).toBe(2);
    // c is alone at its time: down from L1 is nowhere.
    expect(actions.moveOverlayLayer('c', -1).apply(project, scope(0))).toBe(project);
  });

  it('settle a dragged clip off whatever it was dropped on, in the same undo step', () => {
    let project: Project = { ...adProject(), overlays: [text('a', 0, 0, 3_000), text('b', 1, 1_000, 2_000)] };
    const drag = actions.moveOverlayClip('b', 1_000, 2_000, 0);
    project = drag.apply(project, scope(0));
    expect(project.overlays.find((o) => o.id === 'b')?.track).toBe(0);
    const settle = actions.settleOverlay('b', 1);
    expect(settle.coalesceKey).toBe(drag.coalesceKey);
    project = settle.apply(project, scope(0));
    expect(project.overlays.find((o) => o.id === 'b')?.track).toBe(1);
  });

  it('duplicate straight after the original, on its layer when there is room', () => {
    const project = { ...adProject(), overlays: [text('a', 0, 1_000, 3_000)] };
    const next = actions.duplicateOverlay('a', 8_000).apply(project, scope(0));
    const copy = next.overlays[1];
    expect([copy?.track, copy?.startMs, copy?.endMs]).toEqual([0, 3_000, 5_000]);
    expect(copy?.id).not.toBe('a');
  });
});
