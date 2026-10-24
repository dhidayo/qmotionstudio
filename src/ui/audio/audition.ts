import { dbToGain } from '@/core/audio/envelope';

/**
 * Listening to a sound in the library before adding it (D-156).
 *
 * Through Web Audio rather than an `<audio>` element: a background loop goes
 * round on its own loop points exactly as it will under the video, with no
 * gap and without the tenth of a second either side, and the buffer it plays
 * is the decoded one that Add then uses.
 *
 * One sound at a time, on a context of its own that the picker closes when it
 * goes. Browsers start a context suspended until the page is touched, and iOS
 * only lets a touch resume it while the touch is still being handled — so
 * `primeAudition` must be called inside the click, before anything awaits the
 * file, and playback can begin when the file arrives.
 */

type Playing = { readonly key: string; readonly source: AudioBufferSourceNode; readonly gain: GainNode };

let context: AudioContext | null = null;
let playing: Playing | null = null;
const listeners = new Set<() => void>();

function changed(): void {
  for (const listener of listeners) listener();
}

/** Makes the context and wakes it. Call synchronously inside the click. */
export function primeAudition(): void {
  if (typeof AudioContext === 'undefined') return;
  context ??= new AudioContext();
  if (context.state !== 'running') {
    context.resume().catch((error: unknown) => { console.warn('Could not start sound preview.', error); });
  }
}

/**
 * Plays `buffer`, stopping anything already playing. With `loop`, it goes
 * round that window until stopped; otherwise it plays once.
 */
export function audition(key: string, buffer: AudioBuffer, options: { loop?: { startMs: number; endMs: number }; gainDb?: number } = {}): void {
  primeAudition();
  const ctx = context;
  if (!ctx) return;
  stopAudition();

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.value = dbToGain(options.gainDb ?? 0);
  source.connect(gain);
  gain.connect(ctx.destination);
  const { loop } = options;
  if (loop) {
    source.loop = true;
    source.loopStart = loop.startMs / 1000;
    source.loopEnd = loop.endMs / 1000;
    source.start(0, loop.startMs / 1000);
  } else {
    source.start();
  }
  const current: Playing = { key, source, gain };
  source.onended = () => {
    if (playing !== current) return;
    current.gain.disconnect();
    playing = null;
    changed();
  };
  playing = current;
  changed();
}

export function stopAudition(): void {
  const current = playing;
  if (!current) return;
  playing = null;
  try {
    current.source.stop();
  } catch {
    // Never started, or already over: nothing to stop.
  }
  current.source.disconnect();
  current.gain.disconnect();
  changed();
}

/** Stops and lets the context go: the picker has closed. */
export function closeAudition(): void {
  stopAudition();
  const ctx = context;
  context = null;
  if (ctx) ctx.close().catch(() => undefined);
}

/** The key of what is playing, or null. */
export function auditioning(): string | null {
  return playing?.key ?? null;
}

export function subscribeAudition(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
