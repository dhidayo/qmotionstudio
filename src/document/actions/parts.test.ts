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
