import { describe, expect, it } from 'vitest';
import { FIRST_SCENE, makeAudioClip, makeOverlay, setTemplate } from '@/document/actions';
import { createSceneFrom, dealPhotos } from '@/document/defaults';
import type { Project } from '@/document/types';
import { sampleMediaId, sampleNamesIn } from '@/media/samples';
import { starterProject } from '@/state/starter';
import { prepareTemplateChange } from '@/state/templateChange';
import { TEMPLATE_MANIFEST } from '@/templates/manifest';
import { loadSceneTemplate } from '@/templates/registry';
import { sceneTrialProject, trialProject } from './trialProject';

/**
 * The project a live preview plays (D-160): the person's own, with the design
 * picked, in their frame shape — and nothing in it that would make the
 * preview fight the editor for sound or for the video decoder.
 */

function busyProject(): Project {
  const base = starterProject('social', { aspect: '4:5' });
  const first = base.scenes[0];
  if (!first) throw new Error('fixture');
  const second = { ...first, id: 'scn-second', inputs: { ...first.inputs, photos: dealPhotos(['mine-2'], 1) } };
  return {
    ...base,
    mode: 'motionAd',
    scenes: [first, second],
    overlays: [
      makeOverlay({ kind: 'customMedia', mediaId: 'clip-1' }, { startMs: 0, endMs: 1000, track: 0 }),
      makeOverlay({ kind: 'photo', mediaId: sampleMediaId('reef') }, { startMs: 0, endMs: 1000, track: 1 }),
    ],
    audio: [makeAudioClip('song-1', { durationMs: 4000 })],
  };
}

const SCENE_DESIGN = TEMPLATE_MANIFEST.find((t) => t.kind === 'scene' && t.listed !== false && t.id !== 'blank');

describe('trialProject (D-160)', () => {
  it('keeps the frame shape, plays silent, and leaves videos on top to the editor', async () => {
    if (!SCENE_DESIGN) throw new Error('fixture');
    const project = busyProject();
    const change = await prepareTemplateChange(project, SCENE_DESIGN.id);
    const trial = trialProject(project, change, 1);
    expect(trial.aspect).toBe('4:5');
    expect(trial.audio).toEqual([]);
    expect(trial.overlays.map((o) => o.content.kind)).toEqual(['photo']);
    // The design lands on the scene the person has selected, as "Use this design" would put it.
    expect(trial.scenes[1]?.templateId).toBe(SCENE_DESIGN.id);
    expect(trial.scenes[0]?.templateId).toBe(project.scenes[0]?.templateId);
    // The project itself is untouched.
    expect(project.audio).toHaveLength(1);
  });
});

describe('sceneTrialProject (D-160)', () => {
  it('replace: the selected scene alone, in the new design, keeping its photos', async () => {
    if (!SCENE_DESIGN) throw new Error('fixture');
    const template = await loadSceneTemplate(SCENE_DESIGN.id);
    const project = busyProject();
    const trial = sceneTrialProject(project, 1, template, 'replace');
    expect(trial.scenes).toHaveLength(1);
    expect(trial.overlays).toEqual([]);
    expect(trial.audio).toEqual([]);
    expect(trial.scenes[0]?.transitionIn).toBeNull();
    const selected = project.scenes[1];
    if (!selected) throw new Error('fixture');
    const durationMs = Math.max(template.minDurationMs, Math.min(selected.durationMs, template.maxDurationMs));
    const expected = setTemplate(template.id, { durationMs, photoSlots: template.photoSlots })
      .apply({ ...project, scenes: [{ ...selected, transitionIn: null }] }, FIRST_SCENE).scenes[0];
    expect(trial.scenes[0]).toEqual(expected);
  });

  it('add: a new scene from the design, with the selected scene’s look and logo carried forward', async () => {
    if (!SCENE_DESIGN) throw new Error('fixture');
    const template = await loadSceneTemplate(SCENE_DESIGN.id);
    const project = busyProject();
    const trial = sceneTrialProject(project, 0, template, 'add');
    const scene = trial.scenes[0];
    expect(trial.scenes).toHaveLength(1);
    expect(scene?.templateId).toBe(template.id);
    expect(scene?.durationMs).toBe(template.defaultDurationMs);
    const made = createSceneFrom(template.id, {
      durationMs: template.defaultDurationMs,
      photoCount: template.photoSlots.default,
      from: project.scenes[0],
      photoIds: ['mine-2'],
    });
    expect({ ...scene, id: '' }).toEqual({ ...made, id: '' });
  });
});

describe('sampleNamesIn (D-160)', () => {
  it('lists the samples on photo spots and photo layers, once each, sorted', () => {
    const project = busyProject();
    const names = sampleNamesIn(project);
    expect(names).toEqual([...new Set(names)].sort());
    expect(names).toContain('reef');
    // Photos of the person's own and videos are not samples.
    expect(names.every((name) => !name.startsWith('mine'))).toBe(true);
  });
});
