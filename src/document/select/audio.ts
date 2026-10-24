import type { AudioClip } from '../types';
import { clipEndMs } from '@/core/audio/envelope';
import { soundFor } from '@/audio/library';

/**
 * Reading the audio track as it plays (D-156).
 *
 * A background loop added from the sound library runs to the end of the
 * video (`fitsVideo`), so its length is not stored but read from the video at
 * the moment it is needed: add a scene and the music follows. Everything that
 * plays, draws or exports audio reads the clips through here — or through
 * `resolvedAudio` in timeline.ts, which supplies the video's length.
 */

/** Never shorter than this: the same floor as a trimmed clip. */
export const MIN_AUDIO_CLIP_MS = 300;

/** How long a fitted loop runs: from where it starts to the end of the video. */
export function fittedLengthMs(clip: AudioClip, videoMs: number): number {
  return Math.max(MIN_AUDIO_CLIP_MS, Math.round(videoMs - clip.startMs));
}

/** The clip with a fitted loop's length filled in; any other clip as it is. */
export function fitClip(clip: AudioClip, videoMs: number): AudioClip {
  if (clip.fitsVideo !== true || clip.loop !== true) return clip;
  const lengthMs = fittedLengthMs(clip, videoMs);
  return clip.lengthMs === lengthMs ? clip : { ...clip, lengthMs };
}

/**
 * Remembered per audio array and video length.
 *
 * Identity matters: the preview reschedules every sound whenever the array it
 * is given changes, so returning a fresh array on every edit would restart the
 * music each time a word was typed during playback.
 */
const fitted = new WeakMap<readonly AudioClip[], { readonly videoMs: number; readonly clips: readonly AudioClip[] }>();

export function fittedClips(clips: readonly AudioClip[], videoMs: number): readonly AudioClip[] {
  if (!clips.some((clip) => clip.fitsVideo === true && clip.loop === true)) return clips;
  const hit = fitted.get(clips);
  if (hit?.videoMs === videoMs) return hit.clips;
  const next = clips.map((clip) => fitClip(clip, videoMs));
  fitted.set(clips, { videoMs, clips: next });
  return next;
}

/** Which timeline row a clip sits on: effects from the library on Sounds, the rest on Music. */
export type AudioLane = 'music' | 'sounds';

export function laneOf(clip: AudioClip): AudioLane {
  return soundFor(clip.mediaId)?.kind === 'effect' ? 'sounds' : 'music';
}

/**
 * Stacks clips that overlap in time into rows, first come first served.
 *
 * Two effects at the same moment — a whoosh under a pop — are an ordinary
 * thing to want, and drawn on one row they would hide each other.
 */
export function packRows(clips: readonly AudioClip[]): { readonly rowOf: ReadonlyMap<string, number>; readonly rows: number } {
  const ends: number[] = [];
  const rowOf = new Map<string, number>();
  const ordered = [...clips].sort((a, b) => a.startMs - b.startMs);
  for (const clip of ordered) {
    let row = ends.findIndex((end) => end <= clip.startMs);
    if (row === -1) row = ends.length;
    ends[row] = clipEndMs(clip);
    rowOf.set(clip.id, row);
  }
  return { rowOf, rows: ends.length };
}
