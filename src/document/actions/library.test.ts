import { describe, expect, it } from 'vitest';
import type { PhotoInput, Project } from '@/document/types';
import { createProject, starterPhotos } from '@/document/defaults';
import { projectPhotos, referencedMedia } from '@/document/select/media';
import * as actions from './index';

/**
 * A design's photo spots and "Your photos" (D-147, D-150).
 *
 * "When users add their photos, please remove a sample photo for each
 * uploaded photos … When user do plus to make design accommodate 6 photos,
 * you use sample photos for those until the number of picture uploaded match
 * the design." Every spot shows one of the person's photos or a sample;
 * adding takes the place of samples, never of a photo of theirs; and a photo
 * leaves the project only when the person deletes it.
 */

const here = { sceneIndex: 0 };
const BOUNDS = { min: 2, max: 6 };

/** A one-scene design whose spots all show samples: dune, tide, canopy, ember… */
function design(spots: number): Project {
  const base = createProject();
  const scene = base.scenes[0];
  if (!scene) throw new Error('no scene');
  return { ...base, scenes: [{ ...scene, inputs: { ...scene.inputs, photos: starterPhotos(spots) } }] };
}

const shown = (project: Project): string[] => project.scenes[0]?.inputs.photos.map((p) => p.mediaId) ?? [];
const spotAt = (project: Project, index: number): PhotoInput | undefined => project.scenes[0]?.inputs.photos[index];
const spot = (mediaId: string): PhotoInput => ({ mediaId, frame: '3:4', sizeMode: 'template', sizePct: 100, cropMode: 'template' });

