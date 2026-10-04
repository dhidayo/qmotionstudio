import { decodeAudio } from '@/media/audio/decode';
import { decodeImage } from '@/media/image/decode';
import { decodeVideo } from '@/media/video/decode';
import type { MediaEntry, MediaStore } from '@/media/store';
import { isSampleId } from '@/media/samples';
import { readMedia, writeMedia, type StoredMedia } from './db';

/**
 * Getting media on and off disk (§13).
 *
 * What is stored is the original blob, not the decoded form: an `ImageBitmap`
 * cannot be written to IndexedDB, an `AudioBuffer` would be many times the
 * size of the file it came from, and a `VideoClip` holds an open reader. So a
 * restore runs the *same decoders the uploader runs*, which is what makes a
 * reopened project behave identically to one just imported rather than nearly
 * identically.
 */

/** Long edge to decode photographs to, matching the uploader's own default. */
const ARTBOARD_LONGEST_EDGE = 2048;

export function storable(entry: MediaEntry): StoredMedia {
  return { id: entry.id, kind: entry.kind, name: entry.name, blob: entry.blob };
}

/**
 * Writes any media the store holds that disk does not.
 *
 * Blobs are immutable once imported and are keyed by an id that is never
 * reused, so anything already on disk is already correct and rewriting it
 * would be megabytes of pointless traffic on every autosave.
 */
export async function persistMedia(
  store: MediaStore,
  known: Set<string>,
): Promise<void> {
  for (const id of store.ids()) {
    if (known.has(id)) continue;
    // The samples ship with the app and are fetched again on demand; storing
    // a megabyte of them per device was space spent on nothing (D-111).
    if (isSampleId(id)) continue;
    const entry = store.get(id);
    if (!entry) continue;
    await writeMedia(storable(entry));
    known.add(id);
  }
}

/**
 * Loads and decodes the media a project refers to.
 *
 * Failures are per-item and reported rather than thrown: one unreadable blob
 * should cost its own photograph, not the whole project. §16 forbids silently
 * swallowing a decode error, so the caller is handed the list and says so.
 */
export async function restoreMedia(
  store: MediaStore,
  ids: Iterable<string>,
): Promise<{ restored: number; missing: readonly string[] }> {
  const missing: string[] = [];
  let restored = 0;

  for (const id of ids) {
    if (store.has(id)) continue;
    // Samples are fetched with the app, not stored (D-111); the stand-ins for
    // empty slots were never media at all.
    if (isSampleId(id) || id.startsWith('__empty_')) continue;

    const stored = await readMedia(id);
    if (!stored) {
      missing.push(id);
      continue;
    }

    try {
      store.set(await decodeStored(stored));
      restored += 1;
    } catch {
      missing.push(id);
    }
  }

  return { restored, missing };
}

function decodeStored(stored: StoredMedia): Promise<MediaEntry> {
  const options = { id: stored.id, name: stored.name };
  switch (stored.kind) {
    case 'image':
      return decodeImage(stored.blob, { ...options, artboardLongestEdge: ARTBOARD_LONGEST_EDGE });
    case 'video':
      return decodeVideo(stored.blob, options);
    case 'audio':
      return decodeAudio(stored.blob, options);
  }
}
