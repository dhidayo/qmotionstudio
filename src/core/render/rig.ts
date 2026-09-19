import type { Layer } from '@/core/types';
import type { GlyphRun } from '@/core/text/layout';
import { BufferPool } from './buffers';

/**
 * D-001 (amended §3A). The renderer's mutable working set, passed in explicitly
 * rather than held at module scope.
 *
 * This matters because export and preview run at the same time — the user
 * watches a progress bar over a live editor. Module-level scene buffers would
 * be written by both renderers at once and tear. One rig per renderer makes
 * that impossible by construction.
 *
 * renderFrame stays deterministic: given the same (project, time, rig contents)
 * it draws the same pixels, reads no React state and touches no DOM.
 */

/** What the core needs from the media store, without depending on it. */
export interface MediaResolver {
  getBitmap(mediaId: string): ImageBitmap | null;
  getVideoFrame(mediaId: string, timeMs: number): VideoFrame | null;
}

export const EMPTY_MEDIA: MediaResolver = {
  getBitmap: () => null,
  getVideoFrame: () => null,
};

export type RenderStats = {
  frameCount: number;
  lastFrameMs: number;
  lastBuildMs: number;
  /** How many times build() has actually run. §16 forbids it inside the render
   *  loop, so this must stay flat while frameCount climbs. */
  buildCount: number;
};

export type RenderRig = {
  readonly buffers: BufferPool;
  /** Memoised template output, keyed by (templateId, structural inputs, aspect). §3B. */
  readonly layerCache: Map<string, readonly Layer[]>;
  /**
   * Memoised overlay layers, keyed on the overlay's own content (M5).
   *
   * Separate from layerCache because an overlay is not a scene (§3C): it
   * outlives a template change and is keyed on completely different fields.
   * Same rule though — building one per frame would be §16's forbidden
   * `build()` in the render loop wearing a different hat.
   */
  readonly overlayCache: Map<string, Layer>;
  /** Laid-out glyph runs, keyed by every field that can change a measurement. §6.3. */
  readonly textCache: Map<string, GlyphRun>;
  readonly media: MediaResolver;
  readonly stats: RenderStats;
};

export function createRenderRig(media: MediaResolver = EMPTY_MEDIA): RenderRig {
  return {
    buffers: new BufferPool(),
    layerCache: new Map(),
    overlayCache: new Map(),
    textCache: new Map(),
    media,
    stats: { frameCount: 0, lastFrameMs: 0, lastBuildMs: 0, buildCount: 0 },
  };
}

export function disposeRenderRig(rig: RenderRig): void {
  rig.buffers.dispose();
  rig.layerCache.clear();
  rig.overlayCache.clear();
  rig.textCache.clear();
}
