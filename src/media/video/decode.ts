import type { MediaEntry } from '../store';
import { VideoClip } from './clip';

/**
 * Custom media decode (§9).
 *
 * "Custom media (Pro) accepts short MP4/WebM clips; decode via `VideoDecoder`
 * and present the frame nearest the requested timestamp."
 *
 * The container is opened and the first frames are decoded here, so a file the
 * browser cannot handle fails at upload — where there is a person to tell —
 * rather than silently drawing a placeholder for the rest of the session.
 */

export const ACCEPTED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'] as const;

export class UnsupportedVideoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedVideoError';
  }
}

/**
 * §9 calls these "short clips" and means it.
 *
 * The ring buffer holds a fraction of a second, so length costs nothing to
 * draw — but the whole blob is held in memory for the session and copied to
 * the export worker, and §14 budgets 900MB of heap for everything.
 */
export const MAX_VIDEO_BYTES = 80 * 1024 * 1024;
export const MAX_VIDEO_MS = 60_000;

export function isVideoFile(file: { type: string; name: string }): boolean {
  return file.type.startsWith('video/') || /\.(mp4|webm|mov|m4v)$/i.test(file.name);
}

export async function decodeVideo(
  blob: Blob,
  options: { id: string; name: string },
): Promise<MediaEntry> {
  if (blob.size > MAX_VIDEO_BYTES) {
    throw new UnsupportedVideoError(
      `"${options.name}" is ${(blob.size / 1024 / 1024).toFixed(0)}MB. ` +
      `Custom media is capped at ${MAX_VIDEO_BYTES / 1024 / 1024}MB — trim the clip first.`,
    );
  }

  let clip: VideoClip;
  try {
    clip = await VideoClip.open(blob);
  } catch (error) {
    throw new UnsupportedVideoError(
      error instanceof Error
        ? `Could not read "${options.name}". ${error.message}`
        : `Could not read "${options.name}".`,
    );
  }

  if (clip.durationMs > MAX_VIDEO_MS) {
    clip.close();
    throw new UnsupportedVideoError(
      `"${options.name}" runs ${(clip.durationMs / 1000).toFixed(0)}s. ` +
      `Custom media is capped at ${MAX_VIDEO_MS / 1000}s.`,
    );
  }

  /*
   * Decode the opening frames now. An unplayable file that opened cleanly —
   * a supported container around a codec this browser lacks — would otherwise
   * only reveal itself as an overlay that never draws.
   */
  try {
    await clip.prefetch(0);
    if (!clip.frameAt(0)) {
      throw new Error('the first frame did not decode');
    }
  } catch (error) {
    clip.close();
    throw new UnsupportedVideoError(
      `"${options.name}" opened but would not decode. ` +
      (error instanceof Error ? error.message : 'The codec may not be supported here.'),
    );
  }

  return {
    id: options.id,
    kind: 'video',
    name: options.name,
    blob,
    bitmap: null,
    clip,
    width: clip.width,
    height: clip.height,
    durationMs: clip.durationMs,
  };
}
