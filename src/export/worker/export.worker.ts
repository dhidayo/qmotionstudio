/// <reference lib="webworker" />
import {
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  Quality,
  WebMOutputFormat,
} from 'mediabunny';
import type { Project } from '@/document/types';
import { createRenderRig, disposeRenderRig } from '@/core/render/rig';
import { renderFrame } from '@/core/render/renderFrame';
import { loadFonts } from '@/fonts/registry';
import { loadTemplate } from '@/templates/registry';
import { MediaStore } from '@/media/store';
import { decodeImage } from '@/media/image/decode';
import { bitrateFor, frameCount, VIDEO_CODEC, type ExportSettings } from '../config';
import type { ExportRequest, WorkerMessage } from '../protocol';

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

    // Media arrives as Blobs and is decoded here. Transferring ImageBitmaps
    // would detach them on the main thread and break the live preview (§9's
    // "never as data URLs" is right about the mechanism, wrong about transfer).
    const media = new MediaStore();
    for (const [mediaId, blob] of request.media) {
      const entry = await decodeImage(blob, {
        id: mediaId,
        name: mediaId,
        artboardLongestEdge: Math.max(request.size.w, request.size.h),
      });
      media.set(entry);
    }

    const project: Project = request.project;
    const templateId = project.scenes[0]?.templateId;
    if (templateId !== undefined && !templateId.startsWith('__')) {
      await loadTemplate(templateId);
    }

    if (isCancelled()) {
      post({ type: 'cancelled' });
      return;
    }

    const canvas = new OffscreenCanvas(request.size.w, request.size.h);
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Export: could not acquire a 2D context in the worker.');

    rig = createRenderRig(media);
    const output = makeOutput(request.settings);
    const source = new CanvasSource(canvas, {
      codec: VIDEO_CODEC[request.settings.format],
      quality: new Quality({ bitrate: bitrateFor(request.size, request.settings.fps, request.settings.quality) }),
      // §11.4 asks for a key frame every two seconds; that is this field's
      // default, so the manual `i % (fps * 2)` modulo is unnecessary.
      keyFrameInterval: 2,
    });

    output.addVideoTrack(source, { frameRate: request.settings.fps });
    await output.start();

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
      renderFrame(ctx, project, timeMs, rig);

      // Awaiting is the backpressure (§11.5).
      await source.add(frame * frameDuration, frameDuration);

      if (frame % 5 === 0 || frame === total - 1) {
        post({ type: 'progress', frame: frame + 1, totalFrames: total });
      }
    }

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

function makeOutput(settings: ExportSettings): Output<Mp4OutputFormat | WebMOutputFormat, BufferTarget> {
  return new Output({
    format: settings.format === 'mp4' ? new Mp4OutputFormat() : new WebMOutputFormat(),
    target: new BufferTarget(),
  });
}
