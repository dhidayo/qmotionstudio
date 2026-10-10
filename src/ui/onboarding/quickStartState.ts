import { useSyncExternalStore } from 'react';
import { renderParams } from '@/dev/renderParams';

/**
 * Whether the quick start is showing (D-142). Shown once, on a first visit;
 * closed for good with "Got it"; brought back from the menu.
 */
const KEY = 'ms.quickstart';
const listeners = new Set<() => void>();
let open: boolean | null = null;

function initial(): boolean {
  // Never over a thumbnail or a frozen frame being captured by the build scripts.
  if (renderParams().thumbShortEdge !== null || renderParams().frozenMs !== null) return false;
  try {
    return localStorage.getItem(KEY) !== 'done';
  } catch {
    // No storage: show it, since there is no way to know it was seen.
    return true;
  }
}

function emit(): void { for (const listener of listeners) listener(); }

export function quickStartOpen(): boolean {
  open ??= initial();
  return open;
}

export function showQuickStart(): void { open = true; emit(); }

export function closeQuickStart(): void {
  open = false;
  try { localStorage.setItem(KEY, 'done'); } catch { /* closed for this visit */ }
  emit();
}

export function useQuickStartOpen(): boolean {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; }, quickStartOpen, () => false);
}
