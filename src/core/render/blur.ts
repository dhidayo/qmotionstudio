import type { Ctx2D } from '@/core/types';

/**
 * Layer blur (§6.1's `blur` animated prop).
 *
 * Deliberately not `ctx.filter = 'blur(Npx)'`. That property is not Baseline —
 * Safari is the gap — and where it does exist it is slow enough that a blurred
 * layer on an eight-photo template will miss the 30fps budget on its own.
 *
 * Instead the layer is drawn offscreen and put through a mip chain: halved
 * repeatedly down to the target scale, then doubled repeatedly back up. Each
 * step is a bilinear resample, so a chain of them approximates a Gaussian
 * closely. Going down and back up in one jump instead is much cheaper to write
 * and visibly wrong — a single large upscale leaves stepped, faceted edges on
 * exactly the soft gradients blur is usually used for.
 */

/** Below this the blur is invisible and the round trip is pure waste. */
const MIN_VISIBLE_RADIUS = 0.75;

/** Past this the source has too little information left, whatever the resample. */
const MAX_DOWNSCALE = 24;

/** Guards against a pathological layer size allocating gigabytes. */
const MAX_SCRATCH_PIXELS = 32_000_000;

type Surface = { canvas: OffscreenCanvas; ctx: Ctx2D };

/**
 * Three surfaces per nesting depth: one to draw into, two to ping-pong the
 * resample chain between. Module-level, and safe to be — a blur runs entirely
 * within one synchronous drawLayer call, and preview and export are separate
 * realms with separate module instances.
 */
const pool: Surface[] = [];

function surfaceAt(slot: number, w: number, h: number): Surface {
  let entry = pool[slot];
  if (!entry) {
    const canvas = new OffscreenCanvas(Math.max(1, Math.ceil(w)), Math.max(1, Math.ceil(h)));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('blur: could not acquire a 2D context for a scratch surface.');
    entry = { canvas, ctx };
    pool[slot] = entry;
  }

  // Grow-only: resizing a canvas clears it, so churning the size every frame
  // would reallocate and refill. Layers rarely shrink for long.
  if (entry.canvas.width < w || entry.canvas.height < h) {
    entry.canvas.width = Math.max(entry.canvas.width, Math.ceil(w));
    entry.canvas.height = Math.max(entry.canvas.height, Math.ceil(h));
  }
  return entry;
}

export function releaseBlurScratch(): void {
  pool.length = 0;
}

function prepare(surface: Surface, w: number, h: number): void {
  surface.ctx.setTransform(1, 0, 0, 1, 0, 0);
  surface.ctx.clearRect(0, 0, w, h);
  surface.ctx.imageSmoothingEnabled = true;
  surface.ctx.imageSmoothingQuality = 'high';
}

/**
 * Runs `draw` through a blur of `radius` design units.
 *
 * `bounds` is the layer's box in the current transform. The scratch is padded
 * by the radius so the blur does not clip against its own edge.
 */
export function withBlur(
  ctx: Ctx2D,
  radius: number,
  bounds: { x: number; y: number; w: number; h: number },
  depth: number,
  draw: (target: Ctx2D) => void,
): void {
  if (radius < MIN_VISIBLE_RADIUS || bounds.w <= 0 || bounds.h <= 0) {
    draw(ctx);
    return;
  }

  // The current transform says how many device pixels a design unit is worth,
  // so the scratch is allocated at the resolution it will be shown at.
  const transform = ctx.getTransform();
  const scale = Math.max(0.05, Math.hypot(transform.a, transform.b));

  const pad = Math.ceil(radius * 2);
  const boxW = bounds.w + pad * 2;
  const boxH = bounds.h + pad * 2;
  const pixelW = Math.ceil(boxW * scale);
  const pixelH = Math.ceil(boxH * scale);

  if (pixelW < 4 || pixelH < 4 || pixelW * pixelH > MAX_SCRATCH_PIXELS) {
    draw(ctx);
    return;
  }

  const base = depth * 3;
  const full = surfaceAt(base, pixelW, pixelH);
  prepare(full, pixelW, pixelH);

  // Draw the layer into the scratch in its own coordinates, offset so the
  // padded box starts at the surface origin.
  full.ctx.setTransform(scale, 0, 0, scale, -(bounds.x - pad) * scale, -(bounds.y - pad) * scale);
  draw(full.ctx);

  const downscale = Math.min(MAX_DOWNSCALE, Math.max(2, radius * scale * 0.5));

  // How many halvings get us to the target scale. Each one is a clean 2:1
  // bilinear reduction, which is what keeps the result smooth.
  const steps = Math.max(1, Math.round(Math.log2(downscale)));

  const ping = surfaceAt(base + 1, pixelW, pixelH);
  const pong = surfaceAt(base + 2, pixelW, pixelH);

  let source = full;
  let target = ping;
  let other = pong;
  let curW = pixelW;
  let curH = pixelH;

  for (let i = 0; i < steps; i++) {
    const nextW = Math.max(1, Math.floor(curW / 2));
    const nextH = Math.max(1, Math.floor(curH / 2));
    if (nextW < 2 || nextH < 2) break;

    prepare(target, nextW, nextH);
    target.ctx.drawImage(source.canvas, 0, 0, curW, curH, 0, 0, nextW, nextH);

    curW = nextW;
    curH = nextH;
    if (source === full) {
      source = target;
      target = other;
      other = full;
    } else {
      const previous = source;
      source = target;
      target = previous;
    }
  }

  // Back up the chain by doubling. Going straight to full size in one draw is
  // what produces the stepped edges this chain exists to avoid.
  while (curW * 2 <= pixelW && curH * 2 <= pixelH) {
    const nextW = Math.min(pixelW, curW * 2);
    const nextH = Math.min(pixelH, curH * 2);

    prepare(target, nextW, nextH);
    target.ctx.drawImage(source.canvas, 0, 0, curW, curH, 0, 0, nextW, nextH);

    curW = nextW;
    curH = nextH;
    const previous = source;
    source = target;
    target = previous;
  }

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    source.canvas,
    0, 0, curW, curH,
    bounds.x - pad, bounds.y - pad, boxW, boxH,
  );
  ctx.restore();
}
