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
  /** mediaId → source blob. */
  readonly media: readonly (readonly [string, Blob])[];
};

export type ExportStage = 'preparing' | 'encoding' | 'finalising';

export type WorkerMessage =
  | { readonly type: 'stage'; readonly stage: ExportStage; readonly totalFrames?: number }
  | { readonly type: 'progress'; readonly frame: number; readonly totalFrames: number }
  | { readonly type: 'done'; readonly buffer: ArrayBuffer; readonly byteLength: number }
  | { readonly type: 'cancelled' }
  | { readonly type: 'error'; readonly message: string; readonly stack?: string };
