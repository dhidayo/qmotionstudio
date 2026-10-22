/**
 * Notices playback that cannot keep up (D-112, D-154).
 *
 * D-112's detector averaged the gap between frames over forty-five of them and
 * called anything under about forty frames a second slow. Stutter does not
 * show in an average: a laptop showing 48 frames a second on a 60Hz screen —
 * every fifth frame held twice, which is exactly "the motion drags" — averages
 * a comfortable 21ms. This counts the frames that arrive late instead.
 *
 *   - The screen's own interval is the gap most frames manage (a low
 *     percentile of recent gaps), so 60Hz, 120Hz and 50Hz screens all work.
 *   - A frame is late when its gap is more than one and a half intervals —
 *     or more than one and a half 60Hz intervals, whichever is longer: a
 *     120Hz screen showing a steady sixty frames a second is smooth, and is
 *     not worth a softer picture to reach more.
 *   - A window of frames is slow when more than one in eight arrived late, or
 *     when the average gap is over 25ms (D-112's rule, kept for a steady
 *     thirty frames a second, where no single frame is later than the rest).
 *   - A window is sixty frames, or two seconds if that comes first: a device
 *     drawing five frames a second is judged as soon as one drawing fifty,
 *     not after twelve seconds of it.
 *   - Two slow windows in a row, two to four seconds, before anything steps
 *     down: one hitch — a template building, a photo decoding — is not a
 *     slow device.
 *
 * Pure and clock-free: the caller feeds it the gaps between animation frames,
 * which is what makes it testable without a browser.
 */
export type FrameVerdict = 'ignored' | 'onTime' | 'late';

/** Frames per window, at most… */
const WINDOW = 60;
/** …and its length at most. */
const WINDOW_MS = 2_000;
/** More than this share of late frames makes a window slow. */
const LATE_SHARE = 0.12;
/** D-112: an average gap above this is slow even without late frames. */
const SLOW_AVERAGE_MS = 25;
/** Slow windows in a row before `takeSlow` says so. */
const SLOW_WINDOWS = 2;
/**
 * A gap this long is a hidden tab, a breakpoint or the machine stopping for
 * something else, not a frame rate. Shorter gaps all count: a device that
 * takes a quarter of a second over every frame is exactly the one to help.
 */
const MAX_GAP_MS = 1_000;
/**
 * After a reset, frames skipped while a resize or a fresh start settles: this
 * many, or this long, whichever comes first.
 */
const SETTLE_FRAMES = 10;
const SETTLE_MS = 300;
/** Recent gaps kept for the interval estimate. */
const HISTORY = 120;
const SIXTY_HZ_MS = 1000 / 60;

export class FrameMeter {
  readonly #history = new Float64Array(HISTORY);
  readonly #sorted = new Float64Array(HISTORY);
  #historyLength = 0;
  #historyNext = 0;
  #intervalMs = SIXTY_HZ_MS;
  #sinceEstimate = 0;

  #settleFrames = SETTLE_FRAMES;
  #settleMs = SETTLE_MS;
  #frames = 0;
  #late = 0;
  #gapTotal = 0;
  #slowWindows = 0;
  #slow = false;

  /** The screen's frame interval, as measured. */
  get intervalMs(): number {
    return this.#intervalMs;
  }

  /**
   * Starts a fresh window after something that is not the device's fault: a
   * pause, a resize of the canvas, a hidden tab. Keeps what it has learnt
   * about the screen.
   */
  reset(): void {
    this.#settleFrames = SETTLE_FRAMES;
    this.#settleMs = SETTLE_MS;
    this.#frames = 0;
    this.#late = 0;
    this.#gapTotal = 0;
    this.#slowWindows = 0;
  }

  /** One frame's gap, in milliseconds, while the preview plays. */
  push(gapMs: number): FrameVerdict {
    if (!(gapMs > 0) || gapMs > MAX_GAP_MS) {
      this.reset();
      return 'ignored';
    }
    this.#remember(gapMs);
    if (this.#settleFrames > 0 && this.#settleMs > 0) {
      this.#settleFrames -= 1;
      this.#settleMs -= gapMs;
      return 'ignored';
    }

    const late = gapMs > 1.5 * Math.max(this.#intervalMs, SIXTY_HZ_MS);
    this.#frames += 1;
    this.#gapTotal += gapMs;
    if (late) this.#late += 1;

    if (this.#frames >= WINDOW || this.#gapTotal >= WINDOW_MS) {
      const slow = this.#late / this.#frames > LATE_SHARE || this.#gapTotal / this.#frames > SLOW_AVERAGE_MS;
      this.#slowWindows = slow ? this.#slowWindows + 1 : 0;
      if (this.#slowWindows >= SLOW_WINDOWS) {
        this.#slow = true;
        this.#slowWindows = 0;
      }
      this.#frames = 0;
      this.#late = 0;
      this.#gapTotal = 0;
    }
    return late ? 'late' : 'onTime';
  }

  /** True once each time playback has been slow for long enough to act on. */
  takeSlow(): boolean {
    const slow = this.#slow;
    this.#slow = false;
    return slow;
  }

  #remember(gapMs: number): void {
    this.#history[this.#historyNext] = gapMs;
    this.#historyNext = (this.#historyNext + 1) % HISTORY;
    this.#historyLength = Math.min(HISTORY, this.#historyLength + 1);
    // Re-estimated every few frames rather than sorted on every one.
    this.#sinceEstimate += 1;
    if (this.#historyLength < 8 || this.#sinceEstimate < 15) return;
    this.#sinceEstimate = 0;
    const sorted = this.#sorted.subarray(0, this.#historyLength);
    sorted.set(this.#history.subarray(0, this.#historyLength));
    sorted.sort();
    const low = sorted[Math.floor(this.#historyLength * 0.2)] ?? SIXTY_HZ_MS;
    this.#intervalMs = Math.min(34, Math.max(6, low));
  }
}
