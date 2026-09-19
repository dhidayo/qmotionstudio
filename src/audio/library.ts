/**
 * The bundled royalty-free track library (§10).
 *
 * §10 is explicit: *"Licensing is my responsibility, not yours — leave the
 * library as an empty manifest with a documented shape and three placeholder
 * tracks."* So that is exactly what this is. The shape is real, the plumbing
 * that reads it is real, and the three entries below carry no audio.
 *
 * A placeholder entry is marked `available: false`. The picker lists them
 * greyed out with their own note rather than hiding them, because a library
 * that appears empty reads as broken, whereas one that says what is coming
 * reads as unfinished — which it honestly is.
 *
 * ── Adding a real track ───────────────────────────────────────────────────
 * Drop the file in `public/music/<id>.<ext>`, set `available: true`, and fill
 * in `licence` with something a reader could verify. Nothing else changes:
 * `loadLibraryTrack` fetches `url(track)` and decodes it exactly as an
 * imported file, so a bundled track and a user's own take the same path.
 */

export type LibraryTrack = {
  readonly id: string;
  readonly title: string;
  /** Whoever should be credited, once there is someone to credit. */
  readonly artist: string;
  readonly durationMs: number;
  /** A word for the feel, so the list can be scanned rather than auditioned. */
  readonly mood: string;
  readonly bpm?: number;
  /** File extension under `public/music/`. */
  readonly ext: 'mp3' | 'm4a' | 'wav' | 'ogg';
  /**
   * False until a licensed file actually exists. The picker shows the row and
   * disables it; nothing tries to fetch it.
   */
  readonly available: boolean;
  /** Free text, meant to be specific enough to check. */
  readonly licence: string;
};

export const MUSIC_LIBRARY: readonly LibraryTrack[] = [
  {
    id: 'placeholder-drift',
    title: 'Drift',
    artist: '—',
    durationMs: 30_000,
    mood: 'Calm',
    bpm: 90,
    ext: 'mp3',
    available: false,
    licence: 'Not yet licensed. See §10 — licensing is the project owner’s.',
  },
  {
    id: 'placeholder-uplift',
    title: 'Uplift',
    artist: '—',
    durationMs: 30_000,
    mood: 'Bright',
    bpm: 120,
    ext: 'mp3',
    available: false,
    licence: 'Not yet licensed. See §10 — licensing is the project owner’s.',
  },
  {
    id: 'placeholder-pulse',
    title: 'Pulse',
    artist: '—',
    durationMs: 30_000,
    mood: 'Driving',
    bpm: 128,
    ext: 'mp3',
    available: false,
    licence: 'Not yet licensed. See §10 — licensing is the project owner’s.',
  },
];

/** Media ids for library tracks are namespaced, like the sample photographs. */
export function libraryMediaId(track: LibraryTrack): string {
  return `music:${track.id}`;
}

export function url(track: LibraryTrack): string {
  return `/music/${track.id}.${track.ext}`;
}

export function libraryTrackFor(mediaId: string): LibraryTrack | undefined {
  if (!mediaId.startsWith('music:')) return undefined;
  const id = mediaId.slice('music:'.length);
  return MUSIC_LIBRARY.find((track) => track.id === id);
}

export function availableTracks(): readonly LibraryTrack[] {
  return MUSIC_LIBRARY.filter((track) => track.available);
}
