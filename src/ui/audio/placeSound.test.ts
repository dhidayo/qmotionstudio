import { describe, expect, it } from 'vitest';
import { createProject } from '@/document/defaults';
import type { Project } from '@/document/types';
import * as actions from '@/document/actions';
import { clipEndMs } from '@/core/audio/envelope';
import { resolvedAudio, totalDurationMs } from '@/document/select/timeline';
import { SOUND_LIBRARY, soundMediaId, type LibrarySound } from '@/audio/library';
import { placeSound } from './placeSound';

/** Where + Sound puts what it adds (D-156). */

const scope = actions.FIRST_SCENE;
const sound = (id: string): LibrarySound => {
  const found = SOUND_LIBRARY.find((s) => s.id === id);
  if (!found) throw new Error(id);
  return found;
};

function video(): Project {
  return createProject({ mode: 'motionAd', templateId: 'kinetic-statement' });
}

function apply(project: Project, playheadMs: number, id: string): Project {
  const { action } = placeSound(project, playheadMs, sound(id));
  if (!action) throw new Error('expected an action');
  return action.apply(project, scope);
}

describe('a background loop', () => {
  it('runs under the whole video from the start, looping, at its own level', () => {
    const project = apply(video(), 4_000, 'lofi-haze');
    const [clip] = resolvedAudio(project);
    expect(clip).toMatchObject({ mediaId: 'sound:lofi-haze', startMs: 0, loop: true, fitsVideo: true, trimStartMs: 100, trimEndMs: 12_100, gainDb: -3 });
    expect(clip && clipEndMs(clip)).toBe(totalDurationMs(project));
  });

  it('replaces the background already there, keeping the work done on it', () => {
    let project = apply(video(), 0, 'lofi-haze');
    const first = project.audio[0];
    if (!first) throw new Error('expected a clip');
    project = actions.setAudioGain(first.id, -9).apply(project, scope);
    project = apply(project, 0, 'upbeat-pulse');
    expect(project.audio).toHaveLength(1);
    expect(project.audio[0]).toMatchObject({ mediaId: 'sound:upbeat-pulse', gainDb: -9, fitsVideo: true, trimEndMs: 16_100 });
  });

  it('replaces every piece of a split background with one', () => {
    let project = apply(video(), 0, 'lofi-haze');
    project = actions.splitAudio(project.audio[0]?.id ?? '', 3_000).apply(project, scope);
    expect(project.audio).toHaveLength(2);
    project = apply(project, 0, 'cinematic-dawn');
    expect(project.audio.map((c) => c.mediaId)).toEqual(['sound:cinematic-dawn']);
  });

  it('leaves the person’s own music playing alongside', () => {
    const own = actions.makeAudioClip('upload:song', { durationMs: 20_000 });
    const project = apply({ ...video(), audio: [own] }, 0, 'lofi-haze');
    expect(project.audio.map((c) => c.mediaId)).toEqual(['upload:song', 'sound:lofi-haze']);
  });

  it('does nothing when it is already the background', () => {
    const project = apply(video(), 0, 'lofi-haze');
    expect(placeSound(project, 0, sound('lofi-haze')).action).toBeNull();
  });
});

describe('an effect', () => {
  it('goes at the playhead and is selected', () => {
    const placed = placeSound(video(), 2_500, sound('whoosh'));
    const project = placed.action?.apply(video(), scope);
    const clip = project?.audio[0];
    expect(clip).toMatchObject({ mediaId: soundMediaId(sound('whoosh')), startMs: 2_500, trimStartMs: 0, trimEndMs: 1_000, fadeOutMs: 0 });
    expect(clip?.loop).toBeUndefined();
    expect(placed.select).toBe(clip?.id);
  });

  it('is pulled back so it ends with the video, not after it', () => {
    const project = video();
    const videoMs = totalDurationMs(project);
    const after = apply(project, videoMs, 'applause');
    expect(after.audio[0] && clipEndMs(after.audio[0])).toBe(videoMs);
  });
});

it('adds nothing to a design: sounds are for videos', () => {
  const placed = placeSound(createProject({ mode: 'showcase' }), 0, sound('pop'));
  expect(placed.action).toBeNull();
  expect(placed.message).toMatch(/videos/);
});
