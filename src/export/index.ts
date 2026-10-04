import type { Size } from '@/core/types';
import type { Project } from '@/document/types';
import { totalDurationMs } from '@/document/select/timeline';
import type { MediaStore } from '@/media/store';
import {
  CONTAINER_MIME, exportSize, fileNameFor, VIDEO_CODEC,
  type ExportFormat, type ExportSettings, type FormatAvailability,
} from './config';
import type { ExportRequest, WorkerMessage } from './protocol';
import {
  ExportCancelled,
  type ExportHandle,
  type ExportProgress,
  type ExportResult,
} from './types';
import { canUseRealtimeExport, startRealtimeExport } from './fallback/mediaRecorder';
import { renderMixdown } from '@/core/audio/mixdown';

export { ExportCancelled };
export type { ExportHandle, ExportProgress, ExportResult, ExportPath } from './types';

/**
 * Export orchestration (§11).
 *
 * Picks a path, runs it, reports progress, and surfaces failures rather than
 * swallowing them (§11.8). The offline worker is the primary; MediaRecorder is
 * the fallback for browsers without WebCodecs (§11.9), and §3D forbids it from
 * ever being anything else.
 */

/**
 * §11.1: feature-detect at runtime, never by user agent.
 *
 * Probed per format and per resolution, because support is not uniform — a
 * browser may encode H.264 at 720p and refuse 1080p on a given machine.
 */
export async function probeFormats(size: Size): Promise<FormatAvailability[]> {
  const formats: ExportFormat[] = ['mp4', 'webm'];

  // Loaded when the export window asks, not with the editor (D-112).
  const { canEncodeVideo } = await import('mediabunny');
  return Promise.all(
    formats.map(async (format): Promise<FormatAvailability> => {
      try {
        const ok = await canEncodeVideo(VIDEO_CODEC[format], {
          width: size.w,
          height: size.h,
        });
        return ok
          ? { format, available: true }
          : {
              format,
              available: false,
              reason:
                format === 'mp4'
                  ? 'This browser cannot encode H.264. Firefox on Android and some Linux builds are the usual reason.'
                  : 'This browser cannot encode VP9.',
            };
      } catch (error) {
        return {
          format,
          available: false,
          reason: error instanceof Error ? error.message : 'Codec probe failed.',
        };
      }
    }),
  );
}

export function canUseOfflineExport(): boolean {
  return typeof VideoEncoder !== 'undefined' && typeof OffscreenCanvas !== 'undefined';
}

/**
 * Starts an export on the best available path.
 *
 * §3D: the offline worker is always preferred. MediaRecorder runs only when
 * WebCodecs is genuinely absent, never as an optimisation or a shortcut.
 */
export function startExport(options: {
  project: Project;
  settings: ExportSettings;
  media: MediaStore;
  /** §12. Passed in rather than read here: entitlements are a UI concern. */
  watermark: boolean;
  onProgress: (progress: ExportProgress) => void;
}): ExportHandle {
  const { project, settings, media, watermark, onProgress } = options;

  if (!canUseOfflineExport()) {
    if (!canUseRealtimeExport()) {
      return {
        result: Promise.reject(
          new Error(
            'This browser cannot export video. It supports neither WebCodecs nor canvas recording.',
          ),
        ),
        cancel: () => undefined,
      };
    }
    return startRealtimeExport(options);
  }

  const size = exportSize(project.aspect, settings);
  const durationMs = totalDurationMs(project);
  const startedAt = performance.now();

  const worker = new Worker(new URL('./worker/export.worker.ts', import.meta.url), {
    type: 'module',
  });

  let cancelled = false;

  let settle: ((result: ExportResult) => void) | null = null;
  let fail: ((error: unknown) => void) | null = null;

  const result = new Promise<ExportResult>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });

  worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
    const message = event.data;

    switch (message.type) {
      case 'stage':
        onProgress({
          stage: message.stage,
          frame: 0,
          totalFrames: message.totalFrames ?? 0,
          path: 'offline',
        });
        return;

      case 'progress':
        onProgress({
          stage: 'encoding',
          frame: message.frame,
          totalFrames: message.totalFrames,
          path: 'offline',
        });
        return;

      case 'done': {
        const blob = new Blob([message.buffer], { type: CONTAINER_MIME[settings.format] });
        settle?.({
          blob,
          fileName: fileNameFor(project.name, settings),
          path: 'offline',
          durationMs: performance.now() - startedAt,
        });
        worker.terminate();
        return;
      }

      case 'cancelled':
        fail?.(new ExportCancelled());
        worker.terminate();
        return;

      case 'error':
        // §16: surface it with the worker's own stack attached.
        fail?.(new Error(message.message, { cause: message.stack }));
        worker.terminate();
        return;
    }
  };

  worker.onerror = (event) => {
    fail?.(new Error(`Export worker failed: ${event.message}`));
    worker.terminate();
  };

  // Blobs, not ImageBitmaps — transferring a bitmap detaches it and would kill
  // the live preview mid-export. See protocol.ts.
  const usedMedia: (readonly [string, Blob])[] = [];
  for (const id of mediaIdsIn(project)) {
    const entry = media.get(id);
    if (entry) usedMedia.push([id, entry.blob] as const);
  }

  /*
   * The audio mix is rendered here, on the main thread, because Web Audio is
   * absent from workers (D-053) — so this is asynchronous where the rest of
   * the setup is not. The worker is started either way; it simply receives the
   * request a moment later.
   */
  void renderMixdown(project.audio, (id) => media.getAudioBuffer(id), { durationMs })
    .then((mix) => {
      if (cancelled) return;

      const request: ExportRequest = {
        type: 'export',
        project,
        settings,
        size,
        durationMs,
        watermark,
        media: usedMedia,
        ...(mix === null ? {} : { audio: mix }),
      };

      // The PCM is transferred rather than copied; a three-minute stereo mix
      // is 70MB and structured-cloning it would briefly double that.
      const transfer = mix === null ? [] : mix.channels.map((c) => c.buffer as ArrayBuffer);
      worker.postMessage(request, transfer);
    })
    .catch((error: unknown) => {
      // §11.8, §16: an audio failure fails the export rather than quietly
      // producing a silent file.
      fail?.(new Error(
        'Could not render the audio mix.',
        { cause: error },
      ));
      worker.terminate();
    });

  return {
    result,
    cancel: () => {
      cancelled = true;
      worker.postMessage({ type: 'cancel' });
    },
  };
}

/** Every mediaId the document references, so the worker decodes only what it needs. */
function mediaIdsIn(project: Project): string[] {
  const ids = new Set<string>();
  for (const scene of project.scenes) {
    for (const photo of scene.inputs.photos) ids.add(photo.mediaId);
    if (scene.inputs.logo.mediaId !== null) ids.add(scene.inputs.logo.mediaId);
  }
  for (const overlay of project.overlays) {
    if (overlay.content.kind !== 'text') ids.add(overlay.content.mediaId);
  }
  /*
   * Audio is deliberately absent: the mix crosses as rendered PCM, not as
   * source files (D-053), so sending the blobs too would ship a track the
   * worker has no way to decode and no reason to want.
   */
  return [...ids];
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  // Revoked on the next tick: revoking synchronously can cancel the download
  // in some browsers before it has read the blob.
  setTimeout(() => { URL.revokeObjectURL(url); }, 10_000);
}
