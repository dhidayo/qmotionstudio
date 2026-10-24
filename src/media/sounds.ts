import type { AudioClip } from '@/document/types';
import { isSoundId, soundFor, soundMediaId, soundUrl, type LibrarySound } from '@/audio/library';
import { decodeAudio } from './audio/decode';
import { isSampleId } from './samples';
import type { MediaStore } from './store';

/**
 * Loading the sound library into the media store (D-156).
 *
 * Like the sample photographs (D-111), library sounds come with the app: they
 * are fetched when a project uses one, or when one is listened to in the
 * picker, and never stored in IndexedDB or written into a project file — the
 * file names `sound:<id>` and every copy of the app can fetch it again. Once
 * fetched, the service worker keeps the file for offline use.
 *
 * Decoded exactly as an imported track is, so a library sound and a person's
 * own music take the same path through playback, the waveform and export.
 */

/** Media that ships with the app rather than being the person's own: never persisted, never in a project file. */
export function isBundledMediaId(mediaId: string): boolean {
  return isSampleId(mediaId) || isSoundId(mediaId);
}

/** The library sounds some clips use, once each. */
export function soundIdsIn(clips: readonly AudioClip[]): readonly string[] {
  return [...new Set(clips.map((clip) => clip.mediaId).filter(isSoundId))].sort();
}

/**
 * Loads in flight, per store, so a project opening, the picker's Listen and
 * an export asking for the same sound at once fetch and decode it once.
 */
const inFlight = new WeakMap<MediaStore, Map<string, Promise<void>>>();

export class SoundLoadError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SoundLoadError';
  }
}

/** Loads one library sound, unless it is already in. */
export function loadSound(store: MediaStore, sound: LibrarySound): Promise<void> {
  const id = soundMediaId(sound);
  if (store.has(id)) return Promise.resolve();
  let pending = inFlight.get(store);
  if (!pending) {
    pending = new Map();
    inFlight.set(store, pending);
  }
  const running = pending.get(id);
  if (running) return running;

  const loading = (async () => {
    let response: Response;
    try {
      response = await fetch(soundUrl(sound));
    } catch (error) {
      throw new SoundLoadError(`Could not fetch “${sound.name}”. Check the connection and try again.`, { cause: error });
    }
    if (!response.ok) {
      // §16: a missing file is a build problem worth saying out loud.
      throw new SoundLoadError(`“${sound.name}” is missing (${response.status}). Run \`npm run sounds\` to generate the library.`);
    }
    store.set(await decodeAudio(await response.blob(), { id, name: sound.name }));
  })();
  const settled = loading.finally(() => { pending.delete(id); });
  pending.set(id, settled);
  return settled;
}

/**
 * Loads every library sound among `mediaIds` that is not already in. Ids
 * that are not library sounds are ignored; an id naming a sound this build
 * does not have is an error, since its clip would otherwise play silence.
 */
export async function loadSounds(store: MediaStore, mediaIds: Iterable<string>): Promise<void> {
  const wanted: LibrarySound[] = [];
  for (const id of mediaIds) {
    if (!isSoundId(id) || store.has(id)) continue;
    const sound = soundFor(id);
    if (!sound) throw new SoundLoadError(`This project uses a sound this version of the app does not have (${id}).`);
    wanted.push(sound);
  }
  await Promise.all(wanted.map((sound) => loadSound(store, sound)));
}
