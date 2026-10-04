import { useEffect, useRef, useState } from 'react';
import type { Project } from '@/document/types';
import type { PreviewClock } from '@/core/time/clock';
import type { DrawnScene, RenderRig } from '@/core/render/rig';
import { renderFrame } from '@/core/render/renderFrame';
import { videoDemandsWithLead } from '@/document/select/media';
import { totalDurationMs } from '@/document/select/timeline';
import type { MediaStore } from '@/media/store';

/**
 * Drives renderFrame from requestAnimationFrame (§3A).
 *
 * The loop keeps its own time in the clock object rather than in React state —
 * sixty re-renders a second would make the editor unusable, and the artboard
 * has nothing to re-render anyway: it draws to a canvas.
 *
 * Takes the canvas *element*, not a ref. The artboard only mounts its canvas
 * once the stage has been measured, and an effect watching a ref object would
 * run before that and never run again.
 *
 * The export path runs the same renderFrame from a fixed timestep instead. That
 * is the only difference between the two, and it is why they agree.
 */
/** Under about forty frames a second, averaged over this many frames, is "slow". */
const SLOW_FRAME_MS = 25;
const SLOW_WINDOW_FRAMES = 45;

export function usePreviewLoop(
  canvas: HTMLCanvasElement | null,
  project: Project,
  clock: PreviewClock,
  rig: RenderRig,
  media: MediaStore,
  /**
   * Called when playback has been missing frames for a while (D-112), so the
   * artboard can draw at a lower resolution. Null when it cannot go lower.
   */
  onSlow: (() => void) | null = null,
): DrawnScene | null {
  /*
   * What the loop last drew, published to React (B).
   *
   * The rig is scratch that the loop mutates, so nothing in React would ever
   * learn that a frame had happened — the selection layer read it once at
   * mount, found nothing, and never looked again. The record only changes
   * identity when the scene or its built layers change, so this sets state
   * rarely rather than once a frame.
   */
  const [drawn, setDrawn] = useState<DrawnScene | null>(null);
  const lastDrawn = useRef<DrawnScene | null>(null);
  const slow = useRef(onSlow);
  useEffect(() => { slow.current = onSlow; }, [onSlow]);

  useEffect(() => {
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      throw new Error('Artboard: could not acquire a 2D context. The editor cannot render.');
    }

    let frame = 0;
    let previous = performance.now();
    let cancelled = false;
    /** Frame gaps while playing, to notice a device that cannot keep up. */
    let gaps = 0;
    let gapTotal = 0;

    const tick = (now: number): void => {
      if (cancelled) return;
      const delta = now - previous;
      previous = now;

      if (clock.playing && slow.current) {
        // A hidden tab or a breakpoint is not slowness; cap what one gap can say.
        gapTotal += Math.min(delta, 100);
        gaps += 1;
        if (gaps >= SLOW_WINDOW_FRAMES) {
          if (gapTotal / gaps > SLOW_FRAME_MS) slow.current();
          gaps = 0;
          gapTotal = 0;
        }
      } else {
        gaps = 0;
        gapTotal = 0;
      }

      const timeMs = clock.tick(delta);

      /*
       * Past the end of the video there is nothing to draw — the last scene's
       * layers have all ended — so the artboard would go blank while the music
       * played on, which reads as a fault rather than as "past the end". It
       * holds the final frame instead; the dimmed region of the timeline is
       * what says where you actually are.
       */
      const videoMs = totalDurationMs(project);
      const renderMs = videoMs > 0 ? Math.min(timeMs, videoMs - 1) : timeMs;

      /*
       * Custom media decodes ahead of the playhead (D-051). Deliberately not
       * awaited: renderFrame is synchronous (§3A) and blocking the loop on a
       * decode would drop the whole editor to the decoder's pace. A frame that
       * has not landed draws a placeholder for a tick or two; the export path
       * does await, which is why its output is exact and this one is merely
       * smooth.
       */
      for (const demand of videoDemandsWithLead(project, renderMs)) {
        void media.prefetchVideo(demand.mediaId, demand.timeMs).catch((error: unknown) => {
          // §16: surface it. A decode that fails every frame would otherwise
          // be an overlay that is simply never there.
          console.error(`Could not decode custom media "${demand.mediaId}".`, error);
        });
      }

      renderFrame(ctx, project, renderMs, rig);

      // Identity comparison, not a deep one: renderFrame keeps the same object
      // until the scene or its layers actually change.
      if (rig.drawn !== lastDrawn.current) {
        lastDrawn.current = rig.drawn;
        setDrawn(rig.drawn);
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [canvas, project, clock, rig, media]);

  return drawn;
}
