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

    const elapsed = (ctx.currentTime - this.#originContextTime) * 1000;
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

    const playable = clips.filter((clip) => media.getAudioBuffer(clip.mediaId) !== null);
    if (playable.length === 0) return;

    const ctx = this.#context();
    // Resuming needs a gesture on first use; after that it is a no-op.
    if (ctx.state === 'suspended') await ctx.resume();

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
    this.#loopMs = Math.max(0, options.durationMs);
    this.#running = true;

    this.#scheduled = scheduleClips(ctx, master, playable, (id) => media.getAudioBuffer(id), {
      fromMs: options.fromMs,
      atContextTime: startAt,
    });

    // Nothing landed in range — treat it as silence rather than as playing, so
    // the clock does not get mastered by a context with nothing in it.
    if (this.#scheduled.length === 0) this.#running = false;
  }

  stop(): void {
    stopScheduled(this.#scheduled);
    this.#scheduled = [];
    this.#running = false;
  }

  /** Releases the device. The editor should not hold one while silent. */
  async dispose(): Promise<void> {
    this.stop();
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
