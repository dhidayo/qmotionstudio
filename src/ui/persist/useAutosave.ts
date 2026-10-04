import { useEffect, useRef } from 'react';
import { SCHEMA_VERSION, type Project } from '@/document/types';
import { referencedMedia } from '@/document/select/media';
import type { MediaStore } from '@/media/store';
import { persistMedia } from '@/persist/media';
import { isSampleId } from '@/media/samples';
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
      void queued(() => save(latest.current.project, latest.current.media, known.current))
        .then(() => {
          void askToKeep();
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
   * A new photograph is saved the moment it arrives, not after the debounce
   * (D-111).
   *
   * Adding photos and then reloading straight away is exactly what someone
   * checking "did it keep my pictures?" does — and a reload inside the
   * debounce, before a multi-megabyte write had finished, lost them. The
   * document is read from the store at that moment rather than from the
   * render that happens to be current: the upload has already put the photo
   * into it by the time this runs.
   */
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = media.subscribe(() => {
      const fresh = media.ids().some((id) => !known.current.has(id) && !isSampleId(id));
      if (!fresh || timer !== null) return;
      timer = setTimeout(() => {
        timer = null;
        setState('saving');
        void queued(() => save(useEditor.getState().project, media, known.current))
          .then(() => { setState('saved'); })
          .catch((error: unknown) => {
            console.error('Could not save a new photograph.', error);
            setState('failed');
          });
      }, 0);
    });
    return () => {
      unsubscribe();
      if (timer !== null) clearTimeout(timer);
    };
  }, [media, enabled, setState]);

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
      const { media: store } = latest.current;
      void save(useEditor.getState().project, store, known.current).catch((error: unknown) => {
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
 * Saves run one after another, never two at once: the debounce, a new photo
 * and the page going away can all ask for one within the same moment, and two
 * interleaved writes of the same blob are twice the work for the same result.
 */
let chain: Promise<void> = Promise.resolve();

function queued(run: () => Promise<void>): Promise<void> {
  const next = chain.then(run, run);
  chain = next.catch(() => undefined);
  return next;
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

let askedToKeep = false;

/**
 * Asks the browser to keep this site's storage rather than clearing it under
 * pressure (D-095).
 *
 * Projects and photographs live only on this device. Without this request a
 * browser short of disk space may clear the site's data — and Safari clears
 * that of sites not visited for a week — which would delete every project
 * without warning: the worst thing this app can do.
 *
 * Asked once, after the first save actually succeeds, so it is tied to there
 * being something worth keeping. Most browsers decide silently from how the
 * site is used (an installed app is usually granted it); Firefox asks the
 * person. Refusal is not an error, so it is logged and nothing more.
 */
async function askToKeep(): Promise<void> {
  if (askedToKeep) return;
  askedToKeep = true;
  try {
    if (typeof navigator === 'undefined' || !('storage' in navigator)) return;
    if (await navigator.storage.persisted()) return;
    const granted = await navigator.storage.persist();
    if (!granted) console.info('Storage may be cleared by the browser under pressure; projects are not guaranteed to persist.');
  } catch (error: unknown) {
    console.warn('Could not ask the browser to keep storage.', error);
  }
}

