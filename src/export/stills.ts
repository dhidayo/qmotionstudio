import type { Project } from '@/document/types';
import type { Size } from '@/core/types';
import { videoDemands } from '@/document/select/media';
import { createRenderRig, disposeRenderRig, type RenderRig } from '@/core/render/rig';
import { renderFrame } from '@/core/render/renderFrame';
import { loadTemplate } from '@/templates/registry';
import type { MediaStore } from '@/media/store';
import type { ImageFormat } from './imagePresets';

/**
 * An image as a picture (D-155): a post, a YouTube thumbnail, a blog header.
 *
 * One frame, from the same renderer as the preview and the video, so the
 * picture is exactly what was on screen — the frame `pictureMomentMs` names,
 * drawn at the size asked for. Watermarked on the free plan, like a video.
 *
 * Replaces D-135's carousel of a video's scenes: "On Video, only video can be
 * exported", so pictures are Image's alone, and an image is one scene.
 */

/** Tried in turn when a destination limits the file's size; the first that fits is kept. */
export const JPEG_QUALITIES = [0.92, 0.85, 0.78, 0.7] as const;

/**
 * Draws the frame at `atMs` onto `ctx`, once everything it needs is in: the
 * designs (a design still loading draws a blank) and any video layer's frame
 * at that moment, decoded first as the video export does (D-051).
 */
export async function drawStill(
  ctx: CanvasRenderingContext2D,
  project: Project,
  media: MediaStore,
  atMs: number,
  rig: RenderRig,
): Promise<void> {
  await Promise.all([...new Set(project.scenes.map((scene) => scene.templateId))]
    .filter((id) => !id.startsWith('__'))
    .map((id) => loadTemplate(id)));
  for (const demand of videoDemands(project, atMs)) await media.prefetchVideo(demand.mediaId, demand.timeMs);
  renderFrame(ctx, project, atMs, rig);
}

/**
 * Encodes at the first quality that comes in under `maxBytes` — YouTube takes
 * a thumbnail up to 2 MB — or the smallest tried, saying it did not fit.
 * Without a limit, or for a PNG (which has no quality), the first is kept.
 */
export async function encodeWithin(
  encode: (quality: number) => Promise<Blob>,
  format: ImageFormat,
  maxBytes: number | undefined,
): Promise<{ readonly blob: Blob; readonly fits: boolean }> {
  const qualities = format === 'jpeg' && maxBytes !== undefined ? JPEG_QUALITIES : JPEG_QUALITIES.slice(0, 1);
  let blob: Blob | null = null;
  for (const quality of qualities) {
    blob = await encode(quality);
    if (maxBytes === undefined || blob.size <= maxBytes) return { blob, fits: true };
  }
  if (!blob) throw new Error('Images: nothing was encoded.');
  return { blob, fits: false };
}

export async function renderStill(options: {
  readonly project: Project;
  readonly media: MediaStore;
  readonly size: Size;
  /** On the project clock. */
  readonly atMs: number;
  readonly watermark: boolean;
  readonly format: ImageFormat;
  readonly maxBytes?: number | undefined;
}): Promise<{ readonly blob: Blob; readonly fits: boolean }> {
  const { project, media, size, atMs, watermark, format, maxBytes } = options;
  const canvas = document.createElement('canvas');
  canvas.width = size.w;
  canvas.height = size.h;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Images: could not acquire a 2D context.');
  const rig = createRenderRig(media, () => watermark);
  try {
    await drawStill(ctx, project, media, atMs, rig);
    const type = format === 'png' ? 'image/png' : 'image/jpeg';
    return await encodeWithin(
      (quality) => new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((made) => { if (made) resolve(made); else reject(new Error(`Images: the ${size.w}×${size.h} picture could not be encoded.`)); }, type, quality);
      }),
      format,
      maxBytes,
    );
  } finally {
    disposeRenderRig(rig);
    // Let go of the pixels at once: a 4K canvas holds 33 MB, which a phone notices.
    canvas.width = 0;
    canvas.height = 0;
  }
}
