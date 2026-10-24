import * as actions from '@/document/actions';
import type { Action } from '@/document/actions';
import type { AudioClip, Project } from '@/document/types';
import { totalDurationMs } from '@/document/select/timeline';
import { soundFor, soundMediaId, type LibrarySound } from '@/audio/library';
import { clipDurationMs } from '@/core/audio/envelope';

/**
 * Where a chosen library sound goes (D-156). Pure: this says what to do, and
 * `addSound` does it.
 *
 * A background loop goes under the whole video: from the start, looping, and
 * following the video's length as scenes come and go (`fitsVideo`). There is
 * one background at a time — choosing another replaces it, keeping where it
 * starts, how long it runs, its level and its fades, so changing the music
 * never undoes the work done on it. Music of the person's own is never
 * replaced; it plays alongside.
 *
 * An effect goes at the playhead, pulled back if it would run past the end,
 * and is selected so it can be moved or turned down straight away.
 *
 * Sounds are for videos: a design (Image mode) plays once and is saved as a
 * picture as often as a clip, so it takes none (D-155).
 */

/** A short rise, so a loop starting part-way into its first bar does not click. */
const BACKGROUND_FADE_IN_MS = 100;
const BACKGROUND_FADE_OUT_MS = 1_200;

/** Library background loops in the project: the ones a new background replaces. */
export function libraryBackgrounds(clips: readonly AudioClip[]): readonly AudioClip[] {
  return clips.filter((clip) => soundFor(clip.mediaId)?.kind === 'background');
}

export type SoundPlacement = {
  /** Null when there is nothing to do; the message says why. */
  readonly action: Action | null;
  /** The clip to select once added: effects, which are moved and turned down one by one. */
  readonly select: string | null;
  /** The toast. */
  readonly message: string;
};

export function placeSound(project: Project, playheadMs: number, sound: LibrarySound): SoundPlacement {
  if (project.mode !== 'motionAd') return { action: null, select: null, message: 'Sounds are for videos. Switch to Video to add one.' };
  const videoMs = Math.max(1, totalDurationMs(project));
  const mediaId = soundMediaId(sound);

  if (sound.kind === 'background' && sound.loop) {
    const earlier = libraryBackgrounds(project.audio);
    const only = earlier.length === 1 ? earlier[0] : undefined;
    const clip = actions.makeAudioClip(mediaId, {
      durationMs: sound.durationMs,
      loop: sound.loop,
      startMs: only?.startMs ?? 0,
      lengthMs: only ? clipDurationMs(only) : videoMs,
      fitsVideo: only ? only.fitsVideo === true : true,
      gainDb: only?.gainDb ?? sound.defaultGainDb,
      fadeInMs: only?.fadeInMs ?? BACKGROUND_FADE_IN_MS,
      fadeOutMs: only?.fadeOutMs ?? BACKGROUND_FADE_OUT_MS,
    });
    const first = earlier[0];
    if (first) {
      const was = soundFor(first.mediaId)?.name ?? 'the background';
      if (first.mediaId === mediaId && earlier.length === 1) {
        return { action: null, select: null, message: `“${sound.name}” is already under the video.` };
      }
      return {
        action: actions.replaceAudio(earlier.map((c) => c.id), clip, 'Change background sound'),
        select: null,
        message: `“${sound.name}” replaces “${was}” under the video.`,
      };
    }
    return {
      action: actions.addAudio(clip, 'Add sound'),
      select: null,
      message: `“${sound.name}” plays under the whole video, looping. Drag its end on the timeline to shorten it.`,
    };
  }

  // Pulled back so it ends with the video rather than past it.
  const startMs = Math.max(0, Math.min(Math.round(playheadMs), videoMs - sound.durationMs));
  const clip = actions.makeAudioClip(mediaId, {
    startMs,
    durationMs: sound.durationMs,
    gainDb: sound.defaultGainDb,
    // Effects are designed with their own tails.
    fadeOutMs: 0,
  });
  return {
    action: actions.addAudio(clip, 'Add sound'),
    select: clip.id,
    message: `“${sound.name}” added at ${(startMs / 1000).toFixed(1)}s. Drag it on the Sounds row to move it.`,
  };
}
