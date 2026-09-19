import type { Aspect, Size } from '@/core/types';
import { renderSizeFor } from '@/core/math/aspect';

/**
 * Export presets and codec selection (§11).
 *
 * D-003: codec *strings* are never hardcoded here. §11.2 named
 * `vp09.00.10.08`, which is VP9 level 1.0 — 256×144@30 — and would be wrong for
 * every preset below. Mediabunny derives the full string from the codec family
 * plus the resolution and frame rate, which is both correct and one less table
 * to keep in step with reality.
 */

export type ExportFormat = 'mp4' | 'webm';
export type QualityTier = 'low' | 'medium' | 'high';

export type ExportSettings = {
  readonly format: ExportFormat;
  /** Short edge, matching the quality-tier convention in D-016. */
  readonly shortEdge: 720 | 1080;
  readonly fps: 30 | 60;
  readonly quality: QualityTier;
};

export const DEFAULT_EXPORT: ExportSettings = {
  format: 'mp4',
  shortEdge: 1080,
  fps: 30,
  quality: 'high',
};

/** Mediabunny's codec family names, not WebCodecs strings. */
/**
 * §11.2: MP4 → AAC, WebM → Opus.
 *
 * Opus encodes natively through WebCodecs everywhere WebCodecs exists. AAC
 * does not, which is what D-010's `@mediabunny/aac-encoder` polyfill is for —
 * registered only when the browser cannot do it itself.
 */
export const AUDIO_CODEC: Record<ExportFormat, 'aac' | 'opus'> = {
  mp4: 'aac',
  webm: 'opus',
};

/** Stereo music at this rate is transparent enough for social video. */
export const AUDIO_BITRATE = 128_000;

export const VIDEO_CODEC: Record<ExportFormat, 'avc' | 'vp9'> = {
  mp4: 'avc',
  webm: 'vp9',
};

export const CONTAINER_MIME: Record<ExportFormat, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
};

export const FILE_EXTENSION: Record<ExportFormat, string> = {
  mp4: 'mp4',
  webm: 'webm',
};

/**
 * Bitrate targets, in bits per second.
 *
 * Scaled by pixel count and frame rate rather than picked per preset, so a 4:5
 * export at 1080 does not get a 16:9 export's budget spread over two-thirds
 * the pixels.
 */
const BITS_PER_PIXEL_PER_FRAME: Record<QualityTier, number> = {
  low: 0.06,
  medium: 0.11,
  high: 0.18,
};

export function bitrateFor(size: Size, fps: number, quality: QualityTier): number {
  const perFrame = size.w * size.h * BITS_PER_PIXEL_PER_FRAME[quality];
  // VP9 reaches comparable quality at a lower bitrate than H.264.
  return Math.round(perFrame * fps);
}

export function exportSize(aspect: Aspect, settings: ExportSettings): Size {
  return renderSizeFor(aspect, settings.shortEdge);
}

export function frameCount(durationMs: number, fps: number): number {
  // Round rather than floor: a 10.0s clip at 30fps is 300 frames, and flooring
  // a value that lands on 299.9999 through float arithmetic would drop one.
  return Math.max(1, Math.round((durationMs / 1000) * fps));
}

export function fileNameFor(projectName: string, settings: ExportSettings): string {
  const stem = projectName
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase();
  const safe = stem.length > 0 ? stem : 'motion-studio';
  return `${safe}-${settings.shortEdge}p.${FILE_EXTENSION[settings.format]}`;
}

/** What the UI needs to explain a format that is not available (§11.9). */
export type FormatAvailability = {
  readonly format: ExportFormat;
  readonly available: boolean;
  /** Present when unavailable — shown to the user verbatim. */
  readonly reason?: string;
};
