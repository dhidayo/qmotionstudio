import type { Overlay } from '@/document/types';

/**
 * Time ↔ pixels, kept out of the components.
 *
 * The timeline is the one place in the editor where a pixel and a millisecond
 * have to agree, and getting that arithmetic wrong is invisible until a clip
 * lands two frames from where it was dropped. It is pure, so it is testable
 * without a DOM.
 */

export function msToPct(ms: number, durationMs: number): number {
  if (durationMs <= 0) return 0;
  return Math.max(0, Math.min(1, ms / durationMs)) * 100;
}

export function pxToMs(px: number, widthPx: number, durationMs: number): number {
  if (widthPx <= 0) return 0;
  return (px / widthPx) * durationMs;
}

/** Snaps to a grid unless the pointer is asking not to (⌥/alt held). */
export function snap(ms: number, gridMs: number, disabled: boolean): number {
  if (disabled || gridMs <= 0) return Math.round(ms);
  return Math.round(ms / gridMs) * gridMs;
}

export type ClipDrag = {
  readonly mode: 'move' | 'trimStart' | 'trimEnd';
  readonly id: string;
  /** Overlay times at the moment the drag began. */
  readonly startMs: number;
  readonly endMs: number;
  readonly pointerMs: number;
};

/** The times a drag implies, clamped so a clip can never invert or leave the timeline. */
export function dragResult(
  drag: ClipDrag,
  pointerMs: number,
  options: { durationMs: number; minLengthMs: number },
): { startMs: number; endMs: number } {
  const delta = pointerMs - drag.pointerMs;
  const length = drag.endMs - drag.startMs;
  const { durationMs, minLengthMs } = options;

  switch (drag.mode) {
    case 'move': {
      // A moved clip keeps its length: it slides, and stops at both ends
      // rather than being squashed against them.
      const start = Math.max(0, Math.min(drag.startMs + delta, Math.max(0, durationMs - length)));
      return { startMs: start, endMs: start + length };
    }
    case 'trimStart': {
      const start = Math.max(0, Math.min(drag.startMs + delta, drag.endMs - minLengthMs));
      return { startMs: start, endMs: drag.endMs };
    }
    case 'trimEnd': {
      const end = Math.max(drag.startMs + minLengthMs, Math.min(drag.endMs + delta, durationMs));
      return { startMs: drag.startMs, endMs: end };
    }
  }
}

/** Ruler ticks: about one per 60px, on a round interval a human would choose. */
export function tickIntervalMs(durationMs: number, widthPx: number): number {
  const wanted = durationMs / Math.max(1, widthPx / 60);
  const candidates = [250, 500, 1_000, 2_000, 5_000, 10_000, 15_000, 30_000, 60_000];
  return candidates.find((c) => c >= wanted) ?? 60_000;
}

export function formatSeconds(ms: number): string {
  const total = Math.max(0, ms) / 1000;
  return total >= 10 ? `${total.toFixed(0)}s` : `${total.toFixed(1)}s`;
}

/**
 * Packs overlays into rows.
 *
 * The document says which track an overlay is on (§5); this only decides how
 * many rows to draw, and always leaves one empty so there is somewhere to drop
 * the next one.
 */
export function rowCount(overlays: readonly Overlay[]): number {
  const used = overlays.reduce((max, o) => Math.max(max, o.track + 1), 0);
  return Math.min(used + 1, 8);
}
