import { createStore, del, get, keys, set } from 'idb-keyval';
import type { Project } from '@/document/types';
import type { MediaKind } from '@/media/store';

/**
 * §13's persistence. IndexedDB, never localStorage (§16).
 *
 * Two stores, because the two halves have completely different lifetimes and
 * sizes. A document is a few kilobytes of ids and numbers and is rewritten on
 * every edit; a photograph is megabytes and is written once and never touched
 * again. Putting them together would mean rewriting the photographs every time
 * someone dragged a slider.
 *
 * Media is keyed by `mediaId` and shared across projects, exactly as §5's
 * "the document holds only ids" implies — duplicating a project copies a list
 * of ids, not a pile of blobs.
 */

const DB = 'motion-studio';

const projectStore = createStore(DB, 'projects');
const mediaStore = createStore(DB, 'media');
const metaStore = createStore(DB, 'meta');

/** What a saved project looks like on disk. */
export type StoredProject = {
  /** Mirrors `SCHEMA_VERSION` at the time of writing; `migrate` reads it. */
  readonly schemaVersion: number;
  readonly project: Project;
  readonly savedAt: number;
};

/**
 * A stored blob and the little that is needed to decode it again.
 *
 * Deliberately *not* the decoded form. An `ImageBitmap` cannot be stored, an
 * `AudioBuffer` would be many times the size of the file it came from, and a
 * `VideoClip` holds an open reader. Keeping the original blob and re-running
 * the same decoder the uploader uses means a restored project behaves
 * identically to one that was just imported, rather than nearly identically.
 */
export type StoredMedia = {
  readonly id: string;
  readonly kind: MediaKind;
  readonly name: string;
  readonly blob: Blob;
};

export async function readProject(id: string): Promise<StoredProject | null> {
  return (await get<StoredProject>(id, projectStore)) ?? null;
}

export async function writeProject(entry: StoredProject): Promise<void> {
  await set(entry.project.id, entry, projectStore);
}

export async function deleteProject(id: string): Promise<void> {
  await del(id, projectStore);
}

export async function listProjects(): Promise<readonly StoredProject[]> {
  const ids = await keys(projectStore);
  const entries = await Promise.all(ids.map((id) => get<StoredProject>(id, projectStore)));
  return entries
    .filter((entry): entry is StoredProject => entry !== undefined)
    .sort((a, b) => b.savedAt - a.savedAt);
}

export async function readMedia(id: string): Promise<StoredMedia | null> {
  return (await get<StoredMedia>(id, mediaStore)) ?? null;
}

export async function writeMedia(entry: StoredMedia): Promise<void> {
  await set(entry.id, entry, mediaStore);
}

export async function mediaIds(): Promise<readonly string[]> {
  return (await keys(mediaStore)).map(String);
}

export async function deleteMedia(id: string): Promise<void> {
  await del(id, mediaStore);
}

/** Which project to reopen on the next load. */
export async function readLastOpened(): Promise<string | null> {
  return (await get<string>('lastOpened', metaStore)) ?? null;
}

export async function writeLastOpened(id: string): Promise<void> {
  await set('lastOpened', id, metaStore);
}
