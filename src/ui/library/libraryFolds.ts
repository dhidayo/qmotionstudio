import { useSyncExternalStore } from 'react';
import { foldedAfterSwitch, knownFolds, type WorkspaceId } from '@/templates/workspaces';

/**
 * Which library groups are folded, per workspace (D-123, D-149).
 *
 * Each workspace remembers its own folds, so the defaults of one never leak
 * into another: Social's folded business groups would otherwise still be
 * folded after a switch to Business. `both` keeps the key the library has
 * always used, so nobody's folds are lost by this change.
 *
 * A small subscribed store rather than component state, because the desktop
 * rail and the Choose a design window can both be on screen at once and must
 * agree. Browser storage, wrapped: a viewer's convenience, lost harmlessly.
 */

export function foldKey(id: WorkspaceId): string {
  return id === 'both' ? 'ms.library.folded' : `ms.library.folded.${id}`;
}

const listeners = new Set<() => void>();
const cache = new Map<WorkspaceId, readonly string[] | null>();

function parse(raw: string | null): readonly string[] | null {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((c): c is string => typeof c === 'string') : null;
  } catch {
    return null;
  }
}

/** Where D-143 remembered "by purpose" or "by style"; the library is always by purpose now (D-160). */
export const RETIRED_GROUP_KEY = 'ms.library.groupBy';
let retired = false;

/**
 * The folds stored for a workspace, or null when the person has not folded
 * anything there. Style-era category names are dropped as they are read, and
 * the first read deletes the retired grouping choice once (D-160).
 */
export function readFolds(id: WorkspaceId): readonly string[] | null {
  if (!retired) {
    retired = true;
    try { localStorage.removeItem(RETIRED_GROUP_KEY); } catch { /* nothing to tidy */ }
  }
  if (!cache.has(id)) {
    let stored: readonly string[] | null;
    try { stored = parse(localStorage.getItem(foldKey(id))); } catch { stored = null; }
    cache.set(id, stored === null ? null : knownFolds(stored));
  }
  return cache.get(id) ?? null;
}

export function writeFolds(id: WorkspaceId, names: readonly string[]): void {
  cache.set(id, names);
  try { localStorage.setItem(foldKey(id), JSON.stringify(names)); } catch { /* remembered for this visit */ }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useStoredFolds(id: WorkspaceId): readonly string[] | null {
  return useSyncExternalStore(subscribe, () => readFolds(id), () => null);
}

/** On a switch: the workspace's own first groups open, the person's other folds stay. */
export function openTopGroups(id: WorkspaceId): void {
  const stored = readFolds(id);
  if (stored !== null) writeFolds(id, foldedAfterSwitch(stored, id));
}
