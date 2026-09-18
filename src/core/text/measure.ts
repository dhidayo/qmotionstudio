import { layoutText, textCacheKey, type GlyphRun, type TextMeasureContext, type TextSpec } from './layout';

/**
 * The text measurement cache (§6.3).
 *
 * Owned by the RenderRig rather than held at module scope, for the same reason
 * the scene buffers are (D-001): preview and export run concurrently and must
 * not share mutable state. It also means an export's cache is discarded along
 * with its rig when the export finishes.
 */
export class TextMeasurer {
  readonly #cache: Map<string, GlyphRun>;
  readonly #ctx: TextMeasureContext;
  #hits = 0;
  #misses = 0;

  constructor(ctx: TextMeasureContext, cache: Map<string, GlyphRun>) {
    this.#ctx = ctx;
    this.#cache = cache;
  }

  measure(spec: TextSpec): GlyphRun {
    const key = textCacheKey(spec);
    const hit = this.#cache.get(key);
    if (hit) {
      this.#hits++;
      return hit;
    }

    this.#misses++;
    const run = layoutText(this.#ctx, spec);
    this.#cache.set(key, run);
    return run;
  }

  /** Dev diagnostics — a hit rate below ~99% in steady state means a key is churning. */
  get stats(): { readonly hits: number; readonly misses: number } {
    return { hits: this.#hits, misses: this.#misses };
  }
}
