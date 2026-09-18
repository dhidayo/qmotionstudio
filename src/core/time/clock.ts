/**
 * The preview clock.
 *
 * Deliberately a plain mutable object, not React state: it advances every
 * animation frame, and pushing that through React would re-render the editor
 * sixty times a second. Components that need to *display* the time sample it on
 * a slow interval instead.
 *
 * §3A drives this from wall-clock time. At M6, when audio is playing, `tick`
 * is fed from AudioContext.currentTime instead — the two are different clock
 * domains and drift well past a frame over sixty seconds, so the visual clock
 * has to be mastered by the audio one whenever there is audio. That swap
 * happens here and nowhere else.
 */
export class PreviewClock {
  #timeMs = 0;
  #playing = false;
  #durationMs = 0;
  #loop = true;

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

  play(): void {
    this.#playing = true;
  }

  pause(): void {
    this.#playing = false;
  }

  seek(timeMs: number): void {
    const clamped = Math.max(0, Math.min(timeMs, this.#durationMs));
    this.#timeMs = Number.isFinite(clamped) ? clamped : 0;
  }

  /**
   * Advances by a wall-clock delta. Large deltas are clamped: a backgrounded
   * tab can hand back a delta of several seconds, and a preview that leaps
   * forward on refocus looks broken.
   */
  tick(deltaMs: number): number {
    if (!this.#playing || this.#durationMs <= 0) return this.#timeMs;

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
