import type { AudioClip, Overlay, OverlayContent, Project } from '@/document/types';
import { resolvedAudio } from './timeline';

/**
 * A video layer's own sound (D-163).
 *
 * "Uploaded video should have volume control on the setting where I can
 * reduce, increase or mute sound of the videos." A video overlay used to play
 * no sound at all, in the preview or the export. Its sound now plays with it,
 * as one more audio clip derived from the overlay — never stored, so it cannot
 * drift from the picture and there is nothing to migrate.
 *
 * The clip follows the picture exactly as the video layer maps time
 * (`VideoClip.localMs`): the video starts from its first frame at the
 * overlay's start, loops round its whole length for as long as the overlay
 * lasts, and stops where the overlay ends. So the clip starts at
 * `overlay.startMs`, loops the window `[0, video length)` from phase 0, and
 * is as long as the overlay. A video has no in-point or trim of its own yet;
 * when it gains one, this is the one place that must learn it.
 *
 * The window is the picture's length exactly, not the sound's (D-172): a
 * decoded track is often a few milliseconds shorter or longer than the
 * picture, and a loop of the sound's own length would come round that much
 * early or late every time, drifting further out of step on each repeat. So
 * the clip asks for an exact window (`exactWindow`): a longer sound is cut to
 * the picture each time round, and a shorter one padded with silence, so
 * every repeat starts with the picture's.
 *
 * `volumeDb` is the clip's gain, 0 dB (as recorded) when unset. A muted
 * video gives no clip, so nothing is scheduled. A video with no sound track
 * gives none either: the lookup returns null for it.
 *
 * Preview (`useAudioPlayback`) and export (`mixForExport`) both read
 * `playedAudio`, and both hand it to the one `scheduleClips`, so what is heard
 * in the editor is what is in the file (D-052).
 */

/** The decoded sound of a video, by media id: how long the picture runs before it loops. Null for a video with no sound, or none decoded. */
export type VideoSoundLookup = (mediaId: string) => { readonly lengthMs: number } | null;

/** The volume range the inspector offers (D-163): from nearly silent to a little louder than recorded. */
export const VIDEO_VOLUME_MIN_DB = -40;
export const VIDEO_VOLUME_MAX_DB = 6;

/** A derived clip's id: never one of the project's own, so a selection or an edit cannot reach it. */
export const VIDEO_SOUND_PREFIX = 'video-sound:';

/** A video layer's volume as it plays: 0 dB when unset, kept inside the range. */
export function videoVolumeDb(content: OverlayContent): number {
  if (content.kind !== 'customMedia') return 0;
  const db = content.volumeDb ?? 0;
  return Number.isFinite(db) ? Math.max(VIDEO_VOLUME_MIN_DB, Math.min(VIDEO_VOLUME_MAX_DB, db)) : 0;
}

export function videoSoundClips(overlays: readonly Overlay[], soundOf: VideoSoundLookup): readonly AudioClip[] {
  const clips: AudioClip[] = [];
  for (const overlay of overlays) {
    if (overlay.content.kind !== 'customMedia' || overlay.content.muted === true) continue;
    const lengthMs = overlay.endMs - overlay.startMs;
    if (lengthMs <= 0) continue;
    const sound = soundOf(overlay.content.mediaId);
    if (!sound || !(sound.lengthMs > 0)) continue;
    clips.push({
      id: `${VIDEO_SOUND_PREFIX}${overlay.id}`,
      mediaId: overlay.content.mediaId,
      startMs: overlay.startMs,
      trimStartMs: 0,
      trimEndMs: sound.lengthMs,
      gainDb: videoVolumeDb(overlay.content),
      fadeInMs: 0,
      fadeOutMs: 0,
      loop: true,
      lengthMs,
      loopPhaseMs: 0,
      exactWindow: true,
    });
  }
  return clips;
}

/**
 * The videos whose sound cannot be known yet: a layer that would play
 * (unmuted, with some length) whose media is not in the store — a reopened
 * project whose video is still being read, or one that could not be (D-172).
 * Its sound is decoded with its picture, so until the entry lands there is no
 * telling whether it has any, and an export then would leave it out without
 * a word. Each media id once, in layer order.
 */
export function videoSoundsPending(overlays: readonly Overlay[], isLoaded: (mediaId: string) => boolean): readonly string[] {
  const pending = new Set<string>();
  for (const overlay of overlays) {
    if (overlay.content.kind !== 'customMedia' || overlay.content.muted === true) continue;
    if (overlay.endMs - overlay.startMs <= 0) continue;
    if (!isLoaded(overlay.content.mediaId)) pending.add(overlay.content.mediaId);
  }
  return [...pending];
}

/**
 * Everything that sounds, as it plays: the project's own audio
 * (`resolvedAudio`) and then each video layer's sound.
 *
 * The same array comes back while neither changes — the preview reschedules
 * whenever the array it is given changes, so a fresh one on every edit would
 * restart the music each time a word was typed during playback.
 */
const played = new WeakMap<readonly AudioClip[], { readonly video: readonly AudioClip[]; readonly all: readonly AudioClip[] }>();

export function playedAudio(project: Project, soundOf: VideoSoundLookup): readonly AudioClip[] {
  const audio = resolvedAudio(project);
  const video = videoSoundClips(project.overlays, soundOf);
  if (video.length === 0) return audio;
  const hit = played.get(audio);
  if (hit && sameClips(hit.video, video)) return hit.all;
  const all = [...audio, ...video];
  played.set(audio, { video, all });
  return all;
}

function sameClips(a: readonly AudioClip[], b: readonly AudioClip[]): boolean {
  return a.length === b.length && a.every((clip, i) => {
    const other = b[i];
    return other !== undefined
      && clip.id === other.id
      && clip.mediaId === other.mediaId
      && clip.startMs === other.startMs
      && clip.trimEndMs === other.trimEndMs
      && clip.gainDb === other.gainDb
      && clip.lengthMs === other.lengthMs;
  });
}
