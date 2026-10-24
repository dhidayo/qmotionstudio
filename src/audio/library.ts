/**
 * The sound library (D-156): background loops and sound effects that come
 * with the app, offered by + Sound.
 *
 * §10 asked for an empty manifest with three placeholder tracks, because
 * licensing music is the owner's business. The owner then asked for sounds
 * to ship with ("maybe you can help with sample sounds for now"), so these
 * are original: every one is synthesised from code by `npm run sounds`
 * (scripts/gen-sounds.ts), note by note, with no recordings or samples from
 * anywhere else. They belong to the project and are free to use in anything
 * made with it.
 *
 * Ids are permanent. A project stores `sound:<id>` for each clip, so renaming
 * one would leave every project that used it silent; add a new entry instead.
 * The file is `public/sounds/<id>.wav`, fetched only when a sound is heard,
 * added or opened in a project — never with the app itself.
 *
 * ── Why WAV ──────────────────────────────────────────────────────────────
 * A loop must join without a gap. MP3 and AAC pad the start and end of a file
 * by an amount decoders disagree about, which puts a hiccup at every repeat;
 * Opus does not decode everywhere Safari runs. Mono 16-bit PCM at 24kHz for
 * the music and 32kHz for the effects decodes in every browser, and the whole
 * library stays under 4MB.
 */

export type SoundKind = 'background' | 'effect';

export type SoundCategory =
  | 'Upbeat' | 'Chill' | 'Corporate' | 'Cinematic'
  | 'Transitions' | 'Interface' | 'Hits' | 'Crowd';

export type LibrarySound = {
  /** Permanent: projects store it. Also the file's name. */
  readonly id: string;
  readonly name: string;
  /** Background loops play under the whole video; effects go at a moment. */
  readonly kind: SoundKind;
  readonly category: SoundCategory;
  /** One line on what it is and what it suits. */
  readonly blurb: string;
  /** More words search should find it by. */
  readonly tags: readonly string[];
  readonly bpm?: number;
  readonly bars?: number;
  /** The whole file. */
  readonly durationMs: number;
  /**
   * The part that repeats, in whole milliseconds inside the file. The file
   * carries a tenth of a second either side of it, copied from the loop's own
   * end and start, so decoding and resampling never touch the join.
   */
  readonly loop?: { readonly startMs: number; readonly endMs: number };
  readonly sampleRate: 24_000 | 32_000;
  /** Where a new clip of it starts, so music sits under the effects. */
  readonly defaultGainDb: number;
  readonly licence: string;
};

const ORIGINAL = 'Original — synthesised for Q Motion Studio by scripts/gen-sounds.ts (D-156). Free to use in anything made with the app.';

const BACKGROUND_GAIN_DB = -3;

