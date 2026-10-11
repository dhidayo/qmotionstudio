import { describe, expect, it } from 'vitest';
import { questionDue, readStoredWorkspace, readWorkspace, setWorkspace } from './workspace';

/** D-149: the question is asked once per device, and never where it cannot be remembered. */

const plain = { template: null, scene: null, frozenMs: null, thumbShortEdge: null };

describe('the stored workspace (D-149)', () => {
  it('reads a known choice, ignores anything else, and survives blocked storage', () => {
    expect(readStoredWorkspace({ getItem: () => 'business' })).toEqual({ workspace: 'business', storageOk: true });
    expect(readStoredWorkspace({ getItem: () => 'Business' })).toEqual({ workspace: null, storageOk: true });
    expect(readStoredWorkspace({ getItem: () => null })).toEqual({ workspace: null, storageOk: true });
    expect(readStoredWorkspace({ getItem: () => { throw new Error('blocked'); } })).toEqual({ workspace: null, storageOk: false });
    expect(readStoredWorkspace(undefined)).toEqual({ workspace: null, storageOk: false });
  });

  it('asks only a device with nothing stored, on a plain visit', () => {
    expect(questionDue({ stored: null, storageOk: true, params: plain })).toBe(true);
    expect(questionDue({ stored: 'social', storageOk: true, params: plain })).toBe(false);
    expect(questionDue({ stored: null, storageOk: false, params: plain })).toBe(false);
    expect(questionDue({ stored: null, storageOk: true, params: { ...plain, template: 'type-typewriter' } })).toBe(false);
    expect(questionDue({ stored: null, storageOk: true, params: { ...plain, scene: 'demo' } })).toBe(false);
    expect(questionDue({ stored: null, storageOk: true, params: { ...plain, frozenMs: 1000 } })).toBe(false);
    expect(questionDue({ stored: null, storageOk: true, params: { ...plain, thumbShortEdge: 540 } })).toBe(false);
  });

  it('falls back to everything, and a choice never throws without storage', () => {
    expect(readWorkspace()).toBe('both');
    expect(() => { setWorkspace('news'); }).not.toThrow();
    expect(readWorkspace()).toBe('news');
  });
});
