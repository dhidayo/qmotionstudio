import { useSyncExternalStore } from 'react';

/**
 * What the Purpose bar (D-150) needs to know about the visit.
 *
 * Whether the last project has finished reopening: until it has, choosing a
 * purpose never swaps the open design, because the project on screen may be
 * about to be replaced by the person's own. And how many times a purpose has
 * swapped the starting design, so the quick start can tell a swap it made
 * from a design the person chose (D-148).
 */

const listeners = new Set<() => void>();
let settled = false;
let starterVersion = 0;

function emit(): void { for (const listener of listeners) listener(); }

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** The last project has been reopened, or there was none. */
export function markRestoreReady(): void {
  if (settled) return;
  settled = true;
  emit();
}

export function restoreSettled(): boolean {
  return settled;
}

/**
 * Counts swaps of the starting design. The quick start remembers which
 * design was open when it began, to know when step one is done; a swap made
 * by choosing a purpose is not the person choosing a design, so the tour
 * starts that memory again.
 */
export function bumpStarterVersion(): void {
  starterVersion += 1;
  emit();
}

const readStarterVersion = (): number => starterVersion;

export function useStarterVersion(): number {
  return useSyncExternalStore(subscribe, readStarterVersion, () => 0);
}
