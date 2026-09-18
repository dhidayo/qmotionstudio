import { useEffect } from 'react';
import type { Project } from '@/document/types';
import type { PreviewClock } from '@/core/time/clock';
import type { RenderRig } from '@/core/render/rig';
import { renderFrame } from '@/core/render/renderFrame';

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
      renderFrame(ctx, project, timeMs, rig);

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [canvas, project, clock, rig]);
}
