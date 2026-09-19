import { describe, expect, it } from 'vitest';
import type { Project } from '@/document/types';
import {
  canRedo, canUndo, commit, emptyHistory, MAX_HISTORY,
  redo, redoLabel, sealCoalescing, undo, undoLabel,
} from './undo';

/** Only identity matters here; the history stores whole documents opaquely. */
const project = (name: string): Project => ({ name } as unknown as Project);

const a = project('a');
const b = project('b');
const c = project('c');

describe('commit', () => {
  it('records the previous document', () => {
    const { history, project: next } = commit(emptyHistory, a, b, { label: 'Edit' });
    expect(next).toBe(b);
    expect(canUndo(history)).toBe(true);
    expect(undoLabel(history)).toBe('Edit');
  });

  it('records nothing when the document did not change', () => {
    const { history } = commit(emptyHistory, a, a, { label: 'No-op' });
    expect(canUndo(history)).toBe(false);
  });

  it('clears the redo branch — a new edit abandons the old future', () => {
    let state = commit(emptyHistory, a, b, { label: 'One' });
    state = undo(state.history, state.project);
    expect(canRedo(state.history)).toBe(true);

    state = commit(state.history, state.project, c, { label: 'Two' });
    expect(canRedo(state.history)).toBe(false);
  });

  it('bounds the stack', () => {
    let history = emptyHistory;
    let current = a;
    for (let i = 0; i < MAX_HISTORY + 40; i++) {
      const next = project(`p${i}`);
      const result = commit(history, current, next, { label: `Edit ${i}` });
      history = result.history;
      current = result.project;
    }
    expect(history.past.length).toBe(MAX_HISTORY);
  });
});

describe('commit — coalescing', () => {
  it('collapses consecutive commits that share a key', () => {
    // A slider drag: many commits, one undo step.
    let state = commit(emptyHistory, a, b, { label: 'Size', coalesceKey: 'size:photo1' });
    state = commit(state.history, state.project, c, { label: 'Size', coalesceKey: 'size:photo1' });
    expect(state.history.past.length).toBe(1);
  });

  it('undoes a whole drag in one step, back to before it started', () => {
    let state = commit(emptyHistory, a, b, { label: 'Size', coalesceKey: 'size:photo1' });
    state = commit(state.history, state.project, c, { label: 'Size', coalesceKey: 'size:photo1' });

    const undone = undo(state.history, state.project);
    expect(undone.project).toBe(a);
  });

  it('keeps separate entries for different targets', () => {
    // Dragging photo 1's size then photo 2's is two edits, not one.
    let state = commit(emptyHistory, a, b, { label: 'Size', coalesceKey: 'size:photo1' });
    state = commit(state.history, state.project, c, { label: 'Size', coalesceKey: 'size:photo2' });
    expect(state.history.past.length).toBe(2);
  });

  it('does not coalesce discrete actions', () => {
    let state = commit(emptyHistory, a, b, { label: 'Remove photo' });
    state = commit(state.history, state.project, c, { label: 'Remove photo' });
    expect(state.history.past.length).toBe(2);
  });

  it('starts a new entry after the run is sealed', () => {
    // Releasing the slider and dragging again must be two undo steps.
    let state = commit(emptyHistory, a, b, { label: 'Size', coalesceKey: 'size:photo1' });
    const sealed = sealCoalescing(state.history);
    state = commit(sealed, state.project, c, { label: 'Size', coalesceKey: 'size:photo1' });
    expect(state.history.past.length).toBe(2);
  });

  it('sealing an empty or already-discrete history is harmless', () => {
    expect(sealCoalescing(emptyHistory)).toBe(emptyHistory);
    const { history } = commit(emptyHistory, a, b, { label: 'Edit' });
    expect(sealCoalescing(history)).toBe(history);
  });
});

describe('undo and redo', () => {
  it('round-trips', () => {
    const first = commit(emptyHistory, a, b, { label: 'Edit' });
    const undone = undo(first.history, first.project);
    expect(undone.project).toBe(a);

    const redone = redo(undone.history, undone.project);
    expect(redone.project).toBe(b);
  });

  it('walks back through several edits in order', () => {
    let state = commit(emptyHistory, a, b, { label: 'One' });
    state = commit(state.history, state.project, c, { label: 'Two' });

    state = undo(state.history, state.project);
    expect(state.project).toBe(b);
    state = undo(state.history, state.project);
    expect(state.project).toBe(a);
    expect(canUndo(state.history)).toBe(false);
  });

  it('is a no-op at either end', () => {
    expect(undo(emptyHistory, a).project).toBe(a);
    expect(redo(emptyHistory, a).project).toBe(a);
  });

  it('reports the labels for both directions', () => {
    const state = commit(emptyHistory, a, b, { label: 'Remove photo' });
    expect(undoLabel(state.history)).toBe('Remove photo');
    expect(redoLabel(state.history)).toBeNull();

    const undone = undo(state.history, state.project);
    expect(redoLabel(undone.history)).toBe('Remove photo');
  });

  it('survives an undo/redo/undo sequence without losing a step', () => {
    let state = commit(emptyHistory, a, b, { label: 'One' });
    state = commit(state.history, state.project, c, { label: 'Two' });

    state = undo(state.history, state.project);
    state = redo(state.history, state.project);
    expect(state.project).toBe(c);

    state = undo(state.history, state.project);
    state = undo(state.history, state.project);
    expect(state.project).toBe(a);
  });
});
