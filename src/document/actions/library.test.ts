import { describe, expect, it } from 'vitest';
import type { PhotoInput, Project } from '@/document/types';
import { createProject } from '@/document/defaults';
import { projectPhotos, referencedMedia, scenePhotoIds } from '@/document/select/media';
import * as actions from './index';

/**
 * "Your photos" (D-147): adding keeps what was there, each scene picks from
 * the project's photos, and a photo leaves only when the person deletes it.
 */

const here = { sceneIndex: 0 };

const spot = (mediaId: string): PhotoInput => ({ mediaId, frame: '3:4', sizeMode: 'template', sizePct: 100, cropMode: 'template' });

/** A one-scene design with three spots, all showing samples. */
function design(): Project {
  const base = createProject();
  const scene = base.scenes[0];
  if (!scene) throw new Error('no scene');
  const photos = ['sample:a', 'sample:b', 'sample:c'].map(spot);
  return { ...base, scenes: [{ ...scene, inputs: { ...scene.inputs, photos } }] };
}

const shown = (project: Project): string[] => project.scenes[0]?.inputs.photos.map((p) => p.mediaId) ?? [];

describe('Your photos (D-147)', () => {
  it('one camera picture at a time builds up instead of replacing the last', () => {
    let project = design();
    project = actions.addYourPhotos(['cam1'], { maxPhotos: 3 }).apply(project, here);
    expect(shown(project)).toEqual(['cam1', 'cam1', 'cam1']);
    project = actions.addYourPhotos(['cam2'], { maxPhotos: 3 }).apply(project, here);
    expect(shown(project)).toEqual(['cam1', 'cam2', 'cam1']);
    project = actions.addYourPhotos(['cam3'], { maxPhotos: 3 }).apply(project, here);
    expect(shown(project)).toEqual(['cam1', 'cam2', 'cam3']);
    expect(project.photoLibrary).toEqual(['cam1', 'cam2', 'cam3']);
  });

  it('a full scene keeps its photos; the new one waits in Your photos', () => {
    let project = actions.addYourPhotos(['a', 'b', 'c'], { maxPhotos: 3 }).apply(design(), here);
    project = actions.addYourPhotos(['d'], { maxPhotos: 3 }).apply(project, here);
    expect(shown(project)).toEqual(['a', 'b', 'c']);
    expect(projectPhotos(project)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('a photo kept only in Your photos is still saved with the project', () => {
    const project = actions.addToLibrary(['kept']).apply(design(), here);
    expect(referencedMedia(project).has('kept')).toBe(true);
    expect(shown(project)).toEqual(['sample:a', 'sample:b', 'sample:c']);
  });

  it('a scene shows the photos chosen for it, in the order chosen', () => {
    let project = actions.addToLibrary(['a', 'b', 'c']).apply(design(), here);
    project = actions.setScenePhotos(['c', 'a'], { maxPhotos: 3, fallback: [] }).apply(project, here);
    expect(shown(project)).toEqual(['c', 'a', 'c']);
    const scene = project.scenes[0];
    expect(scene === undefined ? [] : scenePhotoIds(scene)).toEqual(['c', 'a']);
  });

  it('taking the last photo out goes back to the samples', () => {
    let project = actions.addYourPhotos(['a'], { maxPhotos: 3 }).apply(design(), here);
    project = actions.setScenePhotos([], { maxPhotos: 3, fallback: ['sample:a', 'sample:b'] }).apply(project, here);
    expect(shown(project)).toEqual(['sample:a', 'sample:b', 'sample:a']);
    expect(projectPhotos(project)).toEqual(['a']);
  });

  it('deleting a photo takes it out of the project and every scene that showed it', () => {
    let project = actions.addYourPhotos(['a', 'b'], { maxPhotos: 3 }).apply(design(), here);
    project = actions.removeFromLibrary('a', ['sample:a']).apply(project, here);
    expect(shown(project)).toEqual(['b', 'b', 'b']);
    expect(projectPhotos(project)).toEqual(['b']);
    expect(referencedMedia(project).has('a')).toBe(false);
  });

  it('a project saved before Your photos existed lists the photos its scenes show', () => {
    const project = actions.placeOwnPhotos(['old1', 'old2']).apply(design(), here);
    expect(project.photoLibrary).toBeUndefined();
    expect(projectPhotos(project)).toEqual(['old1', 'old2']);
    const next = actions.addToLibrary(['new']).apply(project, here);
    expect(next.photoLibrary).toEqual(['old1', 'old2', 'new']);
  });
});
