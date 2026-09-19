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

export type { Waveform };
