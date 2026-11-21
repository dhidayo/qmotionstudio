import { BufferTarget, Mp4OutputFormat, Output, WebMOutputFormat } from 'mediabunny';
import type { Size } from '@/core/types';
import { AUDIO_BITRATE, AUDIO_CODEC, bitrateFor, VIDEO_CODEC, type ExportSettings } from './config';

/**
 * The file an export writes, and what goes into it (§11, D-171).
 *
 * Out of the worker so it can be tested where H.264 cannot be encoded: this
 * machine's browser, and Node. The worker builds its output and its sources
 * from these and nothing else, so a test of these is a test of what a real
 * MP4 export asks the browser for.
 */

/** What the video track is encoded with, for `CanvasSource`. */
export type VideoEncoding = {
  readonly codec: 'avc' | 'vp9';
  readonly bitrate: number;
  /** §11.4: a key frame every two seconds. */
  readonly keyFrameInterval: number;
  readonly frameRate: number;
};

export function videoEncodingFor(settings: ExportSettings, size: Size): VideoEncoding {
  return {
    codec: VIDEO_CODEC[settings.format],
    bitrate: bitrateFor(size, settings.fps, settings.quality),
    keyFrameInterval: 2,
    frameRate: settings.fps,
  };
}

/** What the sound track is encoded with, for `AudioSampleSource` (§11.2: MP4 → AAC, WebM → Opus). */
export function audioEncodingFor(settings: ExportSettings): { readonly codec: 'aac' | 'opus'; readonly bitrate: number } {
  return { codec: AUDIO_CODEC[settings.format], bitrate: AUDIO_BITRATE };
}

/**
 * The container.
 *
 * MP4 is written with its index at the front ("fast start"). A phone's share
 * sheet and Photos read a video from the start; an index at the end has to be
 * reached first, and some apps will not play the file until it has arrived
 * in full. Built in memory anyway, so it costs nothing.
 */
export function makeOutput(settings: ExportSettings): Output<Mp4OutputFormat | WebMOutputFormat, BufferTarget> {
  return new Output({
    format: settings.format === 'mp4' ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(),
    target: new BufferTarget(),
  });
}
