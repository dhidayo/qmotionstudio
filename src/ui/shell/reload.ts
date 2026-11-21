import { SCHEMA_VERSION, type Project } from '@/document/types';
import { writeProject } from '@/persist/db';

/**
 * Saves the document, then reloads (D-171): the way back from a part of the
 * app that did not download.
 *
 * Not a second `import()`: Chrome remembers a module that failed to load and
 * fails every later import of it at once, without asking the network again,
 * so an in-page "Try again" could never succeed. A reload asks afresh, and
 * reopens the project (§13).
 *
 * Its own module, taking the project rather than reading the store, so the
 * store can offer it without importing the interface that imports the store.
 */
export function saveAndReload(project: Project): void {
  writeProject({ schemaVersion: SCHEMA_VERSION, project })
    .catch((error: unknown) => { console.error('Could not save before reloading.', error); })
    .finally(() => { location.reload(); });
}

/** Saves the document, then opens `url` in its place: Sign out's way to the landing page (D-175). */
export function saveAndLeave(project: Project, url: string): void {
  writeProject({ schemaVersion: SCHEMA_VERSION, project })
    .catch((error: unknown) => { console.error('Could not save before leaving.', error); })
    .finally(() => { location.assign(url); });
}
