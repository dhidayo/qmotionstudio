import type { Size } from '@/core/types';
import type { Project } from '@/document/types';
import type { ExportSettings } from './config';

/**
 * The main-thread ↔ worker contract.
 *
 * Media crosses as Blobs, not ImageBitmaps. §9 says to transfer bitmaps, but
 * transferring one *detaches* it on the sending side — the live preview's
 * bitmaps would go dead mid-export. Blobs structured-clone cheaply and the
 * worker decodes its own (see the M0 spec review, 1.3).
 */
export type ExportRequest = {
  readonly type: 'export';
  readonly project: Project;
  readonly settings: ExportSettings;
  readonly size: Size;
  readonly durationMs: number;
  /** §12. Decided on the main thread, where the tier lives, and sent. */
  readonly watermark: boolean;
  /** mediaId → source blob. */
  readonly media: readonly (readonly [string, Blob])[];
  /**
   * The finished audio mix, as raw PCM (§10, D-053).
   *
   * Rendered on the main thread rather than here, because Web Audio does not
   * exist in a worker — `OfflineAudioContext` is `undefined` in one, measured
   * rather than assumed. The channels are transferred, so the main thread
   * loses its copy and nothing is duplicated for a mix that can run to tens of
   * megabytes.
   */
  readonly audio?: {
    readonly channels: readonly Float32Array[];
    readonly sampleRate: number;
    readonly durationMs: number;
  };
};

export type ExportStage = 'preparing' | 'encoding' | 'finalising';

export type WorkerMessage =
  | { readonly type: 'stage'; readonly stage: ExportStage; readonly totalFrames?: number }
  | { readonly type: 'progress'; readonly frame: number; readonly totalFrames: number }
  | { readonly type: 'done'; readonly buffer: ArrayBuffer; readonly byteLength: number }
  | { readonly type: 'cancelled' }
  | { readonly type: 'error'; readonly message: string; readonly stack?: string };
