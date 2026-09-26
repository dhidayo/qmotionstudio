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

/*
 * One database per store, which is idb-keyval's own convention and not a
 * stylistic choice.
 *
 * `createStore(db, store)` opens the database at its default version and
 * creates only *its* object store in `onupgradeneeded`. Point three of them at
 * one database name and the first to open creates it at version 1 holding a
 * single store; the other two then find the database already at version 1, so
 * their upgrade never runs and every transaction against them throws
 * NotFoundError. The symptom is a save that fails forever and a reload that
 * finds nothing, which is exactly what it did.
 */
const projectStore = createStore('motion-studio-projects', 'projects');
const mediaStore = createStore('motion-studio-media', 'media');
const metaStore = createStore('motion-studio-meta', 'meta');

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

/**
 * Stamps `savedAt` itself rather than taking one.
 *
 * The moment a write happened is the store's own business, and asking callers
 * for it put a clock reading in every one of them — including inside React
 * components, where reading the clock while rendering is exactly the sort of
 * impurity that makes a component's output depend on when it ran.
 */
export async function writeProject(entry: Omit<StoredProject, 'savedAt'>): Promise<void> {
  const stored: StoredProject = { ...entry, savedAt: Date.now() };
  await set(entry.project.id, stored, projectStore);
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
