import { useEffect, useRef } from 'react';
import { SCHEMA_VERSION, type Project } from '@/document/types';
import { referencedMedia } from '@/document/select/media';
import type { MediaStore } from '@/media/store';
import { persistMedia } from '@/persist/media';
import { writeLastOpened, writeProject } from '@/persist/db';
import { useEditor } from '@/state/store';
import type { SaveState } from './saveState';

/**
 * §13's autosave: "Reloading the tab must not lose work."
 *
 * Debounced rather than written on every action. A slider drag produces an
 * action per pointer move, and a document is small but a write is not free —
 * saving each one would put an IndexedDB transaction on every frame of a drag,
 * competing with the render loop for exactly the wrong reason.
 *
 * Media is written separately and only once per blob (see `persistMedia`):
 * blobs are immutable and keyed by an id that is never reused, so rewriting
 * them on every edit would be megabytes of pointless traffic.
 */

const DEBOUNCE_MS = 700;

export type { SaveState };

export function useAutosave(project: Project, media: MediaStore, enabled: boolean): void {
  const setState = useEditor((s) => s.setSaveState);

  /** Media already on disk, so a save does not rewrite what it wrote before. */
  const known = useRef(new Set<string>());

  /**
   * The newest document, readable from a listener that must not re-subscribe.
   *
   * The flush below is attached once and has to save whatever is current when
   * it fires, not whatever was current when it was attached.
   */
  const latest = useRef({ project, media });
  useEffect(() => { latest.current = { project, media }; }, [project, media]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      setState('saving');
      void save(latest.current.project, latest.current.media, known.current)
        .then(() => {
          if (!cancelled) setState('saved');
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          // §16: never silently swallow. The shell shows this as "not saved",
          // which is the one thing the user must not be wrong about.
          console.error('Could not save the project.', error);
          setState('failed');
        });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [project, media, enabled, setState]);

  /*
   * Save immediately when the page is being hidden or torn down.
   *
   * The debounce leaves a window — edit something and reload within it and the
   * edit is gone, which is precisely the promise §13 makes and precisely the
   * failure people never forgive. `visibilitychange` to hidden is the one
   * event browsers still run work for reliably; `pagehide` is the belt to it.
   *
   * Attached once and reading through a ref, because re-subscribing on every
   * keystroke would be its own kind of waste.
   */
  useEffect(() => {
    if (!enabled) return;

    const flush = (): void => {
      const { project: current, media: store } = latest.current;
      void save(current, store, known.current).catch((error: unknown) => {
        console.error('Could not save the project as the page went away.', error);
      });
    };

    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') flush();
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
    };
  }, [enabled]);
}

/**
 * One write.
 *
 * The document first: it is small, it is what "losing work" actually means,
 * and it goes in one transaction. Blobs can take as long as they like
 * afterwards — a project that reopens with its photographs still arriving is a
 * far better failure than one that reopens with the wrong text.
 */
async function save(project: Project, media: MediaStore, known: Set<string>): Promise<void> {
  await writeProject({ schemaVersion: SCHEMA_VERSION, project });
  await writeLastOpened(project.id);
  await persistMedia(media, known);
}

/**
 * Drops media no project refers to any more.
 *
 * Run after a delete rather than on a timer: an orphaned photograph is only
 * orphaned once nothing can reach it, and the cheap way to know that is to ask
 * at the moment the last reference goes.
 */
export function reachableMedia(projects: readonly Project[]): ReadonlySet<string> {
  const reachable = new Set<string>();
  for (const project of projects) {
    for (const id of referencedMedia(project)) reachable.add(id);
  }
  return reachable;
}
