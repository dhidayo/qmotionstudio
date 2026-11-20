import { describe, expect, it } from 'vitest';
import { createProject } from '@/document/defaults';
import type { Project, SceneInputs } from '@/document/types';
import { FIRST_SCENE } from './index';
import * as actions from './index';

/** A design's own parts (D-159): every change one step, and "untouched" stays absent. */

const inputsOf = (project: Project): SceneInputs => {
  const scene = project.scenes[0];
  if (!scene) throw new Error('no scene');
  return scene.inputs;
};
const run = (project: Project, ...list: actions.Action[]): Project => list.reduce((p, a) => a.apply(p, FIRST_SCENE), project);

describe('part actions', () => {
  const start = createProject({ templateId: 'tn-youtube-bold' });

  it('recolours, deletes, puts back and resets, leaving no trace once undone', () => {
    const coloured = run(start, actions.setShapeColor('shape:mark', { hex: '#ff0000' }));
    expect(inputsOf(coloured).shapeOverrides).toEqual({ 'shape:mark': { color: { hex: '#ff0000' } } });
    const hidden = run(coloured, actions.hideShape('shape:mark'));
    expect(inputsOf(hidden).shapeOverrides?.['shape:mark']).toEqual({ color: { hex: '#ff0000' }, hidden: true });
    const back = run(hidden, actions.showShape('shape:mark'));
    expect(inputsOf(back).shapeOverrides?.['shape:mark']).toEqual({ color: { hex: '#ff0000' } });
    const moved = run(back, actions.nudgeSlot('shape:mark', { offsetX: 0.1 }));
    const reset = run(moved, actions.resetShape('shape:mark'));
    expect('shapeOverrides' in inputsOf(reset)).toBe(false);
    expect(inputsOf(reset).slotTransforms['shape:mark']).toBeUndefined();
    expect('shapeOverrides' in inputsOf(run(coloured, actions.setShapeColor('shape:mark', null)))).toBe(false);
  });

  it('puts every deleted part back in one step', () => {
    const hidden = run(start, actions.hideShape('shape:mark'), actions.hideShape('shape:dots'), actions.setShapeOutline('shape:chip1', { role: 'ink' }));
    const back = run(hidden, actions.showAllShapes());
    expect(inputsOf(back).shapeOverrides).toEqual({ 'shape:chip1': { outline: { role: 'ink' } } });
  });

  it('resets the layout and every part change together, in one step (D-170)', () => {
    const changed = run(
      start,
      actions.nudgeSlot('text:headline', { offsetX: 0.1 }),
      actions.setShapeColor('shape:mark', { hex: '#ff0000' }),
      actions.hideShape('shape:dots'),
      actions.setText('headline', 'Mine'),
    );
    const reset = run(changed, actions.resetSceneLayout());
    expect(inputsOf(reset).slotTransforms).toEqual({});
    expect('shapeOverrides' in inputsOf(reset)).toBe(false);
    expect(inputsOf(reset).texts.headline).toBe('Mine');
    const partsOnly = run(start, actions.hideShape('shape:dots'));
    expect('shapeOverrides' in inputsOf(run(partsOnly, actions.resetSceneLayout()))).toBe(false);
    expect(run(start, actions.resetSceneLayout())).toBe(start);
  });

  it('keeps each change on its entry when a word leaves the list (D-170)', () => {
    const rows = [0, 1, 2].map((j) => [`text:steps#${j}`, `shape:step${j + 1}`]);
    const edited = run(
      start,
      actions.nudgeSlot('text:steps#2', { offsetX: 0.2 }),
      actions.nudgeSlot('text:steps#1', { offsetY: 0.1 }),
      actions.setShapeColor('shape:step3', { hex: '#ff0000' }),
      actions.nudgeSlot('text:headline', { offsetX: 0.05 }),
      actions.setSlotMotion('text:steps#2', { strength: 0 }),
    );
    const removed = run(edited, actions.setListItem('steps', 1, null, { current: 'Plan, Shoot, Edit', count: 3, numbered: false, rows }));
    const after = inputsOf(removed);
    expect(after.texts.steps).toBe('Plan, Edit');
    // Edit's nudge, colour and motion are on Edit, now the second step; Shoot's went with it.
    expect(after.slotTransforms['text:steps#1']?.offsetX).toBe(0.2);
    expect(after.slotTransforms['text:steps#2']).toBeUndefined();
    expect(after.slotTransforms['text:headline']?.offsetX).toBe(0.05);
    expect(after.shapeOverrides).toEqual({ 'shape:step2': { color: { hex: '#ff0000' } } });
    expect(after.slotMotion?.['text:steps#1']?.strength).toBe(0);
    expect(after.slotMotion?.['text:steps#2']).toBeUndefined();
    // Pure: the project before is untouched, so undo is the project before.
    expect(inputsOf(edited).slotTransforms['text:steps#2']?.offsetX).toBe(0.2);
    // Without the drawn rows, an entry is its own key alone.
    const bare = inputsOf(run(edited, actions.setListItem('steps', 0, null, { current: 'Plan, Shoot, Edit', count: 3, numbered: false })));
    expect(bare.slotTransforms['text:steps#1']?.offsetX).toBe(0.2);
    expect(bare.slotTransforms['text:steps#0']?.offsetY).toBe(0.1);
    expect(bare.shapeOverrides).toEqual({ 'shape:step3': { color: { hex: '#ff0000' } } });
    // A number leaves its place empty, so nothing moves.
    const numbered = inputsOf(run(edited, actions.setListItem('steps', 1, null, { current: '1', count: 3, numbered: true, rows })));
    expect(numbered.slotTransforms['text:steps#2']?.offsetX).toBe(0.2);
  });

  it('moves a list entry onto the entry before it by the key that differs only in its numbers', () => {
    const moves = actions.entryRemoval([['text:a#0', 'shape:x1'], ['text:a#1', 'shape:x2'], ['text:a#2', 'shape:x3']], 0);
    expect(Object.fromEntries(moves)).toEqual({
      'text:a#0': null, 'shape:x1': null,
      'text:a#1': 'text:a#0', 'shape:x2': 'shape:x1',
      'text:a#2': 'text:a#1', 'shape:x3': 'shape:x2',
    });
    expect(actions.entryRemoval([['text:a#0']], 3).size).toBe(0);
  });

  it('keeps a photo’s changes on it when a spot before it is taken out (D-170)', () => {
    const photo = (mediaId: string) => ({ mediaId, frame: '3:4' as const, sizeMode: 'template' as const, sizePct: 100, cropMode: 'template' as const });
    const three = run(start, actions.setPhotoCount(3, { min: 1, max: 6 }));
    const scene = three.scenes[0];
    if (!scene) throw new Error('no scene');
    const own: Project = { ...three, scenes: [{ ...scene, inputs: { ...scene.inputs, photos: [photo('mine-a'), photo('sample:x'), photo('mine-b')] } }] };
    const nudged = run(own, actions.nudgeSlot('photo:2', { offsetX: 0.3 }), actions.nudgeSlot('photo:1', { offsetY: 0.2 }));
    // The stepper drops the sample in the middle: mine-b moves up, and its nudge with it.
    const fewer = inputsOf(run(nudged, actions.setPhotoCount(2, { min: 1, max: 6 })));
    expect(fewer.photos.map((p) => p.mediaId)).toEqual(['mine-a', 'mine-b']);
    expect(fewer.slotTransforms['photo:1']?.offsetX).toBe(0.3);
    expect(fewer.slotTransforms['photo:2']).toBeUndefined();
    // Delete on the picture does the same.
    const removed = inputsOf(run(nudged, actions.removePhoto(0)));
    expect(removed.photos.map((p) => p.mediaId)).toEqual(['sample:x', 'mine-b']);
    expect(removed.slotTransforms['photo:0']?.offsetY).toBe(0.2);
    expect(removed.slotTransforms['photo:1']?.offsetX).toBe(0.3);
  });

  it('keeps part changes only while the design stays the same (D-170)', () => {
    const edited = run(
      start,
      actions.setShapeColor('shape:pill', { hex: '#ff0000' }),
      actions.nudgeSlot('shape:pill', { offsetX: 0.1 }),
      actions.setSlotMotion('shape:pill', { strength: 0 }),
      actions.nudgeSlot('text:headline', { offsetX: 0.2 }),
      actions.setText('headline', 'Mine'),
      actions.setTextStyle('headline', { fontId: 'sys:georgia' }),
    );
    const same = inputsOf(run(edited, actions.setTemplate('tn-youtube-bold')));
    expect(same.shapeOverrides).toEqual({ 'shape:pill': { color: { hex: '#ff0000' } } });
    const other = inputsOf(run(edited, actions.setTemplate('tn-how-to')));
    expect('shapeOverrides' in other).toBe(false);
    expect(other.slotTransforms['shape:pill']).toBeUndefined();
    expect('slotMotion' in other).toBe(false);
    // Words, their style and their nudges carry on, as before.
    expect(other.texts.headline).toBe('Mine');
    expect(other.styleOverrides.texts.headline?.fontId).toBe('sys:georgia');
    expect(other.slotTransforms['text:headline']?.offsetX).toBe(0.2);
  });

  it('coalesces a colour drag into one undo step', () => {
    expect(actions.setShapeColor('shape:mark', { hex: '#000000' }).coalesceKey).toBe(actions.setShapeColor('shape:mark', { hex: '#ffffff' }).coalesceKey);
  });

  it('writes one entry of a list back into the whole list', () => {
    const typed = run(start, actions.setListItem('pillarNumbers', 2, '5', { current: '01', count: 4, numbered: true }));
    expect(inputsOf(typed).texts.pillarNumbers).toBe('01, 02, 5, 04');
    const words = run(start, actions.setListItem('steps', 0, null, { current: 'Plan, Shoot, Edit', count: 3, numbered: false }));
    expect(inputsOf(words).texts.steps).toBe('Shoot, Edit');
  });
});
