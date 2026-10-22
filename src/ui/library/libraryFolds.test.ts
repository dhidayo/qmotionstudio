import { describe, expect, it, vi } from 'vitest';
import { START_HERE } from '@/templates/workspaces';

/**
 * The library is always by purpose (D-160): the old grouping choice is
 * deleted once, and folds stored while it grouped by style lose their
 * category names but keep the person's purpose folds.
 */

function stubStorage(seed: Record<string, string>): Map<string, string> {
  const map = new Map(Object.entries(seed));
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value); },
    removeItem: (key: string) => { map.delete(key); },
  });
  return map;
}

describe('library folds (D-160)', () => {
  it('deletes the retired grouping choice and drops style-era fold names', async () => {
    const map = stubStorage({
      'ms.library.groupBy': 'style',
      'ms.library.folded.social': JSON.stringify(['Moodboards', 'Text Motion', START_HERE, 'Kinetic Type']),
      'ms.library.folded': JSON.stringify(['Text Motion', 'Elements']),
    });
    vi.resetModules();
    const { readFolds, RETIRED_GROUP_KEY } = await import('./libraryFolds');
    expect(readFolds('social')).toEqual(['Moodboards', START_HERE]);
    expect(map.has(RETIRED_GROUP_KEY)).toBe(false);
    // The pre-workspace key held category names only: nothing folded, as "All" starts.
    expect(readFolds('both')).toEqual([]);
    // Nothing stored is still "nothing folded yet", so the workspace's defaults apply.
    expect(readFolds('news')).toBeNull();
    vi.unstubAllGlobals();
  });

  it('carries on when storage is blocked', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
      removeItem: () => { throw new Error('blocked'); },
    });
    vi.resetModules();
    const { readFolds, writeFolds } = await import('./libraryFolds');
    expect(readFolds('social')).toBeNull();
    writeFolds('social', ['Moodboards']);
    expect(readFolds('social')).toEqual(['Moodboards']);
    vi.unstubAllGlobals();
  });
});
