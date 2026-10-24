import type { Project } from '@/document/types';
import { playedAudio } from '@/document/select/videoSound';
import { renderMixdown, type Mixdown } from '@/core/audio/mixdown';
import { soundFor } from '@/audio/library';
import { SoundLoadError, loadSounds } from '@/media/sounds';
import type { MediaStore } from '@/media/store';

/**
 * The exported soundtrack, with every sound in it (D-156).
 *
 * A project can be exported before its library sounds have ever been played —
 * opened from a project file, say — so they are fetched here first. Then
 * every clip must have its audio: one that does not used to drop out of the
 * mix without a word, and a video that should have had music came out silent.
 * It now stops the export and names what is missing (§11.8, §16).
 *
 * Mixes the clips as they play: a background loop that fits the video runs to
 * its end (`resolvedAudio`), and each video layer's own sound plays with its
 * picture at its volume, unless it is muted (`playedAudio`, D-163) — the
 * same clips the preview schedules.
 */

/** An export stopped because a clip's sound is not there to mix; the message says which and what to do. */
export class AudioNotReadyError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'AudioNotReadyError';
  }
}

export async function mixForExport(project: Project, media: MediaStore, durationMs: number): Promise<Mixdown | null> {
  const clips = playedAudio(project, media.videoSoundOf);
  try {
    await loadSounds(media, clips.map((clip) => clip.mediaId));
  } catch (error) {
    if (error instanceof SoundLoadError) throw new AudioNotReadyError(`${error.message} The video was not exported, so it is not missing its sound.`, { cause: error });
    throw error;
  }

  const missing = [...new Set(clips.filter((clip) => media.getAudioBuffer(clip.mediaId) === null).map((clip) =>
    media.get(clip.mediaId)?.name ?? soundFor(clip.mediaId)?.name ?? 'a music track'))];
  if (missing.length > 0) {
    const list = missing.map((name) => `“${name}”`).join(', ');
    throw new AudioNotReadyError(
      `${list} ${missing.length === 1 ? 'is' : 'are'} not ready to export. Wait for ${missing.length === 1 ? 'it' : 'them'} to finish loading, or remove ${missing.length === 1 ? 'the clip' : 'those clips'} or add the file again.`,
    );
  }
  return renderMixdown(clips, (id) => media.getAudioBuffer(id), { durationMs });
}
