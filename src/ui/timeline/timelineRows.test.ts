import { describe, expect, it } from 'vitest';
import type { Overlay, OverlayPose, Project, Scene, SlotPose } from '@/document/types';
import { NO_SLOT_TRANSFORM } from '@/document/types';
import { createProject, createScene } from '@/document/defaults';
import * as actions from '@/document/actions';
import { sceneSpans, timelineSpanMs } from '@/document/select/timeline';
import { laneEffects, packEffectRows } from './EffectRows';
import { anyMotion, newRowKinds, timelineRows, type TimelineRows } from './timelineRows';

/**
 * Which rows the timeline draws (D-153): the ruler and the scenes always,
 * everything else only once something is on it.
 */

const pose = (atMs: number): OverlayPose => ({ atMs, transform: { x: 0.5, y: 0.5 } });
const slotPose = (atMs: number): SlotPose => ({ atMs, offsetX: 0, offsetY: 0, scale: 1, rotation: 0 });

const overlay = (id: string, track: number, poses?: readonly OverlayPose[]): Overlay => ({
  id,
  track,
  startMs: 0,
  endMs: 3_000,
  kind: 'text',
  content: { kind: 'text', text: id, style: {
    fontId: 'body', weight: 500, align: 'center', sizePct: 100, color: '',
    wrap: true, shadow: false, outline: false, pill: false, wrapWidthPct: 100, letterSpacingPct: 0,
  } },
  transform: {},
  enterAnim: 'fade',
  exitAnim: 'fade',
  ...(poses === undefined ? {} : { poses }),
});

function ad(scenes = 3): Project {
  const base = createProject({ mode: 'motionAd', templateId: 'kinetic-statement' });
  return { ...base, scenes: Array.from({ length: scenes }, () => createScene('kinetic-statement', 4_000)) };
}

function withSlotPoses(project: Project, index: number, key: string, poses: readonly SlotPose[]): Project {
  const scenes = project.scenes.map((scene, i): Scene => i !== index ? scene : {
    ...scene,
    inputs: { ...scene.inputs, slotTransforms: { ...scene.inputs.slotTransforms, [key]: { ...NO_SLOT_TRANSFORM, poses } } },
  });
  return { ...project, scenes };
}

const fxRows = (project: Project): number =>
  packEffectRows(laneEffects(project, sceneSpans(project.scenes), timelineSpanMs(project))).length;

const NONE: TimelineRows = { motion: false, effectRows: 0, layerRows: 0, music: false, soundRows: 0 };

describe('the rows a project uses', () => {
  it('a new video uses none of the optional rows', () => {
    const project = ad();
    expect(timelineRows(project, fxRows(project))).toEqual(NONE);
  });

  it('layers: as many as are used, plus the spare one to drop onto, up to eight', () => {
    expect(timelineRows({ ...ad(), overlays: [overlay('a', 0)] }, 0).layerRows).toBe(2);
    expect(timelineRows({ ...ad(), overlays: [overlay('a', 2)] }, 0).layerRows).toBe(4);
    const eight = Array.from({ length: 8 }, (_, track) => overlay(`o${track}`, track));
    expect(timelineRows({ ...ad(), overlays: eight }, 0).layerRows).toBe(8);
  });

  it('motion: two poses make a motion, one does not', () => {
    expect(anyMotion({ ...ad(), overlays: [overlay('a', 0, [pose(0)])] })).toBe(false);
    expect(anyMotion({ ...ad(), overlays: [overlay('a', 0, [pose(0), pose(2_000)])] })).toBe(true);
  });

  it('motion: a template element moving in any scene counts, not only the first', () => {
    expect(anyMotion(withSlotPoses(ad(), 1, 'photo:0', [slotPose(0)]))).toBe(false);
    expect(anyMotion(withSlotPoses(ad(), 1, 'photo:0', [slotPose(0), slotPose(1_500)]))).toBe(true);
    expect(anyMotion(withSlotPoses(ad(), 2, 'text:headline', [slotPose(0), slotPose(900), slotPose(1_800)]))).toBe(true);
  });

  it('music: once there is a clip', () => {
    const clip = actions.makeAudioClip('audio:1', { durationMs: 5_000 });
    expect(timelineRows({ ...ad(), audio: [clip] }, 0).music).toBe(true);
  });

  it('sounds: library effects on a row of their own, stacked where they overlap (D-156)', () => {
    const whoosh = actions.makeAudioClip('sound:whoosh', { startMs: 1_000, durationMs: 1_000 });
    const pop = actions.makeAudioClip('sound:pop', { startMs: 1_500, durationMs: 300 });
    const rows = timelineRows({ ...ad(), audio: [whoosh, pop] }, 0);
    expect(rows.soundRows).toBe(2);
    // Effects alone are not music: the Music row stays away.
    expect(rows.music).toBe(false);
    const background = actions.makeAudioClip('sound:lofi-haze', { durationMs: 12_200, loop: { startMs: 100, endMs: 12_100 }, lengthMs: 12_000 });
    expect(timelineRows({ ...ad(), audio: [background] }, 0)).toMatchObject({ music: true, soundRows: 0 });
  });

  it('effects: the packed rows, timeline and scene effects together', () => {
    const scope = { sceneIndex: 1 };
    let project = ad();
    project = actions.addTimelineEffect(actions.makeEffectClip('snow', { startMs: 0, endMs: 6_000 }, 1)).apply(project, scope);
    project = actions.addSceneEffect(actions.makeEffectClip('flash', { startMs: 0, endMs: 1_000 }, 1)).apply(project, scope);
    const rows = fxRows(project);
    // The scene effect overlaps the timeline's, so the two stack.
    expect(rows).toBe(2);
    expect(timelineRows(project, rows).effectRows).toBe(2);
  });
});

describe('a new kind of row', () => {
  it('is news the first time, not when there is more of it', () => {
    expect(newRowKinds(NONE, { ...NONE, effectRows: 1 })).toBe(true);
    expect(newRowKinds(NONE, { ...NONE, layerRows: 2 })).toBe(true);
    expect(newRowKinds(NONE, { ...NONE, motion: true })).toBe(true);
    expect(newRowKinds(NONE, { ...NONE, music: true })).toBe(true);
    expect(newRowKinds(NONE, { ...NONE, soundRows: 1 })).toBe(true);
    expect(newRowKinds({ ...NONE, soundRows: 1 }, { ...NONE, soundRows: 2 })).toBe(false);
    expect(newRowKinds({ ...NONE, effectRows: 1 }, { ...NONE, effectRows: 3 })).toBe(false);
    expect(newRowKinds({ ...NONE, layerRows: 2 }, { ...NONE, layerRows: 3 })).toBe(false);
  });

  it('a row going away is not news either', () => {
    expect(newRowKinds({ ...NONE, music: true, motion: true }, NONE)).toBe(false);
    expect(newRowKinds(NONE, NONE)).toBe(false);
  });
});
