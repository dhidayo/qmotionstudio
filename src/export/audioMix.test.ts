import { describe, expect, it } from 'vitest';
import { createProject } from '@/document/defaults';
import type { AudioClip } from '@/document/types';
import type { MediaStore } from '@/media/store';
import { AudioNotReadyError, mixForExport } from './audioMix';

/** The export never leaves a sound out without saying so (D-156). */

function store(names: Record<string, string>): MediaStore {
  return {
    has: (id: string) => id in names,
    get: (id: string) => (id in names ? { id, kind: 'audio', name: names[id] } : undefined),
    getAudioBuffer: () => null,
  } as unknown as MediaStore;
}

const clip = (mediaId: string): AudioClip => ({ id: mediaId, mediaId, startMs: 0, trimStartMs: 0, trimEndMs: 1_000, gainDb: 0, fadeInMs: 0, fadeOutMs: 0 });

describe('mixing for export', () => {
  it('stops and names a track that has not loaded, rather than exporting without it', async () => {
    const project = { ...createProject({ mode: 'motionAd' }), audio: [clip('upload:song')] };
    const run = mixForExport(project, store({ 'upload:song': 'Our jingle.mp3' }), 10_000);
    await expect(run).rejects.toBeInstanceOf(AudioNotReadyError);
    await expect(run).rejects.toThrow(/“Our jingle\.mp3” is not ready to export/);
  });

  it('refuses a sound this build does not have', async () => {
    const project = { ...createProject({ mode: 'motionAd' }), audio: [clip('sound:retired')] };
    await expect(mixForExport(project, store({}), 10_000)).rejects.toThrow(/does not have/);
  });

  it('has nothing to mix in a silent project', async () => {
    expect(await mixForExport(createProject({ mode: 'motionAd' }), store({}), 10_000)).toBeNull();
  });
});
