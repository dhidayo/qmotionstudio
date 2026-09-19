import type { AudioClip } from '@/document/types';

/**
 * Clip timing and gain, as pure arithmetic (§10).
 *
 * Everything here is deliberately free of Web Audio. The preview schedules
 * live `AudioBufferSourceNode`s and the export renders through an
 * `OfflineAudioContext`, and the one thing that must not differ between them
 * is *what the envelope says*. Keeping that here means both paths compute it
 * from the same code, and it can be tested without a browser at all.
 */

/** Silence floor. Below this, ramps are treated as reaching zero. */
const MIN_GAIN = 0.0001;

export function dbToGain(db: number): number {
  if (db <= -60) return 0;
  return 10 ** (db / 20);
}

export function gainToDb(gain: number): number {
  if (gain <= MIN_GAIN) return -60;
  return 20 * Math.log10(gain);
}

/** How long the clip plays for, after trimming. */
export function clipDurationMs(clip: AudioClip): number {
  return Math.max(0, clip.trimEndMs - clip.trimStartMs);
}

/** Where the clip stops on the project timeline. */
export function clipEndMs(clip: AudioClip): number {
  return clip.startMs + clipDurationMs(clip);
}

export function isActiveAt(clip: AudioClip, timeMs: number): boolean {
  return timeMs >= clip.startMs && timeMs < clipEndMs(clip);
}

/**
 * Fades, clamped so they cannot overlap.
 *
 * A two-second clip with a two-second fade in *and* a two-second fade out is a
 * perfectly reasonable thing for a user to drag into being. Left alone the two
 * ramps fight and the result is neither; splitting the available time between
 * them in proportion is the only reading that keeps both audible.
 */
export function resolvedFades(clip: AudioClip): { inMs: number; outMs: number } {
  const duration = clipDurationMs(clip);
  const wantedIn = Math.max(0, clip.fadeInMs);
  const wantedOut = Math.max(0, clip.fadeOutMs);
  const total = wantedIn + wantedOut;

  if (duration <= 0) return { inMs: 0, outMs: 0 };
  if (total <= duration) return { inMs: wantedIn, outMs: wantedOut };

  const scale = duration / total;
  return { inMs: wantedIn * scale, outMs: wantedOut * scale };
}

/**
 * The clip's gain at a time measured from its own start.
 *
 * Used by the waveform overlay to draw what will actually be heard, and by the
 * tests to pin the envelope down without a browser.
 */
export function gainAt(clip: AudioClip, localMs: number): number {
  const duration = clipDurationMs(clip);
  if (duration <= 0 || localMs < 0 || localMs > duration) return 0;

  const base = dbToGain(clip.gainDb);
  const { inMs, outMs } = resolvedFades(clip);

  if (inMs > 0 && localMs < inMs) return base * (localMs / inMs);

  const fadeOutStart = duration - outMs;
  if (outMs > 0 && localMs > fadeOutStart) {
    return base * Math.max(0, (duration - localMs) / outMs);
  }
  return base;
}

export type EnvelopePoint = {
  /** Milliseconds from the clip's own start. */
  readonly atMs: number;
  readonly gain: number;
};

/**
 * The automation points needed to play a clip from `fromLocalMs` onward.
 *
 * Playback rarely starts at a clip's beginning — the user scrubs to the middle
 * of a track and presses space. The first point therefore carries the gain
 * *already in effect* at that instant, so a clip entered halfway through its
 * fade-in resumes at the right level rather than snapping to full.
 */
export function envelopeFrom(clip: AudioClip, fromLocalMs: number): readonly EnvelopePoint[] {
  const duration = clipDurationMs(clip);
  if (duration <= 0) return [];

  const from = Math.max(0, Math.min(fromLocalMs, duration));
  const base = dbToGain(clip.gainDb);
  const { inMs, outMs } = resolvedFades(clip);
  const fadeOutStart = duration - outMs;

  const points: EnvelopePoint[] = [{ atMs: from, gain: gainAt(clip, from) }];

  const push = (atMs: number, gain: number): void => {
    if (atMs <= from) return;
    const last = points.at(-1);
    if (last && Math.abs(last.atMs - atMs) < 0.01) return;
    points.push({ atMs, gain });
  };

  if (inMs > 0) push(inMs, base);
  if (outMs > 0) {
    push(fadeOutStart, base);
    push(duration, 0);
  } else {
    push(duration, base);
  }

  return points;
}

/** Total length of the audio on the timeline, for the project's duration. */
export function audioEndMs(clips: readonly AudioClip[]): number {
  return clips.reduce((max, clip) => Math.max(max, clipEndMs(clip)), 0);
}
