import { describe, expect, it } from 'vitest';
import { createProject, createScene } from '@/document/defaults';
import * as actions from '@/document/actions';
import type { Overlay, Project } from '@/document/types';
import { asksFirst, imageLoss, imageQuestion } from './switchMode';

/** D-168: a video of several scenes, or with sound, asks before it becomes an image, and says exactly what stays. */

const words = (text: string, startMs: number, endMs: number): Overlay =>
  actions.makeOverlay({ kind: 'text', text } as Overlay['content'], { startMs, endMs, track: 0 });

function video(scenes: number, extra: Partial<Project> = {}): Project {
  const base = createProject({ templateId: 'kinetic-statement' });
  return { ...base, mode: 'motionAd', scenes: Array.from({ length: scenes }, () => createScene('kinetic-statement', 3_000)), ...extra };
}

const sound = { id: 'a', mediaId: 'm', startMs: 0, trimStartMs: 0, trimEndMs: 1_000, gainDb: 0, fadeInMs: 0, fadeOutMs: 0 };

describe('switching a video to Image (D-168)', () => {
  it('asks for several scenes or sound, not for one silent scene or an image', () => {
    expect(asksFirst(video(2))).toBe(true);
    expect(asksFirst(video(1, { audio: [sound] }))).toBe(true);
    expect(asksFirst(video(1))).toBe(false);
    expect(asksFirst(createProject())).toBe(false);
  });

  it('names the scenes, the layers and the sound set aside', () => {
    const project = video(5, { overlays: [words('first', 0, 1_000), words('late', 4_000, 5_000)], audio: [sound] });
    expect(imageQuestion(imageLoss(project))).toBe(
      'An image is one scene. Scene 1 stays, with the layers over it; scenes 2–5, the layers over them and the sound are set aside. You can undo this.',
    );
  });

  it('reads right for two scenes, with layers or without, and for one scene with sound', () => {
    expect(imageQuestion(imageLoss(video(2)))).toBe('An image is one scene. Scene 1 stays; scene 2 is set aside. You can undo this.');
    expect(imageQuestion(imageLoss(video(1, { audio: [sound] })))).toBe('An image is one scene. The scene stays; the sound is set aside. You can undo this.');
    expect(imageQuestion(imageLoss(video(2, { overlays: [words('late', 4_000, 5_000)] })))).toBe('An image is one scene. Scene 1 stays; scene 2 and its layers are set aside. You can undo this.');
  });
});
