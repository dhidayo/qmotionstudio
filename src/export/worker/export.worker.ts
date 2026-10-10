/// <reference lib="webworker" />
import {
  AudioSample,
  AudioSampleSource,
  BufferTarget,
  canEncodeAudio,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  Quality,
  WebMOutputFormat,
} from 'mediabunny';
import { registerAacEncoder } from '@mediabunny/aac-encoder';
import type { Project } from '@/document/types';
import { createRenderRig, disposeRenderRig } from '@/core/render/rig';
import { renderFrame } from '@/core/render/renderFrame';
import { loadFonts, loadUserFont } from '@/fonts/registry';
import { loadTemplate } from '@/templates/registry';
import { MediaStore } from '@/media/store';
import { decodeImage } from '@/media/image/decode';
import { decodeVideo } from '@/media/video/decode';
import { videoDemands } from '@/document/select/media';
import {
  AUDIO_BITRATE, AUDIO_CODEC, bitrateFor, frameCount, VIDEO_CODEC, type ExportSettings,
} from '../config';
import type { ExportRequest, WorkerMessage } from '../protocol';
import { interleave } from '@/core/audio/mixdown';

/**
 * The export worker (§11.7).
 *
 * Renders offline — frame N, encode, frame N+1 — never from a captured stream
 * (§3D). The same `renderFrame` the preview uses, driven from a fixed timestep
 * instead of requestAnimationFrame, which is the only difference between the
 * two paths and the reason they agree.
 *
 * D-002: Mediabunny owns the encoder. `CanvasSource.add()` returns a promise
 * that stays pending while the encoder is saturated, so awaiting it *is* §11.5's
 * backpressure — there is no encodeQueueSize to poll and no VideoFrame for us
 * to leak, because the source closes its own.
 */

declare const self: DedicatedWorkerGlobalScope;

/**
 * Read through a function, not directly.
 *
 * The flag is set from the message handler, which control-flow analysis cannot
 * see — so a direct read narrows to `false` after the assignment at the top of
 * `run` and the cancel checks become dead code as far as the compiler is
 * concerned. A call defeats that, and reads better at the call sites anyway.
 */
let cancelRequested = false;
const isCancelled = (): boolean => cancelRequested;

self.onmessage = (event: MessageEvent<ExportRequest | { type: 'cancel' }>) => {
  const message = event.data;
  if (message.type === 'cancel') {
    cancelRequested = true;
    return;
  }
  void run(message);
};

function post(message: WorkerMessage, transfer?: Transferable[]): void {
  if (transfer) self.postMessage(message, transfer);
  else self.postMessage(message);
}

