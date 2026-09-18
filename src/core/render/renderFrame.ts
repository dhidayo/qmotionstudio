import type { Ctx2D, Size } from '@/core/types';
import type { Project } from '@/document/types';
import { makeViewport, type Viewport } from '@/core/math/aspect';
import { activeScenesAt, sceneSpans } from '@/document/select/timeline';
import { drawPlaceholderFrame } from './placeholder';
import type { RenderRig } from './rig';

/**
 * THE render function (§3A, amended by D-001).
 *
 *   - Deterministic: same (project, time, rig contents) → same pixels.
 *   - No React, no DOM, no module-level mutable state.
 *   - Preview drives it from requestAnimationFrame; export drives it from a
 *     fixed timestep. The instant those two diverge, exports stop matching
 *     previews — so they call this one function and nothing else.
 *
 * `rig` carries the scene buffers and caches. It is a parameter rather than a
 * module singleton so preview and export can run concurrently without writing
 * over each other's scratch surfaces.
 *
 * Until templates land at M2 this draws the diagnostic frame; the compositor
 * structure below is already the one §6.4 specifies.
 */
export function renderFrame(
  ctx: Ctx2D,
  project: Project,
  globalTimeMs: number,
  rig: RenderRig,
): void {
  const started = now();

  const px: Size = { w: ctx.canvas.width, h: ctx.canvas.height };
  if (px.w <= 0 || px.h <= 0) return;

  // M2 reads designSize from the active scene's template. The placeholder's
  // square reference is what every template will be measured against.
  const designSize: Size = { w: 1080, h: 1080 };
  const vp = makeViewport(project.aspect, px, designSize);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, px.w, px.h);

  // One uniform scale for the whole frame (§6.5). Everything downstream of
  // this line works in design units and never thinks about pixels again.
  ctx.setTransform(vp.scale, 0, 0, vp.scale, 0, 0);

  //  1. Resolve which scene(s) are active — two during a transition overlap.
  const spans = sceneSpans(project.scenes);
  const active = activeScenesAt(spans, globalTimeMs);

  //  2–3. Draw each active scene to a buffer and composite through the
  //       transition. Arrives with the template system (M2) and sequencing (M5).
  //  4.   Overlays, ordered by track then z (M5).
  //  5.   Persistent brand elements and the free-tier watermark (M7).
  const palette = active?.current.scene.inputs.look.palette ?? project.brand.palette;
  const localTimeMs = active ? globalTimeMs - active.current.startMs : globalTimeMs;
  drawPlaceholderFrame(ctx, vp, palette, localTimeMs);

  ctx.setTransform(1, 0, 0, 1, 0, 0);

  rig.stats.frameCount += 1;
  rig.stats.lastFrameMs = now() - started;
}

/** Present on window, self and workers alike; avoids reaching for `performance` via globals. */
function now(): number {
  return globalThis.performance.now();
}

export type { Viewport };
