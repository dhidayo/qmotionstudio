import type { MediaEntry } from '../store';
import { computePeaks, type Waveform } from './waveform';

/**
 * Audio import (§10).
 *
 * "Import MP3/M4A/WAV/OGG… Decode with `OfflineAudioContext.decodeAudioData`."
 *
 * Decoding to a single `AudioBuffer` up front rather than streaming is
 * deliberate: §10 caps a project at one music track, the preview has to be
 * able to start from any point on the timeline without a seek penalty, and the
 * export mix needs the whole thing in memory anyway. A five-minute stereo
 * track at 48kHz is about 115MB of float — inside §14's 900MB budget, and the
 * reason the size cap below exists.
 */

export const ACCEPTED_AUDIO_TYPES = [
  'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/webm',
] as const;

export class UnsupportedAudioError extends Error {
  // Takes options so the underlying DOMException survives; browsers say
  // useful things about why a container would not decode.
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'UnsupportedAudioError';
  }
}

/** Roughly six minutes of stereo at 48kHz once decoded. */
export const MAX_AUDIO_BYTES = 40 * 1024 * 1024;
export const MAX_AUDIO_MS = 10 * 60_000;

export function isAudioFile(file: { type: string; name: string }): boolean {
  return file.type.startsWith('audio/') || /\.(mp3|m4a|aac|wav|ogg|oga|flac)$/i.test(file.name);
}

/**
 * A throwaway context purely for decoding.
 *
 * `decodeAudioData` lives on `BaseAudioContext`, so an OfflineAudioContext
 * serves — and unlike a live `AudioContext` it needs no user gesture to exist,
 * which matters because a file can be dropped before anything has been played.
 */
function decodingContext(): OfflineAudioContext {
  return new OfflineAudioContext(1, 1, 48_000);
}

export async function decodeAudio(
  blob: Blob,
  options: { id: string; name: string },
): Promise<MediaEntry> {
  if (blob.size > MAX_AUDIO_BYTES) {
    throw new UnsupportedAudioError(
      `"${options.name}" is ${(blob.size / 1024 / 1024).toFixed(0)}MB. ` +
      `Audio is capped at ${MAX_AUDIO_BYTES / 1024 / 1024}MB — a compressed MP3 or M4A will be well under it.`,
    );
  }

  let buffer: AudioBuffer;
  try {
    buffer = await decodingContext().decodeAudioData(await blob.arrayBuffer());
  } catch (error) {
    // §16: a file that will not decode says so. Browsers differ on Ogg and
    // FLAC, and "nothing happened" is the worst possible answer.
    throw new UnsupportedAudioError(
      `Could not decode "${options.name}". Try an MP3, M4A or WAV.`,
      { cause: error },
    );
  }

  const durationMs = buffer.duration * 1000;
  if (durationMs > MAX_AUDIO_MS) {
    throw new UnsupportedAudioError(
      `"${options.name}" runs ${(durationMs / 60_000).toFixed(1)} minutes. ` +
      `Audio is capped at ${MAX_AUDIO_MS / 60_000} minutes.`,
    );
  }

  return {
    id: options.id,
    kind: 'audio',
    name: options.name,
    blob,
    bitmap: null,
    audio: buffer,
    waveform: computePeaks(buffer),
    width: 0,
    height: 0,
    durationMs,
  };
}

/**
 * A video's own sound (D-163): the audio track of an MP4 or WebM, decoded
 * whole like an imported track, so the video layer can play it in step with
 * its picture. `decodeAudioData` reads a video container's audio and ignores
 * the picture.
 *
 * Null, not an error, when there is nothing to hear: a video with no sound
 * track (a screen recording, a GIF made into an MP4) simply has none, and
 * Web Audio says so by refusing to decode. Null too where Web Audio does not
 * exist — the export worker opens videos for their frames only, and its mix
 * was made on the main thread (D-053).
 */
export async function decodeSoundTrack(blob: Blob): Promise<AudioBuffer | null> {
  if (typeof OfflineAudioContext === 'undefined') return null;
  try {
    const buffer = await decodingContext().decodeAudioData(await blob.arrayBuffer());
    return buffer.duration > 0 && buffer.length > 0 ? buffer : null;
  } catch {
    return null;
  }
}

export type { Waveform };
