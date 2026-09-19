import type { ImageProps, Rect, Size } from '@/core/types';
import type { PhotoFrame, PhotoInput } from '@/document/types';

/**
 * Shared interpretation of §8.1's per-photo controls.
 *
 * Every template routes its photos through here, so "Larger 150%" means the
 * same thing in all of them. A template that invents its own reading of these
 * controls is a bug report waiting to happen.
 */

const FRAME_RATIO: Record<PhotoFrame, number> = {
  '1:1': 1,
  '4:3': 4 / 3,
  '3:4': 3 / 4,
  '16:9': 16 / 9,
  '9:16': 9 / 16,
};

/**
 * The photo's box for a given frame ratio.
 *
 * Area is held constant across ratios rather than width or height, so switching
 * a photo from 1:1 to 16:9 changes its shape without changing how much of the
 * composition it takes up. Holding width instead makes 9:16 photos dominate and
 * 16:9 photos vanish.
 */
export function frameBox(frame: PhotoFrame, baseSize: number): Size {
  const ratio = FRAME_RATIO[frame];
  const root = Math.sqrt(ratio);
  return { w: baseSize * root, h: baseSize / root };
}

/** 'overflow' grows the box itself; the other modes leave it alone. */
export function boxScale(photo: PhotoInput): number {
  return photo.sizeMode === 'overflow' ? clampPct(photo.sizePct) : 1;
}

/** 'larger' zooms the image *within* its box; the other modes leave it alone. */
export function contentZoom(photo: PhotoInput): number {
  return photo.sizeMode === 'larger' ? clampPct(photo.sizePct) : 1;
}

function clampPct(sizePct: number): number {
  return Math.max(1, Math.min(sizePct, 400)) / 100;
}

/**
 * Zoom is expressed as a centred crop rather than by growing the box, so the
 * layout is unaffected: a photo zoomed to 200% still occupies exactly the same
 * rectangle, it just shows half as much of itself.
 */
function zoomCrop(zoom: number): Rect | undefined {
  if (zoom <= 1.001) return undefined;
  const span = 1 / zoom;
  const offset = (1 - span) / 2;
  return { x: offset, y: offset, w: span, h: span };
}

/** Intersects the user's crop (§8.1's "Original photo" mode) with the zoom crop. */
function combineCrop(photo: PhotoInput, zoom: number): Rect | undefined {
  const zoomed = zoomCrop(zoom);
  const manual = photo.cropMode === 'original' ? photo.cropRect : undefined;

  if (!zoomed) return manual;
  if (!manual) return zoomed;

  return {
    x: manual.x + zoomed.x * manual.w,
    y: manual.y + zoomed.y * manual.h,
    w: manual.w * zoomed.w,
    h: manual.h * zoomed.h,
  };
}

export type PhotoLayerOptions = {
  readonly cornerRadius?: number;
  readonly shadow?: ImageProps['shadow'];
  readonly border?: ImageProps['border'];
  readonly reflection?: ImageProps['reflection'];
};

/** Builds ImageProps for one photo at the template's nominal size. */
export function photoProps(
  photo: PhotoInput,
  baseSize: number,
  options: PhotoLayerOptions = {},
): ImageProps {
  const box = frameBox(photo.frame, baseSize);
  const scale = boxScale(photo);
  const w = box.w * scale;
  const h = box.h * scale;

  const crop = combineCrop(photo, contentZoom(photo));

  return {
    mediaId: photo.mediaId,
    w,
    h,
    // Cover throughout: 'contain' would letterbox inside the frame, which is
    // never what a photo template wants. 'Fill frame' differs from 'Template'
    // by ignoring any inset the template applies, not by changing the fit.
    fit: 'cover',
    ...(crop ? { crop } : {}),
    ...(options.cornerRadius === undefined ? {} : { cornerRadius: options.cornerRadius }),
    ...(options.shadow ? { shadow: options.shadow } : {}),
    ...(options.border ? { border: options.border } : {}),
    ...(options.reflection ? { reflection: options.reflection } : {}),
  };
}

/**
 * §8.1: "increasing beyond the supplied photos reuses earlier ones".
 *
 * Templates declare a slot count and must always receive exactly that many
 * entries, so an empty project still composes rather than collapsing.
 */
export function fillSlots(photos: readonly PhotoInput[], count: number): PhotoInput[] {
  if (count <= 0) return [];
  if (photos.length === 0) {
    return Array.from({ length: count }, (_, i) => ({
      mediaId: `__empty_${i}__`,
      frame: '3:4' as const,
      sizeMode: 'template' as const,
      sizePct: 100,
      cropMode: 'template' as const,
    }));
  }
  return Array.from({ length: count }, (_, i) => {
    const source = photos[i % photos.length];
    if (!source) throw new Error('fillSlots: photo list changed length mid-iteration');
    return source;
  });
}
