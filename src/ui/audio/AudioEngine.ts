import type { AudioClip } from '@/document/types';
import { audioEndMs } from '@/core/audio/envelope';
import { scheduleClips, stopScheduled, type ScheduledClip } from '@/core/audio/graph';
import type { MediaStore } from '@/media/store';

/**
 * Preview audio playback (§10).
 *
 * "Preview playback uses `AudioBufferSourceNode` scheduled against the same
 * clock as the visual preview. Drift over a 60s preview must stay under one
 * frame."
 *
 * The way that budget is met is by inverting the relationship: rather than
 * trying to keep two clocks in step, the audio clock becomes the only clock
 * (D-054). `currentProjectMs()` reports where the audio device has actually
 * reached, `PreviewClock` reads it every tick, and the visual frame is drawn
 * for whatever time the audio says it is. Drift is then not small — it is
 * structurally zero, because there is nothing left to drift against.
 *
 * An `AudioContext` cannot start without a user gesture, so this stays
 * suspended until something asks it to play. That is also why every method is
 * safe to call before the context is running.
 */

/**
 * The audio clock, carried between its own updates (D-127).
 *
 * `AudioContext.currentTime` moves in steps of the device's audio buffer — on
 * an iPhone about every 21ms, against a screen that wants a picture every
 * 16ms. Read raw, some frames repeat the time before and the next jump ahead:
 * motion that judders — "dragging, not moving in real time" — whenever music
 * plays. Between steps the time is carried forward on the performance clock,
 * never more than 50ms past the last step and never backwards, so the picture
 * moves every frame and still cannot wander from the music.
 */
export class ClockSmoother {
  #lastRaw = -1;
  #seenAt = 0;
  #last = Number.NEGATIVE_INFINITY;

