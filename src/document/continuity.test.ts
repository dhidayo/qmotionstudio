import { describe, expect, it } from 'vitest';
import { createProject, createSceneFrom, DEFAULT_LOGO } from './defaults';
import { userPhotoIds } from './select/media';
import type { PhotoInput, Project, Scene } from './types';

/**
 * Continuity (D-098): a new scene, or a template applied over existing work,
 * starts from the person's own photos, logo and look — never back at the
 * samples when they have brought their own.
 */

const photo = (mediaId: string): PhotoInput => ({
  mediaId, frame: '3:4', sizeMode: 'template', sizePct: 100, cropMode: 'template',
});

function withPhotos(ids: readonly string[]): Project {
  const project = createProject();
  const first = project.scenes[0];
  if (!first) throw new Error('no scene');
  return { ...project, scenes: [{ ...first, inputs: { ...first.inputs, photos: ids.map(photo) } }] };
}

describe('the person’s own photographs', () => {
  it('are found across scenes, once each, in order', () => {
    const project = withPhotos(['m:a', 'm:b', 'm:a']);
    expect(userPhotoIds(project)).toEqual(['m:a', 'm:b']);
  });

  it('leave out samples and empty stand-ins', () => {
    const project = withPhotos(['sample:dune', 'm:mine', '__empty_0__']);
    expect(userPhotoIds(project)).toEqual(['m:mine']);
  });

  it('are none in a project that only has samples', () => {
    expect(userPhotoIds(createProject())).toEqual([]);
  });
});

describe('a scene that carries on from another', () => {
  const from: Scene = {
    id: 'scn_prev',
    templateId: 'kinetic-statement',
    durationMs: 5_000,
    transitionIn: null,
    inputs: {
      photos: [photo('m:a')],
      texts: { headline: 'Old words' },
      logo: { ...DEFAULT_LOGO, mediaId: 'logo:brand', placement: 'topRight' },
      look: { palette: { bg: '#111111', surface: '#222222', ink: '#ffffff', inkMuted: '#999999', accent: '#ff6600' },
        background: 'solid', grain: 0.3, vignette: 0.2, speed: 0.5, cornerRadius: 12 },
      styleOverrides: { texts: {} },
      slotTransforms: {},
    },
  };

  it('uses the person’s photos, starting with ones the previous scene did not show', () => {
    const scene = createSceneFrom('pop-scatter', { durationMs: 8_000, photoCount: 3, from, photoIds: ['m:a', 'm:b', 'm:c'] });
    expect(scene.inputs.photos.map((p) => p.mediaId)).toEqual(['m:b', 'm:c', 'm:a']);
  });

  it('keeps the logo and the look, but not the previous scene’s speed', () => {
    const scene = createSceneFrom('pop-scatter', { durationMs: 8_000, photoCount: 1, from, photoIds: ['m:a'] });
    expect(scene.inputs.logo.mediaId).toBe('logo:brand');
    expect(scene.inputs.logo.placement).toBe('topRight');
    expect(scene.inputs.look.palette.accent).toBe('#ff6600');
    expect(scene.inputs.look.background).toBe('solid');
    expect(scene.inputs.look.speed).toBe(1);
  });

  it('starts its text fresh, because text slots differ between designs', () => {
    const scene = createSceneFrom('pop-scatter', { durationMs: 8_000, photoCount: 1, from, photoIds: ['m:a'] });
    expect(scene.inputs.texts).toEqual({});
  });

  it('falls back to the samples only when there is nothing of the person’s own', () => {
    const scene = createSceneFrom('pop-scatter', { durationMs: 8_000, photoCount: 2, from, photoIds: [] });
    expect(scene.inputs.photos.every((p) => p.mediaId.startsWith('sample:'))).toBe(true);
  });

  it('asks for no photos when the design has no slots', () => {
    const scene = createSceneFrom('blank', { durationMs: 6_000, photoCount: 0, from, photoIds: ['m:a'] });
    expect(scene.inputs.photos).toHaveLength(0);
  });
});
