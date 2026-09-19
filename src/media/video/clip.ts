import {
  ALL_FORMATS,
  BlobSource,
  Input,
  VideoSampleSink,
  type VideoSample,
} from 'mediabunny';
import type { DecodedFrame } from '@/core/types';

/**
 * A decoded video clip with a small frame ring (§9's custom media).
 *
 * §9 asks for `VideoDecoder` and "the frame nearest the requested timestamp",
 * cached in "a small ring buffer". Mediabunny drives the decoder rather than
 * us calling `VideoDecoder` directly — the symmetric decision to D-002, and
 * for the same reason: feeding a decoder means demuxing the container first,
 * §16 rules out `ffmpeg.wasm`, and hand-rolling an MP4 demuxer is not code
 * this project should own. `VideoSampleSink.getSample(t)` is documented to
 * return the last sample whose start timestamp is ≤ t, which is exactly the
 * semantics §9 asks for.
 *
 * ── Why a ring at all ─────────────────────────────────────────────────────
 * `renderFrame` is synchronous (§3A) and decoding is not. So the buffer is
 * filled *ahead* of the render, by whoever owns the clock, and the renderer
 * only ever does a synchronous lookup. Preview fills it opportunistically and
 * tolerates a stale frame for a few milliseconds after a seek; export awaits
 * the fill before every frame, so its output is exact.
 */

/** Frames kept either side of the playhead. §9 says "small"; this is ~0.4s at 30fps. */
const RING_SIZE = 12;

/** How far ahead a fill reads, in seconds. */
const WINDOW_S = 0.4;

/**
 * How far behind the requested time a cached frame may be before it is treated
 * as a miss.
 *
 * Without this, a big seek would show whatever happened to be in the ring —
 * a frame from a completely different part of the clip — until the fill
 * landed. A placeholder is more honest than the wrong picture.
 */
const STALE_LIMIT_MS = 400;

export class VideoClip {
  readonly #sink: VideoSampleSink;
  readonly #durationMs: number;
  readonly #width: number;
  readonly #height: number;

  /** Sorted by timestamp. Owned here; entries are closed on eviction. */
  #ring: VideoSample[] = [];
  #inFlight: Promise<void> | null = null;
  #closed = false;

  private constructor(sink: VideoSampleSink, durationMs: number, width: number, height: number) {
    this.#sink = sink;
    this.#durationMs = durationMs;
    this.#width = width;
    this.#height = height;
  }

