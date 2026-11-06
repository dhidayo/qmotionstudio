import { describe, expect, it } from 'vitest';
import { createProject } from '@/document/defaults';
import type { Project, Scene } from '@/document/types';
import { mediaIdsIn, sceneStillKey, sceneStillProject, stillSize } from './sceneStills';

/** A two-scene video, the second a copy of the first under another id. */
function video(): Project {
  const base = createProject();
  const first = base.scenes[0] as Scene;
  return { ...base, mode: 'motionAd', scenes: [first, { ...first, id: 'scn-two', transitionIn: { kind: 'crossFade', durationMs: 400 } }] };
}

const all = (): boolean => true;

describe('scene stills (D-166)', () => {
  it('a key changes with what the scene shows', () => {
    const project = video();
    const scene = project.scenes[0] as Scene;
    const key = sceneStillKey(project, scene, all);
    const photos = scene.inputs.photos.map((p, i) => (i === 0 ? { ...p, mediaId: 'upload:mine' } : p));
    expect(sceneStillKey(project, { ...scene, inputs: { ...scene.inputs, photos } }, all)).not.toBe(key);
    expect(sceneStillKey(project, { ...scene, inputs: { ...scene.inputs, texts: { headline: 'Ours' } } }, all)).not.toBe(key);
    expect(sceneStillKey(project, { ...scene, templateId: 'another' }, all)).not.toBe(key);
    expect(sceneStillKey(project, { ...scene, durationMs: scene.durationMs + 500 }, all)).not.toBe(key);
    expect(sceneStillKey({ ...project, aspect: '1:1' }, scene, all)).not.toBe(key);
    expect(sceneStillKey(project, { ...scene, inputs: { ...scene.inputs, shapeOverrides: { 'shape:pill': { hidden: true } } } }, all)).not.toBe(key);
  });

  it('a key changes when one of its pictures has been decoded, and not for a picture elsewhere', () => {
    const project = video();
    const scene = project.scenes[0] as Scene;
    const first = scene.inputs.photos[0]?.mediaId ?? '';
    const before = sceneStillKey(project, scene, (id) => id !== first);
    expect(sceneStillKey(project, scene, all)).not.toBe(before);
    expect(sceneStillKey(project, scene, (id) => id !== 'upload:elsewhere')).toBe(sceneStillKey(project, scene, all));
  });

  it('a key ignores what does not change the scene\'s own picture', () => {
    const project = video();
    const scene = project.scenes[1] as Scene;
    const key = sceneStillKey(project, scene, all);
    expect(sceneStillKey({ ...project, name: 'Renamed', overlays: [], audio: [] }, scene, all)).toBe(key);
    // Its place and how it arrives.
    expect(sceneStillKey(project, { ...scene, id: 'moved', transitionIn: null }, all)).toBe(key);
  });

  it('draws the scene alone, as an image, without the video around it', () => {
    const project = { ...video(), pictureAtMs: 1200 };
    const alone = sceneStillProject(project, project.scenes[1] as Scene);
    expect(alone.mode).toBe('showcase');
    expect(alone.scenes).toHaveLength(1);
    expect(alone.scenes[0]?.transitionIn).toBeNull();
    expect(alone.overlays).toEqual([]);
    expect(alone.audio).toEqual([]);
    expect('pictureAtMs' in alone).toBe(false);
  });

  it('is small, with the project\'s shape', () => {
    expect(stillSize({ aspect: '9:16' })).toEqual({ w: 144, h: 256 });
    expect(stillSize({ aspect: '16:9' })).toEqual({ w: 256, h: 144 });
    expect(stillSize({ aspect: '1:1' })).toEqual({ w: 144, h: 144 });
  });

  it('finds every media id, however deep', () => {
    expect([...mediaIdsIn({ a: [{ mediaId: 'x' }], b: { c: { mediaId: 'y' } }, mediaId: 3 })].sort()).toEqual(['x', 'y']);
  });
});
