import type { MediaResolver } from '@/core/render/rig';

/**
 * The media store (§5, §9).
 *
 * Decoded bitmaps live here, keyed by mediaId; the document holds only ids.
 * That is what keeps undo snapshots cheap and the autosave payload small.
 *
 * §9's decode rules are in decode.ts. This is the lookup the renderer sees,
 * and it is deliberately synchronous: `renderFrame` must not await anything.
 * A bitmap that has not landed yet reads as null and the layer draws a
 * placeholder, rather than the frame stalling or throwing.
 */

export type MediaKind = 'image' | 'video' | 'audio';

export type MediaEntry = {
  readonly id: string;
  readonly kind: MediaKind;
  readonly name: string;
  /** Kept for persistence (§13) and for re-decoding inside the export worker. */
  readonly blob: Blob;
  readonly bitmap: ImageBitmap | null;
  readonly width: number;
  readonly height: number;
};

export class MediaStore implements MediaResolver {
  readonly #entries = new Map<string, MediaEntry>();
  readonly #previewUrls = new Map<string, string>();
  readonly #listeners = new Set<() => void>();
  #revision = 0;

  /** Bumped on every change, so callers can tell when a redraw is warranted. */
  get revision(): number {
    return this.#revision;
  }

  /**
   * External-store plumbing, so React chrome can redraw when media arrives.
   *
   * The artboard does not need this — it repaints every animation frame and
   * picks up whatever is in the store. The *inspector* does: it renders once
   * and would otherwise keep showing empty thumbnails forever, because a
   * decoded bitmap landing in a Map is invisible to React.
   *
   * Bound as fields rather than methods because useSyncExternalStore compares
   * the subscribe function by identity and resubscribes when it changes.
   *
   * No React import here — src/media may not depend on it (D-001's eslint
   * boundary). These are two plain functions; the hook lives in the UI layer.
   */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  };

  readonly getRevision = (): number => this.#revision;

  #changed(): void {
    this.#revision++;
    for (const listener of this.#listeners) listener();
  }

  set(entry: MediaEntry): void {
    const previous = this.#entries.get(entry.id);
    if (previous && previous.bitmap && previous.bitmap !== entry.bitmap) {
      previous.bitmap.close();
    }
    this.#revokePreview(entry.id);
    this.#entries.set(entry.id, entry);
    this.#changed();
  }

  get(id: string): MediaEntry | null {
    return this.#entries.get(id) ?? null;
  }

  has(id: string): boolean {
    return this.#entries.has(id);
  }

  ids(): readonly string[] {
    return [...this.#entries.keys()];
  }

  getBitmap(mediaId: string): ImageBitmap | null {
    return this.#entries.get(mediaId)?.bitmap ?? null;
  }

  /**
   * A stable object URL for showing the media in DOM chrome (thumbnails in the
   * inspector). Cached and revoked with the entry — creating one per render
   * leaks a URL every frame, and the leak is invisible until the tab is using
   * a gigabyte.
   */
  previewUrl(mediaId: string): string | null {
    const cached = this.#previewUrls.get(mediaId);
    if (cached !== undefined) return cached;

    const entry = this.#entries.get(mediaId);
    if (!entry) return null;

    const url = URL.createObjectURL(entry.blob);
    this.#previewUrls.set(mediaId, url);
    return url;
  }

  #revokePreview(mediaId: string): void {
    const url = this.#previewUrls.get(mediaId);
    if (url === undefined) return;
    URL.revokeObjectURL(url);
    this.#previewUrls.delete(mediaId);
  }

  /** Custom media (Pro) arrives at M5; until then there are no video frames. */
  getVideoFrame(_mediaId: string, _timeMs: number): VideoFrame | null {
    return null;
  }

  delete(id: string): void {
    const entry = this.#entries.get(id);
    // ImageBitmap holds decoded pixels outside the JS heap; dropping the
    // reference is not enough, and §14 budgets 900MB.
    entry?.bitmap?.close();
    this.#revokePreview(id);
    this.#entries.delete(id);
    this.#changed();
  }

  clear(): void {
    for (const entry of this.#entries.values()) entry.bitmap?.close();
    for (const url of this.#previewUrls.values()) URL.revokeObjectURL(url);
    this.#previewUrls.clear();
    this.#entries.clear();
    this.#changed();
  }
}
