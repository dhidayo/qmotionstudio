import { describe, expect, it } from 'vitest';
import { readStoredWorkspace, readWorkspace, setWorkspace } from './workspace';

/** D-149, D-150: the purpose is remembered per device, Social until one is chosen. */

describe('the stored workspace (D-149)', () => {
  it('reads a known choice, ignores anything else, and survives blocked storage', () => {
    expect(readStoredWorkspace({ getItem: () => 'business' })).toEqual({ workspace: 'business', storageOk: true });
    expect(readStoredWorkspace({ getItem: () => 'Business' })).toEqual({ workspace: null, storageOk: true });
    expect(readStoredWorkspace({ getItem: () => null })).toEqual({ workspace: null, storageOk: true });
    expect(readStoredWorkspace({ getItem: () => { throw new Error('blocked'); } })).toEqual({ workspace: null, storageOk: false });
    expect(readStoredWorkspace(undefined)).toEqual({ workspace: null, storageOk: false });
  });

  it('falls back to Social, and a choice never throws without storage', () => {
    expect(readWorkspace()).toBe('social');
    expect(() => { setWorkspace('news'); }).not.toThrow();
    expect(readWorkspace()).toBe('news');
  });
});
