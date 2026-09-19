import type { DecodedFrame } from '@/core/types';
import type { MediaResolver } from '@/core/render/rig';
import type { VideoClip } from './video/clip';
import type { Waveform } from './audio/waveform';

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
  /** Video only: the open container and its frame ring (§9, D-051). */
  readonly clip?: VideoClip;
  /** Audio only: the whole decoded track, and its peaks for the timeline (§10). */
  readonly audio?: AudioBuffer;
  readonly waveform?: Waveform;
  readonly width: number;
  readonly height: number;
  /** Video only. */
  readonly durationMs?: number;
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
    if (previous?.clip && previous.clip !== entry.clip) previous.clip.close();
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

  /** Every id, or just those of one kind — the overlay picker wants videos only. */
  ids(kind?: MediaKind): readonly string[] {
    if (kind === undefined) return [...this.#entries.keys()];
    return [...this.#entries.values()].filter((e) => e.kind === kind).map((e) => e.id);
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

  /**
   * Synchronous frame lookup for the renderer (§9).
   *
   * Null means the frame is not in the ring yet, and the layer draws a
   * placeholder — `renderFrame` cannot await (§3A). Whoever owns the clock
   * fills the ring first; see `prefetchVideo`.
   */
  getVideoFrame(mediaId: string, timeMs: number): DecodedFrame | null {
    return this.#entries.get(mediaId)?.clip?.frameAt(timeMs) ?? null;
  }

  /**
   * Decodes ahead of the playhead.
   *
   * Preview calls this and does not wait — a stale frame for one rAF tick
   * after a seek is better than stalling the editor. Export awaits it, which
   * is what makes the exported clip exact rather than merely plausible.
   */
  async prefetchVideo(mediaId: string, timeMs: number): Promise<void> {
    await this.#entries.get(mediaId)?.clip?.prefetch(timeMs);
  }

  /** How long a video or audio clip runs, for the panel readouts. */
  durationMsOf(mediaId: string): number | null {
    return this.#entries.get(mediaId)?.durationMs ?? null;
  }

  /** The decoded track behind an audio clip (§10). Null until it has landed. */
  getAudioBuffer(mediaId: string): AudioBuffer | null {
    return this.#entries.get(mediaId)?.audio ?? null;
  }

  getWaveform(mediaId: string): Waveform | null {
    return this.#entries.get(mediaId)?.waveform ?? null;
  }

  delete(id: string): void {
    const entry = this.#entries.get(id);
    // ImageBitmap holds decoded pixels outside the JS heap; dropping the
    // reference is not enough, and §14 budgets 900MB.
    entry?.bitmap?.close();
    entry?.clip?.close();
    this.#revokePreview(id);
    this.#entries.delete(id);
    this.#changed();
  }

  clear(): void {
    for (const entry of this.#entries.values()) {
      entry.bitmap?.close();
      entry.clip?.close();
    }
    for (const url of this.#previewUrls.values()) URL.revokeObjectURL(url);
    this.#previewUrls.clear();
    this.#entries.clear();
    this.#changed();
  }
}
