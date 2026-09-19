/**
 * HEIC decoding (D-011).
 *
 * §9 originally said to detect HEIC and fail with a clear message. iPhone
 * photos are HEIC by default, so that failure is the common case rather than an
 * edge case, and D-011 upgraded it to a real decode.
 *
 * Two-stage on purpose:
 *
 *   1. Ask the browser. Safari always decodes HEIC, and Chrome does on macOS
 *      and Android — roughly a third of sessions — because it delegates to the
 *      system codec. That path is free and fast.
 *   2. Only if the browser refuses, load libheif compiled to WASM.
 *
 * The WASM bundle is about 2MB with its binary inlined, which is why it is
 * behind a dynamic import and behind the native attempt. It never touches the
 * cold-load path (§14) and never loads at all for a user who does not drop a
 * HEIC on a browser that cannot read one.
 */

/** The slice of libheif's API this uses. The package ships emscripten's
 *  low-level bindings rather than types for the friendly wrapper. */
type HeifImage = {
  get_width(): number;
  get_height(): number;
  display(target: ImageData, done: (result: ImageData | null) => void): void;
};

type HeifDecoder = { decode(buffer: Uint8Array): HeifImage[] };

type LibHeif = { HeifDecoder: new () => HeifDecoder };

type LibHeifFactory = (options?: Record<string, unknown>) => LibHeif | Promise<LibHeif>;

let libheifPromise: Promise<LibHeif> | null = null;

/** Loaded once per session and reused; the module is large and stateless. */
async function loadLibheif(): Promise<LibHeif> {
  libheifPromise ??= (async () => {
    const module: unknown = await import('libheif-js/libheif-wasm/libheif-bundle.mjs');
    const factory = (module as { default: LibHeifFactory }).default;
    return await factory();
  })();
  return libheifPromise;
}

export class HeicDecodeError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'HeicDecodeError';
  }
}

/**
 * Decodes a HEIC blob to something the rest of the pipeline can handle.
 *
 * Returns a PNG rather than a JPEG: this is an intermediate that immediately
 * goes through createImageBitmap and then gets downscaled (§9), so a lossy
 * round trip here would cost quality for no saving that survives the next step.
 */
export async function decodeHeic(blob: Blob): Promise<Blob> {
  const libheif = await loadLibheif();

  const bytes = new Uint8Array(await blob.arrayBuffer());
  const decoder = new libheif.HeifDecoder();

  let images: HeifImage[];
  try {
    images = decoder.decode(bytes);
  } catch (cause) {
    throw new HeicDecodeError('This HEIC image could not be read.', { cause });
  }

  // A HEIC container can hold several images — a burst, or a live photo's
  // stills. The first is the primary one.
  const image = images[0];
  if (!image) throw new HeicDecodeError('This HEIC file contains no images.');

  const width = image.get_width();
  const height = image.get_height();
  if (width <= 0 || height <= 0) {
    throw new HeicDecodeError('This HEIC image reports an invalid size.');
  }

  const target = new ImageData(width, height);
  await new Promise<void>((resolve, reject) => {
    image.display(target, (result) => {
      if (result === null) reject(new HeicDecodeError('HEIC processing failed partway through.'));
      else resolve();
    });
  });

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new HeicDecodeError('Could not acquire a canvas to convert the HEIC image.');
  ctx.putImageData(target, 0, 0);

  return canvas.convertToBlob({ type: 'image/png' });
}
