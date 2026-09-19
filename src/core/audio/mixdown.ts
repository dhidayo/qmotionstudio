import type { AudioClip } from '@/document/types';
import { audioEndMs } from './envelope';
import { scheduleClips, type AudioBufferLookup } from './graph';

/**
 * Renders every clip down to one buffer (§10's "render the mixed audio offline
 * into a single `AudioBuffer`").
 *
 * Runs on the **main thread**, not in the export worker, and not by choice:
 * Web Audio is simply absent from a worker. Measured rather than assumed —
 * inside a `DedicatedWorkerGlobalScope`, `OfflineAudioContext` and
 * `AudioContext` are both `undefined`, while `AudioEncoder` and `AudioData`
 * are present. So the mix happens here and crosses to the worker as raw PCM,
 * where Mediabunny encodes it (D-053).
 *
 * The graph is built by the same `scheduleClips` the live preview uses, which
 * is what makes the exported mix the one the editor played.
 */

/** 48kHz: what Opus wants natively, and what AAC is happy with. */
export const MIX_SAMPLE_RATE = 48_000;
export const MIX_CHANNELS = 2;

export type Mixdown = {
  /** One Float32Array per channel, ready to transfer to the worker. */
  readonly channels: readonly Float32Array[];
  readonly sampleRate: number;
  readonly durationMs: number;
};

export async function renderMixdown(
  clips: readonly AudioClip[],
  lookup: AudioBufferLookup,
  options: { durationMs: number },
): Promise<Mixdown | null> {
  const playable = clips.filter((clip) => lookup(clip.mediaId) !== null);
  if (playable.length === 0) return null;

  /*
   * The mix is as long as the video, not as long as the audio. A track that
   * runs past the last scene is cut; one that stops early leaves silence.
   * Anything else would change the file's duration depending on its music,
   * and the muxer would then hold two tracks of different lengths.
   */
  const durationMs = Math.max(1, options.durationMs);
  const frames = Math.ceil((durationMs / 1000) * MIX_SAMPLE_RATE);

  const ctx = new OfflineAudioContext(MIX_CHANNELS, frames, MIX_SAMPLE_RATE);
  scheduleClips(ctx, ctx.destination, playable, lookup, { fromMs: 0, atContextTime: 0 });

  const rendered = await ctx.startRendering();

  const channels: Float32Array[] = [];
  for (let channel = 0; channel < rendered.numberOfChannels; channel++) {
    // Copied out of the AudioBuffer so the result owns its memory and can be
    // transferred to the worker rather than structured-cloned.
    const data = new Float32Array(rendered.length);
    rendered.copyFromChannel(data, channel);
    channels.push(data);
  }

  return { channels, sampleRate: rendered.sampleRate, durationMs };
}

/**
 * Interleaves planar channels into the single array an `AudioSample` wants.
 *
 * Mediabunny accepts planar formats too, but interleaved f32 is the one every
 * encoder path handles without a conversion of its own, and the cost here is
 * one pass over the buffer.
 */
export function interleave(channels: readonly Float32Array[]): Float32Array {
  const count = channels.length;
  const first = channels[0];
  if (count === 0 || !first) return new Float32Array(0);
  if (count === 1) return first;

  const frames = first.length;
  const out = new Float32Array(frames * count);

  for (let channel = 0; channel < count; channel++) {
    const source = channels[channel];
    if (!source) continue;
    for (let frame = 0; frame < frames; frame++) {
      out[frame * count + channel] = source[frame] ?? 0;
    }
  }
  return out;
}

/** Longest the audio runs, so the caller can decide what to trim against. */
export { audioEndMs };
