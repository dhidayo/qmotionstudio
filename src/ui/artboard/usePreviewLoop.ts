import { useEffect } from 'react';
import type { Project } from '@/document/types';
import type { PreviewClock } from '@/core/time/clock';
import type { RenderRig } from '@/core/render/rig';
import { renderFrame } from '@/core/render/renderFrame';
import { videoDemandsWithLead } from '@/document/select/media';
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
export function usePreviewLoop(
  canvas: HTMLCanvasElement | null,
  project: Project,
  clock: PreviewClock,
  rig: RenderRig,
  media: MediaStore,
): void {
  useEffect(() => {
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      throw new Error('Artboard: could not acquire a 2D context. The editor cannot render.');
    }

    let frame = 0;
    let previous = performance.now();
    let cancelled = false;

    const tick = (now: number): void => {
      if (cancelled) return;
      const delta = now - previous;
      previous = now;

      const timeMs = clock.tick(delta);

      /*
       * Custom media decodes ahead of the playhead (D-051). Deliberately not
       * awaited: renderFrame is synchronous (§3A) and blocking the loop on a
       * decode would drop the whole editor to the decoder's pace. A frame that
       * has not landed draws a placeholder for a tick or two; the export path
       * does await, which is why its output is exact and this one is merely
       * smooth.
       */
      for (const demand of videoDemandsWithLead(project, timeMs)) {
        void media.prefetchVideo(demand.mediaId, demand.timeMs).catch((error: unknown) => {
          // §16: surface it. A decode that fails every frame would otherwise
          // be an overlay that is simply never there.
          console.error(`Could not decode custom media "${demand.mediaId}".`, error);
        });
      }

      renderFrame(ctx, project, timeMs, rig);

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [canvas, project, clock, rig, media]);
}
