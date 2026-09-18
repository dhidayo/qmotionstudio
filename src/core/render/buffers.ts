import type { Ctx2D, Size } from '@/core/types';

export type Buffer = { readonly canvas: OffscreenCanvas; readonly ctx: Ctx2D };

/**
 * §6.4 requires scene buffers to be reused, never allocated per frame.
 *
 * Two are needed to composite a transition (outgoing + incoming); a third is
 * kept for transitions that need scratch space — zoomBlur samples its own
 * output, so it cannot read and write the same surface (spec review, 1.15).
 */
const POOL_SIZE = 3;

export class BufferPool {
  readonly #buffers: Buffer[] = [];
  #size: Size = { w: 0, h: 0 };

  /** Resizes only when the artboard actually changes; a no-op on every other frame. */
  resize(size: Size): void {
    const w = Math.max(1, Math.round(size.w));
    const h = Math.max(1, Math.round(size.h));
    if (this.#size.w === w && this.#size.h === h && this.#buffers.length === POOL_SIZE) return;

    this.#size = { w, h };
    this.#buffers.length = 0;
    for (let i = 0; i < POOL_SIZE; i++) {
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext('2d', { alpha: true });
      if (!ctx) throw new Error('BufferPool: could not acquire a 2D context for a scene buffer.');
      this.#buffers.push({ canvas, ctx });
    }
  }

  get(index: number): Buffer {
    const buffer = this.#buffers[index];
    if (!buffer) throw new Error(`BufferPool: buffer ${index} requested before resize().`);
    return buffer;
  }

  get size(): Size {
    return this.#size;
  }

  clear(index: number): Buffer {
    const buffer = this.get(index);
    buffer.ctx.setTransform(1, 0, 0, 1, 0, 0);
    buffer.ctx.clearRect(0, 0, this.#size.w, this.#size.h);
    return buffer;
  }

  dispose(): void {
    // OffscreenCanvas has no explicit free; dropping the references is the signal.
    this.#buffers.length = 0;
    this.#size = { w: 0, h: 0 };
  }
}
