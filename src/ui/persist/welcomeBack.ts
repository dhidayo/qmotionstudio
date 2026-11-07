import { useSyncExternalStore } from 'react';
import { renderParams } from '@/dev/renderParams';

/**
 * Whether to ask "Welcome back" (D-168): "it goes straight to my last
 * design … users may be coming back to start a new design".
 *
 * Asked when the app is opened afresh — a new tab or window, or the browser
 * started again — on a project with work in it. Not on a reload of a tab
 * already in use, which is carrying on rather than coming back: a tab notes
 * that it has opened the app in its own session storage, which a reload and
 * an in-app navigation keep and a new tab does not. Never over a deep link,
 * a thumbnail or a frozen frame (the build scripts and the visual suite).
 * Nothing else is remembered: it is asked on every fresh open while there is
 * work.
 */

const TAB_KEY = 'ms.tab';

export type WelcomeBack = { readonly savedAt: number };

/**
 * Whether this tab is opening the app for the first time, read and marked as
 * the app loads — whatever it opens on, a deep link included, so a reload
 * later in the same tab is never taken for a return.
 */
function openedAfresh(): boolean {
  try {
    const fresh = sessionStorage.getItem(TAB_KEY) === null;
    sessionStorage.setItem(TAB_KEY, '1');
    return fresh;
  } catch {
    // No storage: ask, since there is no telling a reload from a new visit.
    return true;
  }
}

const freshTab = openedAfresh();
let state: WelcomeBack | null = null;
const listeners = new Set<() => void>();

function emit(): void { for (const listener of listeners) listener(); }

/** Called once the last project has reopened (useRestore). */
export function offerWelcomeBack(savedAt: number, work: boolean): void {
  const params = renderParams();
  if (!freshTab || !work || params.thumbShortEdge !== null || params.frozenMs !== null) return;
  state = { savedAt };
  emit();
}

export function closeWelcomeBack(): void {
  state = null;
  emit();
}

export function useWelcomeBack(): WelcomeBack | null {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    () => state,
    () => null,
  );
}