async function run(request: ExportRequest): Promise<void> {
  cancelRequested = false;
  let rig: ReturnType<typeof createRenderRig> | null = null;

  try {
    post({ type: 'stage', stage: 'preparing' });

    /*
     * §3E: fonts before the first frame, and the worker must load its own.
     * Faces added to the document's FontFaceSet are not visible here — a
     * frame measured against a fallback face would silently differ from the
     * preview, which is exactly what M4 is meant to prove cannot happen.
     */
    await loadFonts(self.fonts);
    // The person's own fonts, as the preview has them (D-144).
    for (const font of request.fonts ?? []) await loadUserFont(self.fonts, font.id, font.name, font.bytes);

    // Media arrives as Blobs and is decoded here. Transferring ImageBitmaps
    // would detach them on the main thread and break the live preview (§9's
    // "never as data URLs" is right about the mechanism, wrong about transfer).
    const media = new MediaStore();
    for (const [mediaId, blob] of request.media) {
      // Custom media opens its own container and decoder in this realm (§9).
      // The main thread's clip cannot be shared — a decoder is not
      // transferable, and the two paths must not contend for one ring anyway.
      const entry = blob.type.startsWith('video/')
        ? await decodeVideo(blob, { id: mediaId, name: mediaId })
        : await decodeImage(blob, {
            id: mediaId,
            name: mediaId,
            artboardLongestEdge: Math.max(request.size.w, request.size.h),
          });
      media.set(entry);
    }

    const project: Project = request.project;

    // Every scene's template, not just the first. An ad's later beats are the
    // ones a single-scene load would silently render blank — and the export
    // would finish "successfully" with half the frames empty, which §16's ban
    // on swallowing errors is exactly about.
    const templateIds = [...new Set(project.scenes.map((scene) => scene.templateId))]
      .filter((id) => !id.startsWith('__'));
    await Promise.all(templateIds.map((id) => loadTemplate(id)));

    if (isCancelled()) {
      post({ type: 'cancelled' });
      return;
    }

    const canvas = new OffscreenCanvas(request.size.w, request.size.h);
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Export: could not acquire a 2D context in the worker.');

    // §12, from the request rather than from any ambient state in the worker.
    rig = createRenderRig(media, () => request.watermark);
    const output = makeOutput(request.settings);
    const source = new CanvasSource(canvas, {
      codec: VIDEO_CODEC[request.settings.format],
      quality: new Quality({ bitrate: bitrateFor(request.size, request.settings.fps, request.settings.quality) }),
      // §11.4 asks for a key frame every two seconds; that is this field's
      // default, so the manual `i % (fps * 2)` modulo is unnecessary.
      keyFrameInterval: 2,
    });

    output.addVideoTrack(source, { frameRate: request.settings.fps });

    /*
     * §10: the mix is muxed as a second track, sharing one microsecond
     * timebase with the video. Mediabunny owns that — both sources take
     * timestamps in seconds and it converts once (D-002).
     */
    const audioSource = await makeAudioSource(request);
    if (audioSource) output.addAudioTrack(audioSource);

    await output.start();

    /*
     * Audio is fed *alongside* the video, not before it.
     *
     * Writing the whole mix up front deadlocked the MP4 muxer: an interleaved
     * container will not let one track run arbitrarily far ahead of another,
     * so `add()` blocked waiting for video frames that the loop below had not
     * started producing yet. WebM tolerated it, which is exactly the kind of
     * difference that makes "it worked in one format" worthless as evidence.
     */
    const audio = audioSource && request.audio
      ? new AudioFeeder(audioSource, request.audio)
      : null;

    const total = frameCount(request.durationMs, request.settings.fps);
    const frameDuration = 1 / request.settings.fps;

    post({ type: 'stage', stage: 'encoding', totalFrames: total });

    for (let frame = 0; frame < total; frame++) {
      if (isCancelled()) {
        await output.cancel();
        post({ type: 'cancelled' });
        return;
      }

      // Fixed timestep. The preview samples wall-clock times; both call the
      // same renderFrame, so the same t produces the same pixels (D-017).
      const timeMs = (frame / request.settings.fps) * 1000;

      /*
       * Unlike the preview, this *awaits* the decode (D-051). A dropped video
       * frame here would be baked into the file, and an export that silently
       * substitutes a placeholder for a frame it could have decoded is exactly
       * the kind of quiet wrongness §16 is about.
       */
      for (const demand of videoDemands(project, timeMs)) {
        await media.prefetchVideo(demand.mediaId, demand.timeMs);
      }

      renderFrame(ctx, project, timeMs, rig);

      // Awaiting is the backpressure (§11.5).
      await source.add(frame * frameDuration, frameDuration);

      // Keep the audio track roughly level with the video one.
      if (audio) await audio.feedUpTo(timeMs / 1000);

      if (frame % 5 === 0 || frame === total - 1) {
        post({ type: 'progress', frame: frame + 1, totalFrames: total });
      }
    }

    if (audio) await audio.finish();

    post({ type: 'stage', stage: 'finalising' });
    await output.finalize();

    const buffer = output.target.buffer;
    if (!buffer) throw new Error('Export: the muxer produced no output.');

    post({ type: 'done', buffer, byteLength: buffer.byteLength }, [buffer]);
  } catch (error) {
    // §11.8 and §16: never swallow an export error.
    const stack = error instanceof Error ? error.stack : undefined;
    post({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
      ...(stack === undefined ? {} : { stack }),
    });
  } finally {
    if (rig) disposeRenderRig(rig);
  }
}

