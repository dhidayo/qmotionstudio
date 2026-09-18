import type { Ctx2D, Layer, Size } from '@/core/types';
import type { Project } from '@/document/types';
import { makeViewport, type Viewport } from '@/core/math/aspect';
import { activeScenesAt, sceneSpans } from '@/document/select/timeline';
import { TextMeasurer } from '@/core/text/measure';
import { createBuildContext } from '@/templates/buildContext';
import { buildDemoScene } from '@/templates/_demo/demoScene';
import { drawLayers } from './drawLayer';
import { drawPlaceholderFrame } from './placeholder';
import type { DrawContext } from './drawContext';
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

  // M2 reads designSize from the active scene's template.
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

  const scene = active?.current.scene;
  const palette = scene?.inputs.look.palette ?? project.brand.palette;
  const localTimeMs = active ? globalTimeMs - active.current.startMs : globalTimeMs;

  const dc: DrawContext = {
    ctx,
    palette,
    media: rig.media,
    measurer: new TextMeasurer(ctx, rig.textCache),
    depth: 0,
  };

  if (scene?.templateId === '__placeholder__') {
    drawPlaceholderFrame(ctx, vp, palette, localTimeMs);
  } else {
    //  2. Fetch memoised layers, then draw. build() is never called per frame
    //     (§3B, §16) — only when the cache key changes.
    const durationMs = active?.current.scene.durationMs ?? 10_000;
    const layers = memoisedLayers(rig, vp, palette, durationMs);
    drawLayers(dc, layers, localTimeMs);
  }

  //  3. Composite scene buffers through the transition (M5).
  //  4. Overlays, ordered by track then z (M5).
  //  5. Persistent brand elements and the free-tier watermark (M7).

  ctx.setTransform(1, 0, 0, 1, 0, 0);

  rig.stats.frameCount += 1;
  rig.stats.lastFrameMs = now() - started;
}

/**
 * §3B: build() runs once per (template, inputs, aspect) change and is memoised.
 *
 * The cache key deliberately excludes the palette — colours resolve at draw
 * time through Paint roles (D-006), so dragging a colour picker repaints
 * without rebuilding. It is the geometry that invalidates a build, not the look.
 */
function memoisedLayers(
  rig: RenderRig,
  vp: Viewport,
  palette: DrawContext['palette'],
  durationMs: number,
): readonly Layer[] {
  const key = `demo|${vp.aspect}|${Math.round(vp.design.w)}x${Math.round(vp.design.h)}|${durationMs}`;
  const hit = rig.layerCache.get(key);
  if (hit) return hit;

  const buildStarted = now();
  const buildCtx = createBuildContext({
    design: vp.design,
    safe: vp.safe,
    palette,
    durationMs,
    measureContext: measureSurface(),
  });
  const layers = buildDemoScene(buildCtx);
  rig.stats.lastBuildMs = now() - buildStarted;
  rig.stats.buildCount += 1;

  rig.layerCache.set(key, layers);
  return layers;
}

/**
 * A 1×1 offscreen context used only for measuring during build().
 *
 * build() must not measure against the surface it is about to draw into: it
 * would leave font and letterSpacing state behind, and on the export path the
 * two may not even be the same canvas.
 *
 * Module-level, and safe to be: unlike the scene buffers (which hold frame
 * content across the composite step, and which D-001 therefore puts in the
 * rig), this is scratch used entirely within one synchronous call. Preview and
 * export run in separate realms with separate module instances, and nothing
 * re-enters a render mid-frame.
 */
let measureCtx: Ctx2D | null = null;

function measureSurface(): Ctx2D {
  if (measureCtx) return measureCtx;
  const canvas = new OffscreenCanvas(1, 1);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('renderFrame: could not acquire a 2D context for text measurement.');
  measureCtx = ctx;
  return ctx;
}

function now(): number {
  return globalThis.performance.now();
}

export type { Viewport };
