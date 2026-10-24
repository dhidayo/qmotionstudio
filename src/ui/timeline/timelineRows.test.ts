import { describe, expect, it } from 'vitest';
import type { Overlay, OverlayPose, Project, Scene, SlotPose } from '@/document/types';
import { NO_SLOT_TRANSFORM } from '@/document/types';
import { createProject, createScene } from '@/document/defaults';
import * as actions from '@/document/actions';
import { sceneSpans, timelineSpanMs } from '@/document/select/timeline';
import { laneEffects } from './EffectRows';
import {
  anyMotion, newRowKinds, packEffectLanes, sceneMoves, timelineRows, type EffectSpan, type TimelineRows,
} from './timelineRows';

/**
 * Which rows the timeline draws (D-153, D-162): the ruler and the scenes
 * always; the Layers and Audio groups only once something is in them.
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

const effectSpans = (project: Project): EffectSpan[] =>
  laneEffects(project, sceneSpans(project.scenes), timelineSpanMs(project))
    .map((fx) => ({ id: fx.clip.id, startMs: fx.startMs, endMs: fx.endMs }));

const fxLanes = (project: Project): number => packEffectLanes(project.overlays, effectSpans(project)).lanes;

const NONE: TimelineRows = { layerRows: 0, lanes: 0, audioRows: 0 };

describe('the rows a project uses', () => {
  it('a new video uses none of the optional rows', () => {
    const project = ad();
    expect(timelineRows(project, fxLanes(project))).toEqual(NONE);
  });

  it('layers: as many as are used, plus the spare one to drop onto, up to eight', () => {
    expect(timelineRows({ ...ad(), overlays: [overlay('a', 0)] }, 0).layerRows).toBe(2);
    expect(timelineRows({ ...ad(), overlays: [overlay('a', 2)] }, 0).layerRows).toBe(4);
    const eight = Array.from({ length: 8 }, (_, track) => overlay(`o${track}`, track));
    expect(timelineRows({ ...ad(), overlays: eight }, 0).layerRows).toBe(8);
  });

  it('motion has no row: a moving layer adds nothing but its layer (D-162)', () => {
    const moving = { ...ad(), overlays: [overlay('a', 0, [pose(0), pose(2_000)])] };
    expect(timelineRows(moving, 0)).toEqual({ layerRows: 2, lanes: 2, audioRows: 0 });
    expect(timelineRows(withSlotPoses(ad(), 1, 'photo:0', [slotPose(0), slotPose(1_500)]), 0)).toEqual(NONE);
  });

  it('motion: two poses make a motion, one does not', () => {
    expect(anyMotion({ ...ad(), overlays: [overlay('a', 0, [pose(0)])] })).toBe(false);
    expect(anyMotion({ ...ad(), overlays: [overlay('a', 0, [pose(0), pose(2_000)])] })).toBe(true);
  });

  it('motion: a template element moving in any scene counts, not only the first', () => {
    expect(anyMotion(withSlotPoses(ad(), 1, 'photo:0', [slotPose(0)]))).toBe(false);
    expect(anyMotion(withSlotPoses(ad(), 1, 'photo:0', [slotPose(0), slotPose(1_500)]))).toBe(true);
    expect(anyMotion(withSlotPoses(ad(), 2, 'text:headline', [slotPose(0), slotPose(900), slotPose(1_800)]))).toBe(true);
    const moved = withSlotPoses(ad(), 2, 'text:headline', [slotPose(0), slotPose(900)]);
    expect(moved.scenes.map(sceneMoves)).toEqual([false, false, true]);
  });

  it('audio: music and sounds are one group, stacked where they overlap (D-162)', () => {
    const music = actions.makeAudioClip('audio:1', { durationMs: 5_000 });
    expect(timelineRows({ ...ad(), audio: [music] }, 0).audioRows).toBe(1);
    const whoosh = actions.makeAudioClip('sound:whoosh', { startMs: 1_000, durationMs: 1_000 });
    const pop = actions.makeAudioClip('sound:pop', { startMs: 1_500, durationMs: 300 });
    expect(timelineRows({ ...ad(), audio: [whoosh, pop] }, 0).audioRows).toBe(2);
    expect(timelineRows({ ...ad(), audio: [music, whoosh, pop] }, 0).audioRows).toBe(3);
    const later = actions.makeAudioClip('sound:pop', { startMs: 6_000, durationMs: 300 });
    expect(timelineRows({ ...ad(), audio: [music, later] }, 0).audioRows).toBe(1);
  });
});

describe('effects in the Layers group (D-162)', () => {
  it('with no layers, effects take lanes of their own, stacked where they overlap', () => {
    const scope = { sceneIndex: 1 };
    let project = ad();
    project = actions.addTimelineEffect(actions.makeEffectClip('snow', { startMs: 0, endMs: 6_000 }, 1)).apply(project, scope);
    project = actions.addSceneEffect(actions.makeEffectClip('flash', { startMs: 0, endMs: 1_000 }, 1)).apply(project, scope);
    // The scene effect overlaps the timeline's, so the two stack.
    expect(fxLanes(project)).toBe(2);
    expect(timelineRows(project, fxLanes(project))).toEqual({ layerRows: 0, lanes: 2, audioRows: 0 });
  });

  it('an effect sits in a layer’s gap rather than adding a lane', () => {
    const early = { ...overlay('a', 0), startMs: 0, endMs: 2_000 };
    const { laneOf, lanes } = packEffectLanes([early], [{ id: 'fx', startMs: 3_000, endMs: 5_000 }]);
    expect(laneOf.get('fx')).toBe(0);
    expect(lanes).toBe(1);
    expect(timelineRows({ ...ad(), overlays: [early] }, lanes)).toEqual({ layerRows: 2, lanes: 2, audioRows: 0 });
  });

  it('an effect under a layer’s clip moves down to the first lane free at its time', () => {
    const a = { ...overlay('a', 0), startMs: 0, endMs: 4_000 };
    const b = { ...overlay('b', 1), startMs: 0, endMs: 4_000 };
    const packed = packEffectLanes([a, b], [
      { id: 'snow', startMs: 1_000, endMs: 3_000 },
      { id: 'flash', startMs: 2_000, endMs: 2_500 },
    ]);
    // L1 and L2 are busy then, so snow takes the spare lane and flash the next.
    expect(packed.laneOf.get('snow')).toBe(2);
    expect(packed.laneOf.get('flash')).toBe(3);
    expect(timelineRows({ ...ad(), overlays: [a, b] }, packed.lanes)).toEqual({ layerRows: 3, lanes: 4, audioRows: 0 });
  });
});

describe('a new kind of row', () => {
  it('is news the first time, not when there is more of it', () => {
    expect(newRowKinds(NONE, { ...NONE, lanes: 1 })).toBe(true);
    expect(newRowKinds(NONE, { ...NONE, layerRows: 2, lanes: 2 })).toBe(true);
    expect(newRowKinds(NONE, { ...NONE, audioRows: 1 })).toBe(true);
    expect(newRowKinds({ ...NONE, audioRows: 1 }, { ...NONE, audioRows: 2 })).toBe(false);
    expect(newRowKinds({ ...NONE, lanes: 1 }, { ...NONE, lanes: 3 })).toBe(false);
    expect(newRowKinds({ ...NONE, layerRows: 2, lanes: 2 }, { ...NONE, layerRows: 3, lanes: 3 })).toBe(false);
  });

  it('a row going away is not news either', () => {
    expect(newRowKinds({ ...NONE, audioRows: 1, lanes: 2 }, NONE)).toBe(false);
    expect(newRowKinds(NONE, NONE)).toBe(false);
  });
});
