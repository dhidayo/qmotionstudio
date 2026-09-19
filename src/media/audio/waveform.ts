/**
 * Waveform peaks for the timeline's music track (§10).
 *
 * Computed once at import and kept, because the alternative is reading a few
 * million floats every time the track is redrawn — which happens on every
 * resize, every zoom and every clip drag.
 *
 * Min and max per bucket rather than RMS: a waveform is read as a silhouette,
 * and RMS collapses the asymmetry that makes one legible. Stored as a flat
 * pair-per-bucket array to keep it compact.
 */

export type Waveform = {
  /** `[min0, max0, min1, max1, …]`, each in −1…1. */
  readonly peaks: Float32Array;
  readonly buckets: number;
};

/**
 * Enough detail for a track drawn a few hundred pixels wide, with headroom for
 * a wide window. Past this the extra resolution is invisible.
 */
export const WAVEFORM_BUCKETS = 2_048;

export function computePeaks(buffer: AudioBuffer, buckets = WAVEFORM_BUCKETS): Waveform {
  const count = Math.max(1, Math.min(buckets, buffer.length));
  const peaks = new Float32Array(count * 2);

  const channels: Float32Array[] = [];
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    channels.push(buffer.getChannelData(channel));
  }

  const perBucket = buffer.length / count;

  for (let bucket = 0; bucket < count; bucket++) {
    const start = Math.floor(bucket * perBucket);
    const end = Math.min(buffer.length, Math.floor((bucket + 1) * perBucket));

    let min = 0;
    let max = 0;

    for (const data of channels) {
      for (let i = start; i < end; i++) {
        const value = data[i] ?? 0;
        if (value < min) min = value;
        if (value > max) max = value;
      }
    }

    peaks[bucket * 2] = min;
    peaks[bucket * 2 + 1] = max;
  }

  return { peaks, buckets: count };
}

/**
 * The peak pair covering a fraction of the way through the waveform.
 *
 * Takes a 0–1 position rather than a bucket index so callers can draw against
 * whatever width they have without duplicating the scaling arithmetic — and
 * so a trimmed clip can sample the part of the source it actually plays.
 */
export function peakAt(waveform: Waveform, position: number): { min: number; max: number } {
  if (waveform.buckets === 0) return { min: 0, max: 0 };

  const clamped = position < 0 ? 0 : position > 1 ? 1 : position;
  const index = Math.min(waveform.buckets - 1, Math.floor(clamped * waveform.buckets));

  return {
    min: waveform.peaks[index * 2] ?? 0,
    max: waveform.peaks[index * 2 + 1] ?? 0,
  };
}
