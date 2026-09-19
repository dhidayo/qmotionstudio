/**
 * The preview clock.
 *
 * Deliberately a plain mutable object, not React state: it advances every
 * animation frame, and pushing that through React would re-render the editor
 * sixty times a second. Components that need to *display* the time sample it on
 * a slow interval instead.
 *
 * §3A drives this from wall-clock time. When audio is playing it is fed from
 * `AudioContext.currentTime` instead — the two are genuinely different clock
 * domains and drift well past a frame over sixty seconds, so the visual clock
 * is mastered by the audio one whenever there is audio (§10). That swap
 * happens here and nowhere else (D-054).
 */
export class PreviewClock {
  #timeMs = 0;
  #playing = false;
  #durationMs = 0;
  #loop = true;

  /**
   * Returns the project time the audio engine is currently sounding, or null
   * when nothing is playing.
   *
   * A function rather than a value so the clock pulls on every tick and the
   * engine never has to push. Set to null and the clock falls straight back to
   * wall time, which is what Showcase mode and a silent project use.
   */
  #audioMaster: (() => number | null) | null = null;

  /**
   * Notified when the transport changes — play, pause or seek.
   *
   * Web Audio cannot move a source that has already started, so the engine has
   * to tear down and reschedule on every one of these. Polling for it at the
   * readout's 12–20Hz would put a visible stutter on every scrub.
   */
  readonly #listeners = new Set<() => void>();

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  }

  #transportChanged(): void {
    for (const listener of this.#listeners) listener();
  }

  constructor(durationMs: number, options?: { loop?: boolean }) {
    this.#durationMs = Math.max(0, durationMs);
    this.#loop = options?.loop ?? true;
  }

  get timeMs(): number {
    return this.#timeMs;
  }

  get playing(): boolean {
    return this.#playing;
  }

  get durationMs(): number {
    return this.#durationMs;
  }

  setDuration(durationMs: number): void {
    this.#durationMs = Math.max(0, durationMs);
    if (this.#timeMs > this.#durationMs) this.#timeMs = this.#loop ? 0 : this.#durationMs;
  }

  setLoop(loop: boolean): void {
    this.#loop = loop;
  }

  /** §10: the audio clock becomes the master whenever there is audio to hear. */
  setAudioMaster(master: (() => number | null) | null): void {
    this.#audioMaster = master;
  }

  get audioMastered(): boolean {
    return this.#audioMaster !== null && this.#audioMaster() !== null;
  }

  play(): void {
    if (this.#playing) return;
    this.#playing = true;
    this.#transportChanged();
  }

  pause(): void {
    if (!this.#playing) return;
    this.#playing = false;
    this.#transportChanged();
  }

  seek(timeMs: number): void {
    const clamped = Math.max(0, Math.min(timeMs, this.#durationMs));
    const next = Number.isFinite(clamped) ? clamped : 0;
    if (next === this.#timeMs) return;
    this.#timeMs = next;
    this.#transportChanged();
  }

  /**
   * Advances by a wall-clock delta, or follows the audio clock if one is set.
   *
   * §10 budgets under one frame of drift across a sixty-second preview.
   * Accumulating `performance.now()` deltas cannot meet that against an audio
   * device running on its own crystal: the two disagree by tens of
   * milliseconds a minute, and every frame of that is visible as lip-sync
   * error against a beat. So when audio is sounding, its clock *is* the time
   * and the visual loop simply reads it.
   */
  tick(deltaMs: number): number {
    if (!this.#playing || this.#durationMs <= 0) return this.#timeMs;

    const mastered = this.#audioMaster?.() ?? null;
    if (mastered !== null) {
      // The engine reports where it has actually got to, wrapping included.
      this.#timeMs = Math.max(0, Math.min(mastered, this.#durationMs));
      return this.#timeMs;
    }

    const dt = Math.max(0, Math.min(deltaMs, 100));
    let next = this.#timeMs + dt;

    if (next >= this.#durationMs) {
      if (this.#loop) {
        next %= this.#durationMs;
      } else {
        next = this.#durationMs;
        this.#playing = false;
      }
    }

    this.#timeMs = next;
    return next;
  }
}
