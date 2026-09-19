import type { ExportStage } from './protocol';

/**
 * Shared export types.
 *
 * Extracted so the MediaRecorder fallback can implement the same contract
 * without importing the orchestrator, which would be circular.
 */

export type ExportPath = 'offline' | 'realtime';

export type ExportProgress = {
  readonly stage: ExportStage;
  readonly frame: number;
  readonly totalFrames: number;
  /** 'offline' is the real path; 'realtime' means the fallback ran. */
  readonly path: ExportPath;
};

export type ExportResult = {
  readonly blob: Blob;
  readonly fileName: string;
  readonly path: ExportPath;
  readonly durationMs: number;
};

export type ExportHandle = {
  readonly result: Promise<ExportResult>;
  cancel(): void;
};

export class ExportCancelled extends Error {
  constructor() {
    super('Export cancelled.');
    this.name = 'ExportCancelled';
  }
}