/**
 * Prepares the audio track, registering the AAC polyfill only if needed.
 *
 * D-010 approved `@mediabunny/aac-encoder` as a narrow amendment to §16's
 * dependency ban. It is a polyfill, so it is registered only where the browser
 * genuinely cannot encode AAC itself — overriding a native encoder would be
 * slower and pointless.
 */
async function makeAudioSource(request: ExportRequest): Promise<AudioSampleSource | null> {
  if (!request.audio || request.audio.channels.length === 0) return null;

  const codec = AUDIO_CODEC[request.settings.format];
  if (codec === 'aac' && !(await canEncodeAudio('aac'))) {
    registerAacEncoder();
  }

  if (!(await canEncodeAudio(codec))) {
    // §16: silently dropping the music would produce a file the user has no
    // reason to suspect is wrong.
    throw new Error(
      `This browser cannot encode ${codec.toUpperCase()} audio, so the music could not be included.`,
    );
  }

  return new AudioSampleSource({
    codec,
    bitrate: AUDIO_BITRATE,
  });
}

/**
 * Feeds the mix to the encoder in step with the video.
 *
 * One `AudioSample` per second rather than one for the whole mix: an encoder
 * handed a thirty-second sample allocates the lot before emitting anything,
 * and awaiting each `add` is what §11.5's backpressure means on this side too.
 *
 * `LEAD_S` keeps audio slightly ahead of the video so the muxer always has
 * something to interleave, without letting it run far enough ahead to block.
 */
const AUDIO_CHUNK_S = 1;
const AUDIO_LEAD_S = 2;

class AudioFeeder {
  readonly #source: AudioSampleSource;
  readonly #audio: NonNullable<ExportRequest['audio']>;
  readonly #frames: number;
  readonly #channels: number;
  #cursor = 0;

  constructor(source: AudioSampleSource, audio: NonNullable<ExportRequest['audio']>) {
    this.#source = source;
    this.#audio = audio;
    this.#channels = audio.channels.length;
    this.#frames = audio.channels[0]?.length ?? 0;
  }

  /** Adds chunks until the audio is `AUDIO_LEAD_S` ahead of `videoTimeS`. */
  async feedUpTo(videoTimeS: number): Promise<void> {
    if (this.#channels === 0) return;
    const targetFrame = Math.min(
      this.#frames,
      Math.ceil((videoTimeS + AUDIO_LEAD_S) * this.#audio.sampleRate),
    );
    await this.#feedTo(targetFrame);
  }

  async finish(): Promise<void> {
    await this.#feedTo(this.#frames);
    this.#source.close();
  }

  async #feedTo(targetFrame: number): Promise<void> {
    const chunkFrames = Math.max(1, Math.floor(this.#audio.sampleRate * AUDIO_CHUNK_S));

    while (this.#cursor < targetFrame) {
      const start = this.#cursor;
      const end = Math.min(this.#frames, start + chunkFrames);
      if (end <= start) break;

      const slice = this.#audio.channels.map((channel) => channel.subarray(start, end));
      const sample = new AudioSample({
        data: interleave(slice),
        format: 'f32',
        numberOfChannels: this.#channels,
        sampleRate: this.#audio.sampleRate,
        timestamp: start / this.#audio.sampleRate,
      });

      await this.#source.add(sample);
      sample.close();
      this.#cursor = end;
    }
  }
}

function makeOutput(settings: ExportSettings): Output<Mp4OutputFormat | WebMOutputFormat, BufferTarget> {
  return new Output({
    format: settings.format === 'mp4' ? new Mp4OutputFormat() : new WebMOutputFormat(),
    target: new BufferTarget(),
  });
}
