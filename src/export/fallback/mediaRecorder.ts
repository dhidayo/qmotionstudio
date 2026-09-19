import type { Project } from '@/document/types';
import { createRenderRig, disposeRenderRig } from '@/core/render/rig';
import { renderFrame } from '@/core/render/renderFrame';
import type { MediaStore } from '@/media/store';
import { totalDurationMs } from '@/document/select/timeline';
import { exportSize, fileNameFor, type ExportSettings } from '../config';
import { ExportCancelled, type ExportHandle, type ExportProgress, type ExportResult } from '../types';

/**
 * The real-time fallback (§11.9).
 *
 * For browsers without WebCodecs — Firefox for Android, and anything older
 * than about 2022. §3D forbids this from ever being the primary path, and it
 * is not: `startExport` only reaches here when `canUseOfflineExport()` is false.
 *
 * Two properties the caller has to live with, and the UI says so plainly:
 *
 *   - It runs in **real time**. A 30-second clip takes 30 seconds, because
 *     MediaRecorder samples a live stream rather than being fed frames.
 *   - It may **drop frames** under load, for the same reason. The output is
 *     therefore not frame-exact against the preview, unlike the offline path.
 *
 * It also cannot use the worker: `captureStream` exists on HTMLCanvasElement
 * and not on OffscreenCanvas, so this renders on the main thread. That is the
 * whole reason §11.7's "move only the encoder into the worker" escape hatch
 * exists, and why the fallback is structured completely differently from the
 * primary path rather than sharing its plumbing.
 */

/** WebM only — no browser that lacks WebCodecs will record H.264 either. */
function pickMimeType(): string | null {
  const candidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return null;
}

export function canUseRealtimeExport(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function' &&
    pickMimeType() !== null
  );
}

export function startRealtimeExport(options: {
  project: Project;
  settings: ExportSettings;
  media: MediaStore;
  onProgress: (progress: ExportProgress) => void;
}): ExportHandle {
  const { project, settings, media, onProgress } = options;

  const size = exportSize(project.aspect, settings);
  const durationMs = totalDurationMs(project);
  const startedAt = performance.now();
  const totalFrames = Math.round((durationMs / 1000) * settings.fps);

  let cancelRequested = false;
  const isCancelled = (): boolean => cancelRequested;

  const result = new Promise<ExportResult>((resolve, reject) => {
    const mimeType = pickMimeType();
    if (mimeType === null) {
      reject(new Error('This browser cannot record video. Try Chrome, Edge or Firefox on desktop.'));
      return;
    }

    // Offscreen in the DOM sense — attached but not displayed — because
    // captureStream needs a real canvas element.
    const canvas = document.createElement('canvas');
    canvas.width = size.w;
    canvas.height = size.h;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      reject(new Error('Export: could not acquire a 2D context.'));
      return;
    }

    const rig = createRenderRig(media);
    const stream = canvas.captureStream(settings.fps);
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: Blob[] = [];

    let frame = 0;
    let rafHandle = 0;
    let finished = false;

    const cleanup = (): void => {
      cancelAnimationFrame(rafHandle);
      for (const track of stream.getTracks()) track.stop();
      disposeRenderRig(rig);
    };

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };

    recorder.onerror = () => {
      cleanup();
      // §16: never swallow.
      reject(new Error('Recording failed partway through.'));
    };

    recorder.onstop = () => {
      cleanup();
      if (isCancelled()) {
        reject(new ExportCancelled());
        return;
      }
      resolve({
        blob: new Blob(chunks, { type: 'video/webm' }),
        // Always .webm regardless of the requested format — §11.9 is WebM only.
        fileName: fileNameFor(project.name, { ...settings, format: 'webm' }),
        path: 'realtime',
        durationMs: performance.now() - startedAt,
      });
    };

    onProgress({ stage: 'preparing', frame: 0, totalFrames, path: 'realtime' });
    recorder.start();

    const began = performance.now();

    const tick = (): void => {
      if (finished) return;

      if (isCancelled()) {
        finished = true;
        recorder.stop();
        return;
      }

      // Driven by wall clock, not a frame counter: the recorder samples the
      // canvas on its own schedule, so pretending we control the timestep
      // would desynchronise the content from the recording.
      const elapsed = performance.now() - began;
      if (elapsed >= durationMs) {
        finished = true;
        // One last frame exactly at the end, so the clip does not stop short.
        renderFrame(ctx, project, durationMs, rig);
        onProgress({ stage: 'finalising', frame: totalFrames, totalFrames, path: 'realtime' });
        recorder.stop();
        return;
      }

      renderFrame(ctx, project, elapsed, rig);
      frame = Math.round((elapsed / 1000) * settings.fps);
      onProgress({ stage: 'encoding', frame, totalFrames, path: 'realtime' });

      rafHandle = requestAnimationFrame(tick);
    };

    rafHandle = requestAnimationFrame(tick);
  });

  return {
    result,
    cancel: () => { cancelRequested = true; },
  };
}
