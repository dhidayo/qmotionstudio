import { useSyncExternalStore } from 'react';
import { DEFAULT_WORKSPACE, isWorkspaceId, type WorkspaceId } from '@/templates/workspaces';

/**
 * Which purpose this device is set up for (D-149, D-150).
 *
 * A viewer's preference, not part of any project: it lives in localStorage,
 * never in a saved project or a .qmotion file. Storage can be missing or
 * refuse — a private window — and then the choice lasts for the visit.
 */

export const WORKSPACE_KEY = 'ms.workspace';

export function readStoredWorkspace(storage: Pick<Storage, 'getItem'> | undefined): {
  readonly workspace: WorkspaceId | null;
  readonly storageOk: boolean;
} {
  if (storage === undefined) return { workspace: null, storageOk: false };
  try {
    const raw = storage.getItem(WORKSPACE_KEY);
    return { workspace: isWorkspaceId(raw) ? raw : null, storageOk: true };
  } catch {
    return { workspace: null, storageOk: false };
  }
}

function browserStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

const listeners = new Set<() => void>();
let loaded: { workspace: WorkspaceId | null; storageOk: boolean } | null = null;

function state(): { workspace: WorkspaceId | null; storageOk: boolean } {
  loaded ??= { ...readStoredWorkspace(browserStorage()) };
  return loaded;
}

/** The stored choice, or null when nothing has been chosen on this device. */
export function storedWorkspace(): WorkspaceId | null {
  return state().workspace;
}

/** The workspace in use: the stored choice, or Social until one is made (D-150). */
export function readWorkspace(): WorkspaceId {
  return state().workspace ?? DEFAULT_WORKSPACE;
}

export function setWorkspace(id: WorkspaceId): void {
  const current = state();
  current.workspace = id;
  try { browserStorage()?.setItem(WORKSPACE_KEY, id); } catch { /* for this visit */ }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useWorkspace(): WorkspaceId {
  return useSyncExternalStore(subscribe, readWorkspace, () => DEFAULT_WORKSPACE);
}

/** Whether the person has chosen a purpose on this device yet. */
export function useStoredWorkspace(): WorkspaceId | null {
  return useSyncExternalStore(subscribe, storedWorkspace, () => null);
}

/** Tests only: forget the cached read, so the next one goes back to storage. */
export function resetWorkspaceCache(): void {
  loaded = null;
}