export const SOUND_LIBRARY: readonly LibrarySound[] = [
  {
    id: 'upbeat-pulse',
    name: 'Upbeat Pulse',
    kind: 'background',
    category: 'Upbeat',
    blurb: 'Bright, bouncy pop with a hook — launches, offers, sales.',
    tags: ['pop', 'dance', 'happy', 'energetic', 'promo', 'fun'],
    bpm: 120,
    bars: 8,
    durationMs: 16_200,
    loop: { startMs: 100, endMs: 16_100 },
    sampleRate: 24_000,
    defaultGainDb: BACKGROUND_GAIN_DB,
    licence: ORIGINAL,
  },
  {
    id: 'lofi-haze',
    name: 'Lo-fi Haze',
    kind: 'background',
    category: 'Chill',
    blurb: 'Warm, dusty keys over a lazy beat — lifestyle, food, behind the scenes.',
    tags: ['lofi', 'chill', 'relaxed', 'calm', 'cafe', 'study', 'jazzy'],
    bpm: 80,
    bars: 4,
    durationMs: 12_200,
    loop: { startMs: 100, endMs: 12_100 },
    sampleRate: 24_000,
    defaultGainDb: BACKGROUND_GAIN_DB,
    licence: ORIGINAL,
  },
  {
    id: 'corporate-bright',
    name: 'Bright Corporate',
    kind: 'background',
    category: 'Corporate',
    blurb: 'Plucked guitar, piano and a light beat — company news, how-tos, results.',
    tags: ['business', 'positive', 'uplifting', 'guitar', 'presentation', 'tech'],
    bpm: 100,
    bars: 8,
    durationMs: 19_400,
    loop: { startMs: 100, endMs: 19_300 },
    sampleRate: 24_000,
    defaultGainDb: BACKGROUND_GAIN_DB,
    licence: ORIGINAL,
  },
  {
    id: 'cinematic-dawn',
    name: 'Cinematic Dawn',
    kind: 'background',
    category: 'Cinematic',
    blurb: 'Slow strings, a soft piano line and a deep pulse — stories, thanks, big moments.',
    tags: ['film', 'emotional', 'inspiring', 'strings', 'ambient', 'epic', 'calm'],
    bpm: 60,
    bars: 4,
    durationMs: 16_200,
    loop: { startMs: 100, endMs: 16_100 },
    sampleRate: 24_000,
    defaultGainDb: BACKGROUND_GAIN_DB,
    licence: ORIGINAL,
  },
  {
    id: 'whoosh',
    name: 'Whoosh',
    kind: 'effect',
    category: 'Transitions',
    blurb: 'Air rushing past — under a scene change or a slide.',
    tags: ['transition', 'swish', 'air', 'pass', 'swipe'],
    durationMs: 1_000,
    sampleRate: 32_000,
    defaultGainDb: 0,
    licence: ORIGINAL,
  },
  {
    id: 'swoosh',
    name: 'Swoosh',
    kind: 'effect',
    category: 'Transitions',
    blurb: 'A quick, bright swipe — for text or a photo flying in.',
    tags: ['transition', 'swish', 'swipe', 'fast', 'fly'],
    durationMs: 600,
    sampleRate: 32_000,
    defaultGainDb: 0,
    licence: ORIGINAL,
  },
  {
    id: 'pop',
    name: 'Pop',
    kind: 'effect',
    category: 'Interface',
    blurb: 'A round, bubbly pop — something appearing.',
    tags: ['bubble', 'appear', 'boop', 'blip', 'cute'],
    durationMs: 300,
    sampleRate: 32_000,
    defaultGainDb: 0,
    licence: ORIGINAL,
  },
  {
    id: 'click',
    name: 'Click',
    kind: 'effect',
    category: 'Interface',
    blurb: 'A crisp tap — a button press or a tick on a list.',
    tags: ['tap', 'tick', 'button', 'ui', 'select'],
    durationMs: 300,
    sampleRate: 32_000,
    defaultGainDb: 0,
    licence: ORIGINAL,
  },
  {
    id: 'riser',
    name: 'Riser',
    kind: 'effect',
    category: 'Transitions',
    blurb: 'Three seconds of building tension — into a reveal.',
    tags: ['build', 'tension', 'sweep', 'rise', 'reveal', 'uplifter'],
    durationMs: 3_500,
    sampleRate: 32_000,
    defaultGainDb: 0,
    licence: ORIGINAL,
  },
  {
    id: 'impact',
    name: 'Impact',
    kind: 'effect',
    category: 'Hits',
    blurb: 'A deep cinematic boom — a title landing.',
    tags: ['boom', 'hit', 'drop', 'bass', 'trailer', 'slam'],
    durationMs: 2_500,
    sampleRate: 32_000,
    defaultGainDb: 0,
    licence: ORIGINAL,
  },
  {
    id: 'chime',
    name: 'Chime',
    kind: 'effect',
    category: 'Interface',
    blurb: 'A bright rising ding — success, a new message, a tick.',
    tags: ['ding', 'bell', 'notification', 'success', 'sparkle'],
    durationMs: 1_600,
    sampleRate: 32_000,
    defaultGainDb: 0,
    licence: ORIGINAL,
  },
  {
    id: 'applause',
    name: 'Applause',
    kind: 'effect',
    category: 'Crowd',
    blurb: 'A room clapping — thanks, awards, a finale.',
    tags: ['clapping', 'crowd', 'cheer', 'celebrate', 'audience'],
    durationMs: 3_600,
    sampleRate: 32_000,
    defaultGainDb: 0,
    licence: ORIGINAL,
  },
];

const PREFIX = 'sound:';

/** Library sounds are namespaced, like the sample photographs, so they never collide with an upload. */
export function soundMediaId(sound: LibrarySound): string {
  return `${PREFIX}${sound.id}`;
}

export function soundUrl(sound: LibrarySound): string {
  return `/sounds/${sound.id}.wav`;
}

/** True for ids this library owns. */
export function isSoundId(mediaId: string): boolean {
  return mediaId.startsWith(PREFIX);
}

export function soundFor(mediaId: string): LibrarySound | undefined {
  if (!isSoundId(mediaId)) return undefined;
  const id = mediaId.slice(PREFIX.length);
  return SOUND_LIBRARY.find((sound) => sound.id === id);
}
