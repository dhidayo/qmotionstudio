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
   * Where a clock that does not loop comes to rest when it reaches the end
   * (D-155). Image mode plays a design once and then shows its picture
   * moment — the template's own best still — which is not always the last
   * frame. Null rests on the end itself.
   */
  #restAtMs: number | null = null;
  /** True from the moment a one-shot play finishes until the next play or seek. */
  #ended = false;

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

  /** Whether a one-shot play has finished and is resting (D-155): what shows Replay. */
  get ended(): boolean {
    return this.#ended;
  }

  get restAtMs(): number | null {
    return this.#restAtMs;
  }

  setDuration(durationMs: number): void {
    const wasAtEnd = this.#timeMs >= this.#durationMs;
    this.#durationMs = Math.max(0, durationMs);
    if (this.#timeMs > this.#durationMs) this.#timeMs = this.#loop ? 0 : this.#durationMs;
    // Finished on the end itself: stay on the end of the new length, not inside it.
    else if (this.#ended && this.#restAtMs === null && wasAtEnd) this.#timeMs = this.#durationMs;
  }

  setLoop(loop: boolean): void {
    this.#loop = loop;
    if (!loop || !this.#ended) return;
    // Told, so a Replay button showing on a clock that has stopped resting goes.
    this.#ended = false;
    this.#transportChanged();
  }

  /**
   * Where a one-shot play rests (D-155); null for the end. Clamped to the
   * timeline when it is used, since the length may change after it is set.
   *
   * A clock already resting moves to the new moment: the frame on screen is
   * the picture Export → Image saves, so after a change of speed or length
   * the two must still be the same frame.
   */
  setRest(timeMs: number | null): void {
    const next = timeMs === null || !Number.isFinite(timeMs) ? null : Math.max(0, timeMs);
    if (next === this.#restAtMs) return;
    this.#restAtMs = next;
    if (!this.#ended) return;
    this.#timeMs = Math.min(next ?? this.#durationMs, this.#durationMs);
    this.#transportChanged();
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
    /*
     * Play after a one-shot play has finished means "again" (D-155): from the
     * start, not from the picture moment it rested on, and not from the end,
     * where it would stop again on the very next frame.
     */
    if (this.#ended || (!this.#loop && this.#timeMs >= this.#durationMs)) this.#timeMs = 0;
    this.#ended = false;
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
    // Moving the playhead by hand is no longer resting where playback ended.
    if (next === this.#timeMs && !this.#ended) return;
    this.#ended = false;
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
      /*
       * A one-shot clock still stops at the end, whoever is keeping time. The
       * engine loops its music at the project's length, so the end can also
       * show up as the time jumping back towards the start: a drop of more
       * than half the length is that wrap, never a correction.
       */
      const wrapped = this.#timeMs - mastered > this.#durationMs / 2;
      if (!this.#loop && (mastered >= this.#durationMs || wrapped)) return this.#finish();
      // The engine reports where it has actually got to, wrapping included.
      this.#timeMs = Math.max(0, Math.min(mastered, this.#durationMs));
      return this.#timeMs;
    }

    const dt = Math.max(0, Math.min(deltaMs, 100));
    let next = this.#timeMs + dt;

    if (next >= this.#durationMs) {
      if (!this.#loop) return this.#finish();
      next %= this.#durationMs;
    }

    this.#timeMs = next;
    return next;
  }

  /**
   * The end of a one-shot play (D-155): stop, rest on the picture moment, and
   * say so. Subscribers hear it like any other transport change — the audio
   * engine has to stop, and nothing else would tell it.
   */
  #finish(): number {
    this.#timeMs = Math.min(this.#restAtMs ?? this.#durationMs, this.#durationMs);
    this.#playing = false;
    this.#ended = true;
    this.#transportChanged();
    return this.#timeMs;
  }
}