  /** `raw` and the result in seconds; `nowMs` from `performance.now()`. */
  read(raw: number, nowMs: number): number {
    if (raw !== this.#lastRaw) {
      this.#lastRaw = raw;
      this.#seenAt = nowMs;
    }
    const ahead = Math.min(0.05, Math.max(0, (nowMs - this.#seenAt) / 1000));
    const smooth = Math.max(this.#last, raw + ahead);
    this.#last = smooth;
    return smooth;
  }

  reset(): void {
    this.#lastRaw = -1;
    this.#last = Number.NEGATIVE_INFINITY;
  }
}

export class AudioEngine {
  #ctx: AudioContext | null = null;
  #master: GainNode | null = null;
  #scheduled: ScheduledClip[] = [];

  /** Project time the current scheduling run began at. */
  #originMs = 0;
  /** The context clock reading that corresponds to `#originMs`. */
  #originContextTime = 0;
  #running = false;
  #loopMs = 0;

  /**
   * Fires when the preview wraps, to schedule the next pass.
   *
   * Web Audio sources play once. The visual preview loops, so without this the
   * picture returns to zero while the music carries straight on — and because
   * the clock is *mastered* by the audio (D-054), the two do not merely drift,
   * they diverge by a whole loop. Rescheduling at the wrap is what makes the
   * music actually follow the timeline.
   */
  #loopTimer: ReturnType<typeof setTimeout> | null = null;
  #request: { clips: readonly AudioClip[]; media: MediaStore; durationMs: number } | null = null;

  /**
   * Bumped by every `stop()`, and so by every `play()`, which stops first.
   *
   * `play()` can suspend at `ctx.resume()`, and a seek arriving during that
   * gap starts a second one. The second calls `stop()` — but the first has not
   * scheduled anything yet, so there is nothing to stop, and when it resumes
   * it schedules sources that no `#scheduled` list holds a reference to. They
   * cannot then be stopped by anything, and play on over the top of the new
   * ones until the track ends.
   */
  #generation = 0;

  /** The audio clock between its own steps (D-127); see `ClockSmoother`. */
  #smoother = new ClockSmoother();

  #smoothTime(ctx: AudioContext): number {
    return this.#smoother.read(ctx.currentTime, performance.now());
  }

  get hasAudio(): boolean {
    return this.#scheduled.length > 0;
  }

  /**
   * Where the audio has reached, in project time, or null when silent.
   *
   * This is what `PreviewClock.setAudioMaster` is given.
   */
  currentProjectMs(): number | null {
    const ctx = this.#ctx;
    if (!ctx || !this.#running || this.#scheduled.length === 0) return null;
    if (ctx.state !== 'running') return null;

    const elapsed = (this.#smoothTime(ctx) - this.#originContextTime) * 1000;
    const position = this.#originMs + elapsed;

    // The visual preview loops, so the audio has to as well; the loop point is
    // the project duration, not the track length.
    if (this.#loopMs > 0 && position >= this.#loopMs) return position % this.#loopMs;
    return position;
  }

  /**
   * Starts, or restarts, playback from `fromMs`.
   *
   * Called on play and after every seek. Rescheduling wholesale rather than
   * adjusting in place is deliberate: Web Audio has no way to move a source
   * that has already started, and a clip list this small makes the rebuild
   * cheaper than the bookkeeping would be.
   */
  async play(
    clips: readonly AudioClip[],
    media: MediaStore,
    options: { fromMs: number; durationMs: number },
  ): Promise<void> {
    this.stop();
    const generation = this.#generation;

    const playable = clips.filter((clip) => media.getAudioBuffer(clip.mediaId) !== null);
    if (playable.length === 0) return;

    const ctx = this.#context();
    // Resuming needs a gesture on first use; after that it is a no-op.
    if (ctx.state === 'suspended') await ctx.resume();

    // Superseded while we were suspended — a newer play, or a stop, has taken
    // over. Scheduling now would be scheduling into someone else's timeline.
    if (generation !== this.#generation) return;

    const master = this.#master;
    if (!master) return;

    /*
     * A small lead so the first clip is scheduled in the future rather than in
     * the past. Scheduling at exactly `currentTime` makes the opening moments
     * of a clip race the audio thread and clip audibly.
     */
    const startAt = ctx.currentTime + 0.06;

    this.#originMs = options.fromMs;
    this.#originContextTime = startAt;
    this.#smoother.reset();
    this.#loopMs = Math.max(0, options.durationMs);
    this.#running = true;

    this.#scheduled = scheduleClips(ctx, master, playable, (id) => media.getAudioBuffer(id), {
      fromMs: options.fromMs,
      atContextTime: startAt,
    });

    // Nothing landed in range — treat it as silence rather than as playing, so
    // the clock does not get mastered by a context with nothing in it.
    if (this.#scheduled.length === 0) {
      this.#running = false;
    }

    /*
     * Re-arm for the wrap. A clip that starts late in the timeline has nothing
     * scheduled on this pass but everything on the next, so the timer is set
     * whether or not anything is sounding right now.
     */
    this.#request = { clips, media, durationMs: options.durationMs };
    const remaining = options.durationMs - options.fromMs;
    if (remaining > 0) {
      this.#loopTimer = setTimeout(() => {
        const request = this.#request;
        if (request) void this.play(request.clips, request.media, { fromMs: 0, durationMs: request.durationMs });
      }, remaining);
    }
  }

  stop(): void {
    this.#generation += 1;
    if (this.#loopTimer !== null) {
      clearTimeout(this.#loopTimer);
      this.#loopTimer = null;
    }
    stopScheduled(this.#scheduled);
    this.#scheduled = [];
    this.#running = false;
  }

  /** Releases the device. The editor should not hold one while silent. */
  async dispose(): Promise<void> {
    this.stop();
    this.#request = null;
    const ctx = this.#ctx;
    this.#ctx = null;
    this.#master = null;
    if (ctx && ctx.state !== 'closed') await ctx.close();
  }

  #context(): AudioContext {
    if (this.#ctx) return this.#ctx;

    const ctx = new AudioContext({ latencyHint: 'interactive' });
    const master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);

    this.#ctx = ctx;
    this.#master = master;
    return ctx;
  }
}

/** Convenience for callers deciding whether a project has anything to play. */
export { audioEndMs };
