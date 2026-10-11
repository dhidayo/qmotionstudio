import { useSyncExternalStore } from 'react';
import { renderParams } from '@/dev/renderParams';
import { questionDue, storageReadable, storedWorkspace } from '@/state/workspace';

/**
 * When "What will you make most?" shows (D-149).
 *
 * Due once per device; shown only after the last project has been reopened,
 * so a late restore can never land underneath an answer that already swapped
 * the starter. The quick start waits for it: the tour points at buttons, and
 * a tour drawn under a question would point at nothing anyone can press.
 *
 * `change` is the same window opened from the menu, to change the answer.
 */

export type WorkspaceWindow = 'ask' | 'change' | null;
type AskState = 'pending' | 'open' | 'done';

const listeners = new Set<() => void>();
let ask: AskState | null = null;
let changing = false;
let settled = false;
let starterVersion = 0;

function askState(): AskState {
  ask ??= questionDue({ stored: storedWorkspace(), storageOk: storageReadable(), params: renderParams() }) ? 'pending' : 'done';
  return ask;
}

function emit(): void { for (const listener of listeners) listener(); }

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** The last project has been reopened, or there was none: the question may show. */
export function markRestoreReady(): void {
  if (settled) return;
  settled = true;
  // A choice made while the last project was reopening — from the library or the menu — is the answer.
  if (askState() === 'pending') ask = storedWorkspace() === null ? 'open' : 'done';
  emit();
}

export function restoreSettled(): boolean {
  return settled;
}

export function openWorkspaceWindow(): void {
  changing = true;
  emit();
}

export function closeWorkspaceWindow(): void {
  if (askState() === 'open') ask = 'done';
  changing = false;
  emit();
}

function currentWindow(): WorkspaceWindow {
  if (askState() === 'open') return 'ask';
  return changing ? 'change' : null;
}

export function useWorkspaceWindow(): WorkspaceWindow {
  return useSyncExternalStore(subscribe, currentWindow, () => null);
}

const tourWaiting = (): boolean => askState() !== 'done';

/** True until the first-visit question has been answered or skipped. */
export function useTourWaiting(): boolean {
  return useSyncExternalStore(subscribe, tourWaiting, () => false);
}

/**
 * Counts swaps of the starter design. The quick start remembers which design
 * was open when it began, to know when step one is done; a swap made by a
 * workspace choice is not the person choosing a design, so the tour starts
 * that memory again.
 */
export function bumpStarterVersion(): void {
  starterVersion += 1;
  emit();
}

const readStarterVersion = (): number => starterVersion;

export function useStarterVersion(): number {
  return useSyncExternalStore(subscribe, readStarterVersion, () => 0);
}
