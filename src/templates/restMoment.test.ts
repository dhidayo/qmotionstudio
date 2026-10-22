import { describe, expect, it } from 'vitest';
import { createProject } from '@/document/defaults';
import type { Project } from '@/document/types';
import { sceneTemplates, summaryFor } from './manifest';
import { restMomentMs } from './restMoment';

/** A one-scene image on `templateId`, at a given length and speed. */
function image(templateId: string, durationMs: number, speed = 1, mode: Project['mode'] = 'showcase'): Project {
  const project = createProject({ templateId, mode });
  const scene = project.scenes[0];
  if (!scene) throw new Error('createProject made no scene');
  return {
    ...project,
    scenes: [{ ...scene, durationMs, inputs: { ...scene.inputs, look: { ...scene.inputs.look, speed } } }],
  };
}

describe('the picture moment an image rests on (D-155)', () => {
  it('is the design’s own poster moment when it declares one', () => {
    expect(summaryFor('tn-youtube-bold')?.posterAtMs).toBe(2_400);
    expect(restMomentMs(image('tn-youtube-bold', 6_000))).toBe(2_400);
  });

  it('follows the speed, which plays the design faster or slower', () => {
    expect(restMomentMs(image('tn-youtube-bold', 6_000, 2))).toBe(1_200);
    expect(restMomentMs(image('tn-youtube-bold', 6_000, 0.5))).toBe(4_800);
  });

  it('is the end of a design shortened below its poster moment', () => {
    expect(restMomentMs(image('tn-youtube-bold', 2_000))).toBe(1_999);
  });

  it('is the last frame of a design that declares none', () => {
    expect(summaryFor('type-typewriter')?.posterAtMs).toBeUndefined();
    expect(restMomentMs(image('type-typewriter', 4_000))).toBe(3_999);
    expect(restMomentMs(image('type-typewriter', 4_000, 2))).toBe(1_999);
  });

  it('is the last frame of something that is not in the manifest', () => {
    expect(restMomentMs(image('__demo__', 5_000))).toBe(4_999);
  });

  it('does not exist for a video, which loops', () => {
    expect(restMomentMs(image('tn-youtube-bold', 6_000, 1, 'motionAd'))).toBeNull();
  });

  it('is always a frame of the scene, for every design in the library', () => {
    for (const summary of sceneTemplates()) {
      const at = restMomentMs(image(summary.id, 4_000));
      expect(at, summary.id).not.toBeNull();
      expect(at, summary.id).toBeGreaterThanOrEqual(0);
      expect(at, summary.id).toBeLessThan(4_000);
    }
  });
});
