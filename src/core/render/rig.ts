import type { DecodedFrame, Layer } from '@/core/types';
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

/**
 * What the core needs from the media store, without depending on it.
 *
 * Deliberately synchronous, both of them. `renderFrame` must not await
 * anything (§3A), so a frame that has not been decoded yet reads as null and
 * the layer draws a placeholder. Filling the buffer ahead of the render is the
 * caller's job — see `videoDemands` and `MediaStore.prefetchVideo` (D-051).
 */
export interface MediaResolver {
  getBitmap(mediaId: string): ImageBitmap | null;
  getVideoFrame(mediaId: string, timeMs: number): DecodedFrame | null;
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
  /**
   * Layers with the user's slot nudges composed in (B), keyed by scene id.
   *
   * Separate from `layerCache` and deliberately one entry per scene rather
   * than one per distinct nudge: dragging a photo produces a new set of values
   * on every pointer move, and an unbounded map would grow an entry for each
   * of them. Keyed by scene because a transition has two scenes on screen at
   * once, and a single slot would thrash between them for the whole overlap.
   *
   * Empty for any project that has never nudged anything, which is the case
   * that must stay free.
   */
  readonly placedCache: Map<string, { key: string; layers: readonly Layer[] }>;
  /** Laid-out glyph runs, keyed by every field that can change a measurement. §6.3. */
  readonly textCache: Map<string, GlyphRun>;
  readonly media: MediaResolver;
  readonly stats: RenderStats;
  /**
   * The scene the last frame drew, for direct manipulation (B).
   *
   * Layers as the *template* built them, before any of the user's nudges. The
   * editor adds the nudge itself when it draws a selection box, so the box
   * tracks a drag at React's speed instead of waiting for the next frame to
   * be rendered and read back — the difference between handles that stay on
   * the object and handles that trail behind it.
   *
   * Replaced only when the scene, its built layers or its design box actually
   * change — never once a frame. That is what makes its identity a usable
   * signal: the preview loop compares it after each frame and tells React only
   * when it has really moved on. The current *time* is deliberately not in
   * here, because it changes every frame and the editor already knows it.
   */
  drawn: DrawnScene | null;
  /**
   * §12: "free exports carry a small watermark".
   *
   * Part of the rig rather than read from the entitlements module inside the
   * renderer, so `renderFrame` stays a function of (project, time, rig) —
   * D-001's whole premise — and so the export path can state it explicitly
   * from the request rather than inheriting whatever the main thread happens
   * to think the tier is.
   *
   * A function rather than a field because the tier can change under a running
   * preview, and a rig is built once: this is the one thing about it that is
   * read fresh each frame.
   */
  readonly watermark: () => boolean;
};

/** What `renderFrame` last drew for the scene under the playhead. */
export type DrawnScene = {
  readonly sceneId: string;
  readonly layers: readonly Layer[];
  /** The scene's own design box — its template's, not the project's. */
  readonly design: { readonly w: number; readonly h: number };
};

export function createRenderRig(
  media: MediaResolver = EMPTY_MEDIA,
  watermark: () => boolean = () => false,
): RenderRig {
  return {
    buffers: new BufferPool(),
    layerCache: new Map(),
    overlayCache: new Map(),
    placedCache: new Map(),
    textCache: new Map(),
    media,
    drawn: null,
    watermark,
    stats: { frameCount: 0, lastFrameMs: 0, lastBuildMs: 0, buildCount: 0 },
  };
}

export function disposeRenderRig(rig: RenderRig): void {
  rig.buffers.dispose();
  rig.layerCache.clear();
  rig.overlayCache.clear();
  rig.textCache.clear();
}
