import type { Aspect, Size } from '@/core/types';
import { renderSizeFor } from '@/core/math/aspect';

/**
 * What an image can be saved as (D-155).
 *
 * "Allow the Design to be exportable as high definition images, which can
 * serve as … picture posting, thumbnail pictures for youtube videos or
 * blogposts." So the sizes are offered as what they are for, in the frame
 * shape the image already has — a 16:9 image is offered as a YouTube
 * thumbnail and a blog header, a 4:5 one as an Instagram post — rather than
 * as a list of resolutions to translate. Every size comes from the same
 * short-edge rule as the video (`renderSizeFor`), so 1080 means 1080×1350 at
 * 4:5 and 1920×1080 at 16:9.
 *
 * The largest, 3840×2160 or 2160×3840, is 8.3 million pixels: well inside
 * the 16.7-million-pixel canvas iOS allows, so a phone can draw every size.
 */

export type ImageFormat = 'png' | 'jpeg';

export type ImagePreset = {
  /** Unique within its shape. */
  readonly id: string;
  /** The short edge in pixels; the long edge follows from the shape. */
  readonly shortEdge: number;
  /** What this size is for, said under it. */
  readonly use: string;
  /** A size that only works in one format says so: YouTube takes a JPG under 2 MB. */
  readonly format?: ImageFormat;
  /** The largest file the destination accepts, in bytes. */
  readonly maxBytes?: number;
  /** Said in place of the format choice when `format` decides it. */
  readonly why?: string;
};

/** YouTube's limit for a custom thumbnail. */
export const YOUTUBE_THUMBNAIL_BYTES = 2_000_000;

const HIGH_RESOLUTION = 'High resolution · print, large screens';

export const IMAGE_PRESETS: Readonly<Record<Aspect, readonly ImagePreset[]>> = {
  '16:9': [
    {
      id: 'youtube',
      shortEdge: 720,
      use: 'YouTube thumbnail',
      format: 'jpeg',
      maxBytes: YOUTUBE_THUMBNAIL_BYTES,
      why: 'JPG under 2 MB, as YouTube asks for a thumbnail.',
    },
    { id: 'full-hd', shortEdge: 1080, use: 'Full HD · blog header, slides' },
    { id: '4k', shortEdge: 2160, use: '4K · large screens, print' },
  ],
  '4:5': [
    { id: 'instagram', shortEdge: 1080, use: 'Instagram post' },
    { id: 'large', shortEdge: 2160, use: HIGH_RESOLUTION },
  ],
  '1:1': [
    { id: 'square', shortEdge: 1080, use: 'Square post · Instagram, LinkedIn, Facebook' },
    { id: 'large', shortEdge: 2160, use: HIGH_RESOLUTION },
  ],
  '9:16': [
    { id: 'story', shortEdge: 1080, use: 'Story · Reel or TikTok cover' },
    { id: 'large', shortEdge: 2160, use: HIGH_RESOLUTION },
  ],
  '4:3': [
    { id: 'classic', shortEdge: 1080, use: 'Slides · blog image' },
    { id: 'large', shortEdge: 2160, use: HIGH_RESOLUTION },
  ],
};

/** The size a preset gives in this shape. */
export function imageSize(aspect: Aspect, preset: ImagePreset): Size {
  return renderSizeFor(aspect, preset.shortEdge);
}

/** The preset offered first: the first one this plan can save. */
export function defaultImagePreset(aspect: Aspect, maxShortEdge: number): ImagePreset {
  const presets = IMAGE_PRESETS[aspect];
  const first = presets[0];
  if (!first) throw new Error(`No image sizes for ${aspect}.`);
  return presets.find((preset) => preset.shortEdge <= maxShortEdge) ?? first;
}

/** `my-post-1080x1350.png` — the size in the name, so two sizes never overwrite each other. */
export function imageFileName(projectName: string, size: Size, format: ImageFormat): string {
  const stem = projectName
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase();
  const safe = stem.length > 0 ? stem : 'motion-studio';
  return `${safe}-${size.w}x${size.h}.${format === 'png' ? 'png' : 'jpg'}`;
}
