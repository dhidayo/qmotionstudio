import { useCallback, useEffect, useState } from 'react';

/**
 * Folding the timeline away (D-153).
 *
 * "Have collapsible timeline in case where it is not actively used to get more
 * view on the canvas depending on the screen size." Folded, the timeline is
 * its header, the ruler and the scenes: enough to play, scrub, add and pick a
 * scene, and every other row is a click away.
 *
 * The choice is a per-device convenience, like the theme — never in a project.
 * Nobody has chosen yet? A short window starts folded and a tall one open.
 */

export const FOLD_KEY = 'ms.timeline';

export type FoldPref = 'open' | 'closed';

/** Below this window height, a timeline nobody has opened or folded starts folded. */
export const FOLD_BELOW_PX = 760;

/** A stored value, or null for anything that is not one — a missing key, an old value, garbage. */
export function parseFold(raw: unknown): FoldPref | null {
  return raw === 'open' || raw === 'closed' ? raw : null;
}

/** The person's own choice wins; without one, the window's height decides. */
export function initialFolded(pref: FoldPref | null, windowHeight: number): boolean {
  if (pref !== null) return pref === 'closed';
  return windowHeight < FOLD_BELOW_PX;
}

export function readFold(): FoldPref | null {
  try {
    return parseFold(localStorage.getItem(FOLD_KEY));
  } catch {
    return null;
  }
}

export function writeFold(pref: FoldPref): void {
  try {
    localStorage.setItem(FOLD_KEY, pref);
  } catch {
    // A remembered fold is a convenience; failing to store it changes nothing.
  }
}

/*
 * Unfolding from outside the timeline: "+ Motion" in the add bar, or on a
 * phone, wants the motion row in view even when another element's motion had
 * already brought it. A plain set of listeners, because the fold is the
 * timeline's own state and nothing else needs to read it.
 */
const revealers = new Set<() => void>();

/** Unfolds the timeline for this visit, without changing what is remembered. */
export function revealTimeline(): void {
  for (const reveal of revealers) reveal();
}

export function useTimelineFold(enabled: boolean): {
  folded: boolean;
  /** The person's own choice: remembered on this device. */
  setFolded: (folded: boolean) => void;
  /** Unfolded for this visit only, because something new appeared on it. */
  reveal: () => void;
} {
  const [folded, setState] = useState(
    () => enabled && initialFolded(readFold(), typeof window === 'undefined' ? FOLD_BELOW_PX : window.innerHeight),
  );
  const setFolded = useCallback((next: boolean): void => {
    setState(next);
    writeFold(next ? 'closed' : 'open');
  }, []);
  const reveal = useCallback((): void => { setState(false); }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    revealers.add(reveal);
    return () => { revealers.delete(reveal); };
  }, [enabled, reveal]);

  return { folded: enabled && folded, setFolded, reveal };
}
