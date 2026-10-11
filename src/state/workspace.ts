import { useSyncExternalStore } from 'react';
import type { RenderParams } from '@/dev/renderParams';
import { DEFAULT_WORKSPACE, isWorkspaceId, type WorkspaceId } from '@/templates/workspaces';

/**
 * Which workspace this device is set up for (D-149).
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

/**
 * Whether to ask "What will you make most?" on this load.
 *
 * Asked once per device, returning visitors included. Never over a link that
 * names what to show, nor over a frozen frame or thumbnail being captured by
 * the build scripts, and never when storage cannot remember the answer —
 * asking on every visit would be worse than not asking.
 */
export function questionDue(input: {
  readonly stored: WorkspaceId | null;
  readonly storageOk: boolean;
  readonly params: Pick<RenderParams, 'template' | 'scene' | 'frozenMs' | 'thumbShortEdge'>;
}): boolean {
  const { stored, storageOk, params } = input;
  if (!storageOk || stored !== null) return false;
  return params.template === null && params.scene === null && params.frozenMs === null && params.thumbShortEdge === null;
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

export function storageReadable(): boolean {
  return state().storageOk;
}

/** The workspace in use: the stored choice, or everything in the usual order. */
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

/** Tests only: forget the cached read, so the next one goes back to storage. */
export function resetWorkspaceCache(): void {
  loaded = null;
}
