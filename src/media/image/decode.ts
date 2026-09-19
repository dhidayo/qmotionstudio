import { decodeHeic, HeicDecodeError } from './heic';
import type { MediaEntry } from '../store';

/**
 * Image decode (§9).
 *
 * Accepts JPEG, PNG, WebP and AVIF, plus HEIC via D-011's two-stage decode —
 * the browser first, then WASM only if it refuses.
 */

export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] as const;

export class UnsupportedImageError extends Error {
  readonly kind: 'heic' | 'unknown';
  constructor(message: string, kind: 'heic' | 'unknown', options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'UnsupportedImageError';
    this.kind = kind;
  }
}

/**
 * HEIC/HEIF sniffing by container brand.
 *
 * The MIME type cannot be trusted: browsers frequently report an empty type or
 * `image/jpeg` for a `.heic` picked from a file input, and an iPhone photo is
 * HEIC by default — so this is the common case, not an edge case.
 *
 * Layout: bytes 4–8 are 'ftyp', then a 4-byte brand.
 */
export function sniffHeic(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  const tag = String.fromCharCode(...bytes.subarray(4, 8));
  if (tag !== 'ftyp') return false;
  const brand = String.fromCharCode(...bytes.subarray(8, 12));
  return ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1'].includes(brand);
}

/**
 * §9: downscale so the longest edge is at most this multiple of the artboard's
 * longest edge. Full-resolution phone photos otherwise exhaust memory on mobile.
 */
export const MAX_EDGE_MULTIPLE = 2;

export function targetSize(
  srcW: number,
  srcH: number,
  artboardLongestEdge: number,
): { w: number; h: number } {
  const limit = artboardLongestEdge * MAX_EDGE_MULTIPLE;
  const longest = Math.max(srcW, srcH);
  if (longest <= limit) return { w: srcW, h: srcH };
  const scale = limit / longest;
  return { w: Math.max(1, Math.round(srcW * scale)), h: Math.max(1, Math.round(srcH * scale)) };
}

export async function decodeImage(
  blob: Blob,
  options: { id: string; name: string; artboardLongestEdge: number },
): Promise<MediaEntry> {
  const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  const isHeic = sniffHeic(head);

  // Decode once at full size to learn the dimensions, then again at the target
  // size. createImageBitmap's resize is done by the browser's image pipeline,
  // which is both faster and better quality than drawing through a canvas.
  let source = blob;
  let probe: ImageBitmap;
  try {
    probe = await createImageBitmap(source);
  } catch (nativeFailure) {
    if (!isHeic) {
      throw new UnsupportedImageError(
        `Could not decode "${options.name}". It may be corrupt or in an unsupported format.`,
        'unknown',
        // §16: never swallow a decode error — the original reason is what
        // makes a bug report actionable.
        { cause: nativeFailure },
      );
    }

    // D-011: the browser cannot read this HEIC, so fall back to WASM. The
    // module is ~2MB and loads only here, which is why the native attempt
    // comes first — Safari and Chrome-on-macOS never reach this line.
    try {
      source = await decodeHeic(blob);
      probe = await createImageBitmap(source);
    } catch (wasmFailure) {
      throw new UnsupportedImageError(
        wasmFailure instanceof HeicDecodeError
          ? wasmFailure.message
          : `Could not decode "${options.name}".`,
        'heic',
        { cause: wasmFailure },
      );
    }
  }

  const target = targetSize(probe.width, probe.height, options.artboardLongestEdge);

  if (target.w === probe.width && target.h === probe.height) {
    return {
      id: options.id,
      kind: 'image',
      name: options.name,
      // The decoded source, not the original: a HEIC blob is useless to
      // everything downstream, including the export worker's re-decode (§9).
      blob: source,
      bitmap: probe,
      width: probe.width,
      height: probe.height,
    };
  }

  const bitmap = await createImageBitmap(source, {
    resizeWidth: target.w,
    resizeHeight: target.h,
    resizeQuality: 'high',
  });
  probe.close();

  return {
    id: options.id,
    kind: 'image',
    name: options.name,
    blob: source,
    bitmap,
    width: target.w,
    height: target.h,
  };
}