  /**
   * Opens a clip from a blob.
   *
   * Throws rather than returning null on a file with no video track — §16, and
   * a silent no-op here would show as an overlay that simply never appears.
   */
  static async open(blob: Blob): Promise<VideoClip> {
    const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(blob) });

    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error('That file has no video track.');

    const decodable = await track.canDecode();
    if (!decodable) {
      throw new Error('This browser cannot decode that video. Try an H.264 MP4 or a VP9 WebM.');
    }

    // getDisplayWidth/Height rather than the deprecated sync getters: these
    // account for the track's rotation and pixel aspect ratio, which a phone
    // clip recorded in portrait very much has.
    const [durationS, width, height] = await Promise.all([
      track.computeDuration(),
      track.getDisplayWidth(),
      track.getDisplayHeight(),
    ]);

    return new VideoClip(new VideoSampleSink(track), Math.max(1, durationS * 1000), width, height);
  }

  get durationMs(): number { return this.#durationMs; }
  get width(): number { return this.#width; }
  get height(): number { return this.#height; }

  /**
   * Maps a layer's local time onto the clip's own timeline.
   *
   * Loops. An overlay outliving its clip is the common case — a two-second
   * texture under a ten-second beat — and holding the last frame for eight
   * seconds reads as a stall, not as a decision.
   */
  localMs(timeMs: number): number {
    return wrap(timeMs, this.#durationMs);
  }

  /** Synchronous lookup for the renderer. Null means "not decoded yet". */
  frameAt(timeMs: number): DecodedFrame | null {
    if (this.#closed) return null;
    const local = this.localMs(timeMs);

    let best: VideoSample | null = null;
    for (const sample of this.#ring) {
      if (sample.timestamp * 1000 > local) break;
      best = sample;
    }

    if (!best) return null;
    return local - best.timestamp * 1000 > STALE_LIMIT_MS ? null : best;
  }

  /**
   * Ensures the ring covers `timeMs`.
   *
   * Two attempts: if a fill is already running, wait for it and re-check
   * before starting another. That keeps the export path — which awaits this
   * and must not proceed on a miss — from racing its own prefetch, without
   * letting the preview queue a fill per animation frame.
   */
  async prefetch(timeMs: number): Promise<void> {
    if (this.#closed) return;
    const local = this.localMs(timeMs);

    for (let attempt = 0; attempt < 2; attempt++) {
      if (this.#covers(local)) return;

      if (this.#inFlight) {
        await this.#inFlight;
        continue;
      }

      const fill = this.#fill(local);
      this.#inFlight = fill;
      try {
        await fill;
      } finally {
        if (this.#inFlight === fill) this.#inFlight = null;
      }
    }
  }

  #covers(local: number): boolean {
    const first = this.#ring[0];
    const last = this.#ring.at(-1);
    if (!first || !last) return false;
    return first.timestamp * 1000 <= local && last.timestamp * 1000 >= local;
  }

  async #fill(local: number): Promise<void> {
    const startS = local / 1000;
    const collected: VideoSample[] = [];

    try {
      // A seek backwards lands mid-GOP, so the first sample at or before the
      // target comes from getSample; the iterator then walks forward cheaply.
      const anchor = await this.#sink.getSample(startS);
      if (anchor) collected.push(anchor);

      for await (const sample of this.#sink.samples(startS, startS + WINDOW_S)) {
        collected.push(sample);
        if (collected.length >= RING_SIZE) break;
      }
    } catch (error) {
      for (const sample of collected) sample.close();
      // §16: a decode failure is not something to paper over with a blank
      // frame. The original is attached rather than flattened into a string.
      throw new Error(
        `Could not decode video at ${(local / 1000).toFixed(2)}s.`,
        { cause: error },
      );
    }

    if (this.#closed) {
      for (const sample of collected) sample.close();
      return;
    }

    this.#merge(collected, local);
  }

  /**
   * Folds new samples into the ring, keeps the ones nearest the playhead and
   * closes the rest.
   *
   * Every eviction closes. A VideoSample holds decoded pixels outside the JS
   * heap, so dropping the reference is not enough — §14 budgets 900MB and a
   * leaked 1080p frame is 3MB of it.
   */
  #merge(incoming: readonly VideoSample[], local: number): void {
    const byTimestamp = new Map<number, VideoSample>();

    for (const sample of [...this.#ring, ...incoming]) {
      const existing = byTimestamp.get(sample.timestamp);
      if (existing && existing !== sample) {
        // The same frame decoded twice — keep one, close the duplicate.
        sample.close();
        continue;
      }
      byTimestamp.set(sample.timestamp, sample);
    }

    const sorted = [...byTimestamp.values()].sort((a, b) => a.timestamp - b.timestamp);
    if (sorted.length <= RING_SIZE) {
      this.#ring = sorted;
      return;
    }

    const keep = new Set(
      [...sorted]
        .sort((a, b) => Math.abs(a.timestamp * 1000 - local) - Math.abs(b.timestamp * 1000 - local))
        .slice(0, RING_SIZE),
    );

    for (const sample of sorted) {
      if (!keep.has(sample)) sample.close();
    }
    this.#ring = sorted.filter((sample) => keep.has(sample));
  }

  close(): void {
    this.#closed = true;
    for (const sample of this.#ring) sample.close();
    this.#ring = [];
  }
}

/** Positive modulo, so a negative local time still lands inside the clip. */
export function wrap(timeMs: number, durationMs: number): number {
  if (!Number.isFinite(timeMs) || durationMs <= 0) return 0;
  const wrapped = timeMs % durationMs;
  return wrapped < 0 ? wrapped + durationMs : wrapped;
}