describe('adding photos takes the place of samples (D-150)', () => {
  it('four spots and three photos: three of yours, then one sample', () => {
    const project = actions.addYourPhotos(['a', 'b', 'c'], { maxPhotos: 6 }).apply(design(4), here);
    expect(shown(project)).toEqual(['a', 'b', 'c', 'sample:ember']);
    expect(project.photoLibrary).toEqual(['a', 'b', 'c']);
  });

  it('camera shots taken one at a time build up instead of replacing each other', () => {
    let project = design(4);
    project = actions.addYourPhotos(['cam1'], { maxPhotos: 6 }).apply(project, here);
    expect(shown(project)).toEqual(['cam1', 'sample:tide', 'sample:canopy', 'sample:ember']);
    project = actions.addYourPhotos(['cam2'], { maxPhotos: 6 }).apply(project, here);
    expect(shown(project)).toEqual(['cam1', 'cam2', 'sample:canopy', 'sample:ember']);
    project = actions.addYourPhotos(['cam3'], { maxPhotos: 6 }).apply(project, here);
    expect(shown(project)).toEqual(['cam1', 'cam2', 'cam3', 'sample:ember']);
    expect(project.photoLibrary).toEqual(['cam1', 'cam2', 'cam3']);
  });

  it('a spot keeps its frame and size; the old picture’s crop goes', () => {
    const base = design(2);
    const scene = base.scenes[0];
    if (!scene) throw new Error('no scene');
    const framed: PhotoInput = { mediaId: 'sample:dune', frame: '1:1', sizeMode: 'larger', sizePct: 140, cropMode: 'original', cropRect: { x: 0, y: 0, w: 0.5, h: 0.5 } };
    const project = { ...base, scenes: [{ ...scene, inputs: { ...scene.inputs, photos: [framed, ...scene.inputs.photos.slice(1)] } }] };
    const next = actions.addYourPhotos(['mine'], { maxPhotos: 6 }).apply(project, here);
    expect(spotAt(next, 0)).toEqual({ mediaId: 'mine', frame: '1:1', sizeMode: 'larger', sizePct: 140, cropMode: 'original' });
  });

  it('more photos than samples add spots up to the design’s limit; the rest wait in Your photos', () => {
    const project = actions.addYourPhotos(['a', 'b', 'c', 'd', 'e'], { maxPhotos: 4 }).apply(design(2), here);
    expect(shown(project)).toEqual(['a', 'b', 'c', 'd']);
    expect(projectPhotos(project)).toEqual(['a', 'b', 'c', 'd', 'e']);
    const plan = actions.placeInSpots(design(2).scenes[0]?.inputs.photos ?? [], ['a', 'b', 'c', 'd', 'e'], 4);
    expect(plan).toMatchObject({ replaced: 2, added: 2, waiting: ['e'] });
  });

  it('never replaces a photo of yours: a full design keeps its photos and the new one waits', () => {
    let project = actions.addYourPhotos(['a', 'b', 'c'], { maxPhotos: 3 }).apply(design(3), here);
    project = actions.addYourPhotos(['d'], { maxPhotos: 3 }).apply(project, here);
    expect(shown(project)).toEqual(['a', 'b', 'c']);
    expect(projectPhotos(project)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('a design with no photo spots places nothing in itself; the photos are kept', () => {
    const project = actions.addYourPhotos(['a'], { maxPhotos: 0 }).apply(design(0), here);
    expect(shown(project)).toEqual([]);
    expect(project.photoLibrary).toEqual(['a']);
    expect(actions.placeInSpots([], ['a'], 0).waiting).toEqual(['a']);
  });

  it('a photo already in the design is not placed twice', () => {
    const project = actions.addYourPhotos(['a'], { maxPhotos: 6 }).apply(design(3), here);
    expect(actions.placePhotos(['a'], { maxPhotos: 6 }).apply(project, here)).toBe(project);
  });
});

describe('the Photo spots stepper (D-150)', () => {
  it('adds spots showing samples not yet shown, never repeats of your photos', () => {
    let project = actions.addYourPhotos(['a', 'b', 'c'], { maxPhotos: 6 }).apply(design(4), here);
    project = actions.setPhotoCount(6, BOUNDS).apply(project, here);
    expect(shown(project)).toEqual(['a', 'b', 'c', 'sample:ember', 'sample:dune', 'sample:tide']);
  });

  it('samples stay until there are enough of your photos to fill the design', () => {
    let project = actions.addYourPhotos(['a', 'b', 'c'], { maxPhotos: 6 }).apply(design(4), here);
    project = actions.setPhotoCount(6, BOUNDS).apply(project, here);
    project = actions.addYourPhotos(['d', 'e'], { maxPhotos: 6 }).apply(project, here);
    expect(shown(project)).toEqual(['a', 'b', 'c', 'd', 'e', 'sample:tide']);
    project = actions.addYourPhotos(['f'], { maxPhotos: 6 }).apply(project, here);
    expect(shown(project)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('fewer spots drop the last ones, within the design’s range', () => {
    const project = actions.addYourPhotos(['a'], { maxPhotos: 6 }).apply(design(4), here);
    expect(shown(actions.setPhotoCount(2, BOUNDS).apply(project, here))).toEqual(['a', 'sample:tide']);
    expect(shown(actions.setPhotoCount(1, BOUNDS).apply(project, here))).toEqual(['a', 'sample:tide']);
  });

  it('a scene with no spots grows from samples', () => {
    expect(shown(actions.setPhotoCount(2, BOUNDS).apply(design(0), here))).toEqual(['sample:dune', 'sample:tide']);
  });
});

describe('taking your photos out of the design (D-150)', () => {
  it('the × on a spot shows a sample there again; the photo stays in Your photos', () => {
    let project = actions.addYourPhotos(['a', 'b'], { maxPhotos: 6 }).apply(design(4), here);
    project = actions.sampleAt(0).apply(project, here);
    expect(shown(project)).toEqual(['sample:dune', 'b', 'sample:canopy', 'sample:ember']);
    expect(projectPhotos(project)).toEqual(['a', 'b']);
    // The freed spot is the first sample spot, so it is the next to be filled.
    project = actions.addYourPhotos(['c'], { maxPhotos: 6 }).apply(project, here);
    expect(shown(project)).toEqual(['c', 'b', 'sample:canopy', 'sample:ember']);
  });

  it('a sample spot is left as it is', () => {
    const project = design(3);
    expect(actions.sampleAt(1).apply(project, here)).toBe(project);
  });

  it('Use samples again puts a different sample in every spot; the photos stay', () => {
    let project = actions.addYourPhotos(['a', 'b', 'c'], { maxPhotos: 6 }).apply(design(4), here);
    project = actions.restoreSamples().apply(project, here);
    expect(shown(project)).toEqual(['sample:dune', 'sample:tide', 'sample:canopy', 'sample:ember']);
    expect(projectPhotos(project)).toEqual(['a', 'b', 'c']);
  });

  it('a photo from Your photos takes the first sample spot, or a new spot, and nothing when full', () => {
    let project = actions.addToLibrary(['kept']).apply(design(3), here);
    project = actions.placePhotos(['kept'], { maxPhotos: 4 }).apply(project, here);
    expect(shown(project)).toEqual(['kept', 'sample:tide', 'sample:canopy']);

    let full = actions.addYourPhotos(['a', 'b'], { maxPhotos: 3 }).apply(design(2), here);
    full = actions.addToLibrary(['spare']).apply(full, here);
    expect(shown(actions.placePhotos(['spare'], { maxPhotos: 3 }).apply(full, here))).toEqual(['a', 'b', 'spare']);
    const fuller = actions.placePhotos(['spare'], { maxPhotos: 3 }).apply(full, here);
    expect(actions.placePhotos(['more'], { maxPhotos: 3 }).apply(fuller, here)).toBe(fuller);
  });

  it('deleting a photo from the project shows samples where it was, and takes it off the canvas', () => {
    let project = actions.addYourPhotos(['a', 'b'], { maxPhotos: 6 }).apply(design(3), here);
    const onTop = actions.makeOverlay({ kind: 'photo', mediaId: 'a' }, { startMs: 0, endMs: 1_000, track: 0 });
    project = actions.addPhotoLayers([onTop]).apply(project, here);
    project = actions.removeFromLibrary('a').apply(project, here);
    expect(shown(project)).toEqual(['sample:dune', 'b', 'sample:canopy']);
    expect(project.overlays).toHaveLength(0);
    expect(projectPhotos(project)).toEqual(['b']);
    expect(referencedMedia(project).has('a')).toBe(false);
  });
});

describe('Your photos (D-147)', () => {
  it('a photo kept only in Your photos is still saved with the project', () => {
    const project = actions.addToLibrary(['kept']).apply(design(3), here);
    expect(referencedMedia(project).has('kept')).toBe(true);
    expect(shown(project)).toEqual(['sample:dune', 'sample:tide', 'sample:canopy']);
  });

  it('photos added on top of a design are kept in Your photos too, in one step', () => {
    const layers = ['x', 'y'].map((mediaId) => actions.makeOverlay({ kind: 'photo', mediaId }, { startMs: 0, endMs: 1_000, track: 0 }));
    const project = actions.addPhotoLayers(layers).apply(design(0), here);
    expect(project.overlays.map((o) => o.id)).toEqual(layers.map((o) => o.id));
    expect(project.photoLibrary).toEqual(['x', 'y']);
  });

  it('a project saved before Your photos existed lists the photos its scenes show', () => {
    const base = design(3);
    // As saved before D-147: photos in the scene, no list of its own.
    const old: Project = { ...base, scenes: base.scenes.map((s) => ({ ...s, inputs: { ...s.inputs, photos: ['old1', 'old2', 'sample:canopy'].map(spot) } })) };
    expect(old.photoLibrary).toBeUndefined();
    expect(projectPhotos(old)).toEqual(['old1', 'old2']);
    const next = actions.addToLibrary(['new']).apply(old, here);
    expect(next.photoLibrary).toEqual(['old1', 'old2', 'new']);
  });

  it('on such a project, taking a photo off a spot keeps it in Your photos', () => {
    const base = design(3);
    const old: Project = { ...base, scenes: base.scenes.map((s) => ({ ...s, inputs: { ...s.inputs, photos: ['old1', 'old2', 'sample:canopy'].map(spot) } })) };
    expect(projectPhotos(actions.sampleAt(0).apply(old, here))).toEqual(['old1', 'old2']);
    expect(projectPhotos(actions.restoreSamples().apply(old, here))).toEqual(['old1', 'old2']);
    expect(projectPhotos(actions.setPhotoCount(1, { min: 1, max: 8 }).apply(old, here))).toEqual(['old1', 'old2']);
  });

  it('fewer spots drop samples before the person\'s photos', () => {
    const base = design(4);
    const mixed: Project = { ...base, scenes: base.scenes.map((s) => ({ ...s, inputs: { ...s.inputs, photos: ['a', 'sample:tide', 'b', 'sample:canopy'].map(spot) } })) };
    expect(shown(actions.setPhotoCount(2, { min: 1, max: 8 }).apply(mixed, here))).toEqual(['a', 'b']);
    expect(shown(actions.setPhotoCount(3, { min: 1, max: 8 }).apply(mixed, here))).toEqual(['a', 'sample:tide', 'b']);
  });
});
