import type { AudioClip } from '@/document/types';
import { clipDurationMs, clipEndMs, envelopeFrom } from './envelope';

/**
 * Builds the Web Audio graph for a set of clips (§10).
 *
 * The audio counterpart of §3A's one render function, and for the same reason.
 * Preview schedules into a live `AudioContext`; export renders the identical
 * graph through an `OfflineAudioContext`. Both call this. The moment they
 * stop, an exported mix stops matching what the editor played — which is the
 * audio version of the exact failure decision A exists to prevent (D-052).
 *
 * `BaseAudioContext` is the shared supertype of both, so nothing here needs to
 * know which one it got.
 */

export type AudioBufferLookup = (mediaId: string) => AudioBuffer | null;

export type ScheduleOptions = {
  /** Project time the playhead is at when scheduling begins. */
  readonly fromMs: number;
  /** The context's own clock reading that corresponds to `fromMs`. */
  readonly atContextTime: number;
};

export type ScheduledClip = {
  readonly clip: AudioClip;
  readonly source: AudioBufferSourceNode;
  readonly gain: GainNode;
};

export function scheduleClips(
  ctx: BaseAudioContext,
  destination: AudioNode,
  clips: readonly AudioClip[],
  lookup: AudioBufferLookup,
  options: ScheduleOptions,
): ScheduledClip[] {
  const { fromMs, atContextTime } = options;
  const scheduled: ScheduledClip[] = [];

  for (const clip of clips) {
    const buffer = lookup(clip.mediaId);
    if (!buffer) continue;

    const duration = clipDurationMs(clip);
    if (duration <= 0) continue;

    // Already finished before playback begins.
    if (clipEndMs(clip) <= fromMs) continue;

    /*
     * How far into the clip playback starts. Non-zero whenever the user
     * presses play from the middle of a track, which is most of the time.
     */
    const intoClip = Math.max(0, fromMs - clip.startMs);
    const remainingMs = duration - intoClip;
    if (remainingMs <= 0) continue;

    /*
     * Clamp against the source. A trim can outlive its file — the document
     * survives a media store that was rebuilt from a shorter re-import — and
     * `start()` with an offset past the end plays nothing at all rather than
     * failing usefully.
     */
    const sourceLengthMs = buffer.duration * 1000;
    const offsetMs = Math.min(clip.trimStartMs + intoClip, sourceLengthMs);
    const playableMs = Math.max(0, Math.min(remainingMs, sourceLengthMs - offsetMs));
    if (playableMs <= 0) continue;

    // Where on the context's clock this clip begins.
    const when = atContextTime + Math.max(0, clip.startMs - fromMs) / 1000;

    const gain = ctx.createGain();
    const points = envelopeFrom(clip, intoClip);

    const first = points[0];
    if (first) gain.gain.setValueAtTime(first.gain, when);

    for (const point of points.slice(1)) {
      // Envelope times are relative to the clip; the graph needs context time.
      const at = when + (point.atMs - intoClip) / 1000;
      gain.gain.linearRampToValueAtTime(point.gain, at);
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);
    gain.connect(destination);
    source.start(when, offsetMs / 1000, playableMs / 1000);

    scheduled.push({ clip, source, gain });
  }

  return scheduled;
}

/** Stops and disconnects everything a `scheduleClips` call produced. */
export function stopScheduled(scheduled: readonly ScheduledClip[]): void {
  for (const { source, gain } of scheduled) {
    try {
      source.stop();
    } catch {
      // Already stopped, or never started because the context went away.
      // Neither is worth surfacing; the disconnect below is what matters.
    }
    source.disconnect();
    gain.disconnect();
  }
}
