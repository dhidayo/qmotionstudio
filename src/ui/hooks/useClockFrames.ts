import { useEffect, useLayoutEffect, useRef } from 'react';
import type { PreviewClock } from '@/core/time/clock';

/**
 * Calls `onFrame` with the clock's time once per display frame, for chrome
 * that has to move as smoothly as the picture (D-112).
 *
 * The playheads and time readouts used to sample the clock twelve times a
 * second into React state. That re-rendered whole panels — the full timeline,
 * every clip in it — twelve times a second during playback, and the playhead
 * still moved in visible steps: "the timeline doesn't move smoothly, it moves
 * with little pauses". Writing the few values that change straight to the
 * elements that show them, in step with the frame the canvas draws, is both
 * smoother and far cheaper.
 *
 * Only called when the time or the play state actually changed, so a paused
 * editor does no work. It also runs after every render, so a change that is
 * not about time — the lane growing, a new duration — is reflected at once.
 */
export function useClockFrames(
  clock: PreviewClock | null,
  onFrame: (timeMs: number, playing: boolean) => void,
): void {
  const latest = useRef(onFrame);

  useLayoutEffect(() => {
    latest.current = onFrame;
    if (clock) onFrame(clock.timeMs, clock.playing);
  });

  useEffect(() => {
    if (!clock) return;
    let handle = 0;
    let lastTime = Number.NaN;
    let lastPlaying: boolean | null = null;
    const tick = (): void => {
      const timeMs = clock.timeMs;
      const playing = clock.playing;
      if (timeMs !== lastTime || playing !== lastPlaying) {
        lastTime = timeMs;
        lastPlaying = playing;
        latest.current(timeMs, playing);
      }
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(handle); };
  }, [clock]);
}
