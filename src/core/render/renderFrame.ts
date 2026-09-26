import type { Ctx2D, Layer, Palette, Size } from '@/core/types';
import type { Overlay, Project, Scene } from '@/document/types';
import { makeViewport, type Viewport } from '@/core/math/aspect';
import { activeOverlaysAt, activeScenesAt, sceneSpans, type SceneSpan } from '@/document/select/timeline';
import { TextMeasurer } from '@/core/text/measure';
import { createBuildContext } from '@/templates/buildContext';
import { peekTemplate } from '@/templates/registry';
import { structureKey } from '@/templates/schema';
import { buildDemoScene } from '@/templates/_demo/demoScene';
import { drawLayer, drawLayers } from './drawLayer';
import { drawGrain, drawVignette, drawWatermark } from './postFx';
import { drawPlaceholderFrame } from './placeholder';
import { overlayKey, overlayLayer } from './overlays';
import { applySlotTransforms, hasSlotTransforms, slotTransformKey } from './slots';
import { transitionFn } from './transitions';
import type { DrawContext } from './drawContext';
import type { DrawnScene, RenderRig } from './rig';

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
 * §6.4's five steps, in order:
 *   1. resolve the active scene, or the two that overlap during a transition;
 *   2. draw each into a scene buffer at its own local time;
 *   3. composite the buffers through the transition function;
 *   4. draw the active overlays, ordered by track then z;
 *   5. frame-level post-effects.
 *
 * Step 2 has a fast path. With one active scene there is nothing to composite,
 * so it draws straight to the output and the buffers are never touched — which
 * is every frame of Showcase mode and most frames of an ad.
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

  /**
   * The project's own coordinate space, which overlays and post-effects live
   * in. Scenes get their own viewport from their template's designSize inside
   * `drawScene` — two scenes in one ad may not share one, and an overlay must
   * not move because the scene under it changed.
   */
  const vp = makeViewport(project.aspect, px, PROJECT_DESIGN);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, px.w, px.h);

  //  1. Resolve which scene(s) are active — two during a transition overlap.
  const spans = sceneSpans(project.scenes);
  const active = activeScenesAt(spans, globalTimeMs);

  const palette = active?.current.scene.inputs.look.palette ?? project.brand.palette;

  const dc: DrawContext = {
    ctx,
    palette,
    media: rig.media,
    measurer: new TextMeasurer(ctx, rig.textCache),
    depth: 0,
  };

  if (!active) {
    ctx.setTransform(vp.scale, 0, 0, vp.scale, 0, 0);
    drawPlaceholderFrame(ctx, vp, palette, globalTimeMs);
  } else if (!active.incoming) {
    //  2a. One scene: straight to the output, no buffer round trip.
    drawScene(ctx, project, active.current, globalTimeMs, rig, px, true);
  } else {
    //  2b. Two scenes, each into its own buffer …
    rig.buffers.resize(px);
    const a = rig.buffers.clear(0);
    const b = rig.buffers.clear(1);

    drawScene(a.ctx, project, active.current, globalTimeMs, rig, px, true);
    drawScene(b.ctx, project, active.incoming, globalTimeMs, rig, px, false);

    //  3. … composited through the transition.
    const transition = active.incoming.transitionIn;
    const composite = transitionFn(transition?.kind ?? 'crossFade');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    composite(ctx, a.canvas, b.canvas, active.progress, {
      size: px,
      direction: transition?.direction ?? 'left',
      scratch: rig.buffers.get(2).canvas,
    });
  }

  //  4. Overlays, in the project's own space, over whatever the scenes produced.
  ctx.setTransform(vp.scale, 0, 0, vp.scale, 0, 0);
  drawOverlays(dc, project.overlays, globalTimeMs, rig, vp);

  //  5. Frame post-effects. Grain and vignette belong to the scene's look, so
  //     they are applied per scene inside drawScene — a crossfade between two
  //     looks has to blend them, not apply the incoming one to both. The
  //     watermark belongs to the *frame*, and goes over everything including
  //     the overlays, or it would be something a user could cover up.
  if (rig.watermark()) drawWatermark(ctx, vp.design);

  ctx.setTransform(1, 0, 0, 1, 0, 0);

  rig.stats.frameCount += 1;
  rig.stats.lastFrameMs = now() - started;
}

/**
 * Design space when nothing else says otherwise.
 *
 * Every template ships 1080×1080 today, and overlays need a stable space that
 * does not shift when the scene under them changes template.
 */
const PROJECT_DESIGN: Size = { w: 1080, h: 1080 };

/**
 * Draws one scene, with its own look, into `target`.
 *
 * The target is either the output canvas (one active scene) or a scene buffer
 * (a transition). Both are the same pixel size, so the scene cannot tell which
 * it got — which is what keeps the transition path and the fast path identical
 * frame for frame.
 */
function drawScene(
  target: Ctx2D,
  project: Project,
  span: SceneSpan,
  globalTimeMs: number,
  rig: RenderRig,
  px: Size,
  /** Only the scene under the playhead is recorded for editing. */
  primary: boolean,
): void {
  const { scene } = span;
  const template = scene.templateId.startsWith('__') ? null : peekTemplate(scene.templateId);
  const design = template?.kind === 'scene' ? template.designSize : PROJECT_DESIGN;
  const vp = makeViewport(project.aspect, px, design);

  target.setTransform(vp.scale, 0, 0, vp.scale, 0, 0);

  const look = scene.inputs.look;
  const palette = look.palette;

  const dc: DrawContext = {
    ctx: target,
    palette,
    media: rig.media,
    measurer: new TextMeasurer(target, rig.textCache),
    depth: 0,
  };

  /**
   * D-006: the global speed multiplier is a time remap applied before layers
   * are evaluated, never baked into keyframes. That is what lets the speed
   * slider repaint without rebuilding the template.
   */
  const rawLocalMs = globalTimeMs - span.startMs;
  const localTimeMs = rawLocalMs * look.speed;

  if (scene.templateId === '__placeholder__') {
    drawPlaceholderFrame(target, vp, palette, localTimeMs);
    if (primary) rig.drawn = null;
  } else {
    const built = memoisedLayers(rig, vp, scene, palette);
    if (built) drawLayers(dc, built.placed, localTimeMs);
    if (primary) rig.drawn = recordDrawn(rig.drawn, scene.id, built?.base ?? null, vp.design);
  }

  drawGrain(target, vp.design, look.grain, rawLocalMs);
  drawVignette(target, vp.design, look.vignette);
}

/**
 * Keeps the previous record when nothing about it has changed.
 *
 * Allocating a fresh object every frame would make its identity useless as a
 * change signal and would have the editor re-rendering sixty times a second to
 * be told the same thing.
 */
function recordDrawn(
  previous: DrawnScene | null,
  sceneId: string,
  layers: readonly Layer[] | null,
  design: Size,
): DrawnScene | null {
  if (!layers) return null;
  if (
    previous &&
    previous.sceneId === sceneId &&
    previous.layers === layers &&
    previous.design.w === design.w &&
    previous.design.h === design.h
  ) {
    return previous;
  }
  return { sceneId, layers, design: { w: design.w, h: design.h } };
}

/** §6.4 step 4. Each overlay's layer is memoised on its own content. */
function drawOverlays(
  dc: DrawContext,
  overlays: readonly Overlay[],
  globalTimeMs: number,
  rig: RenderRig,
  vp: Viewport,
): void {
  if (overlays.length === 0) return;

  for (const overlay of activeOverlaysAt(overlays, globalTimeMs)) {
    const layer = memoisedOverlay(rig, overlay, vp.design);
    // Overlay time is relative to the overlay, not the scene (§6.1).
    if (layer) drawLayer(dc, layer, globalTimeMs - overlay.startMs);
  }
}

function memoisedOverlay(rig: RenderRig, overlay: Overlay, design: Size): Layer | null {
  const key = overlayKey(overlay, design);
  const hit = rig.overlayCache.get(key);
  if (hit) return hit;

  let counter = 0;
  const layer = overlayLayer(overlay, {
    design,
    id: (prefix) => `${overlay.id}-${prefix}-${counter++}`,
  });
  if (!layer) return null;

  rig.overlayCache.set(key, layer);
  return layer;
}

/**
 * §3B: build() runs once per (template, structural inputs, aspect) change.
 *
 * The key comes from structureKey, which deliberately excludes everything
 * cosmetic — colours resolve at draw time through Paint roles (D-006), so
 * dragging a colour picker repaints without rebuilding. It is geometry that
 * invalidates a build, not the look.
 *
 * Returns null while a template is still being fetched. The registry is lazy
 * (D-029), so the first frame after picking a template may have nothing to
 * draw yet; that is one blank frame, not an error.
 */
function memoisedLayers(
  rig: RenderRig,
  vp: Viewport,
  scene: Scene,
  palette: Palette,
): { base: readonly Layer[]; placed: readonly Layer[] } | null {
  const key = structureKey(scene.templateId, scene.inputs, vp.aspect, vp.design, scene.durationMs);

  const hit = rig.layerCache.get(key);
  if (hit) return { base: hit, placed: placed(rig, scene, hit, key, vp.design) };

  const buildStarted = now();
  const buildCtx = createBuildContext({
    design: vp.design,
    safe: vp.safe,
    palette,
    durationMs: scene.durationMs,
    measureContext: measureSurface(),
  });

  let layers: Layer[];
  if (scene.templateId === '__demo__') {
    layers = buildDemoScene(buildCtx);
  } else {
    const template = peekTemplate(scene.templateId);
    if (!template) return null;
    if (template.kind !== 'scene') {
      throw new Error(`Scene "${scene.id}" references ad template "${scene.templateId}".`);
    }
    layers = template.build(scene.inputs, buildCtx);
  }

  rig.stats.lastBuildMs = now() - buildStarted;
  rig.stats.buildCount += 1;

  rig.layerCache.set(key, layers);
  return { base: layers, placed: placed(rig, scene, layers, key, vp.design) };
}

/**
 * The user's nudges (B), composed over the template's output.
 *
 * Applied *after* the memo rather than folded into `structureKey`, which
 * matters: a drag changes these values on every pointer move, and putting them
 * in the build key would re-run `build()` — with its text measurement — sixty
 * times a second for the duration of the drag. That is §16's forbidden
 * `build()` in the render loop wearing a different hat.
 *
 * With nothing nudged this returns the cached array untouched, so a project
 * that never uses the feature pays nothing for it.
 */
function placed(
  rig: RenderRig,
  scene: Scene,
  layers: readonly Layer[],
  baseKey: string,
  design: Size,
): readonly Layer[] {
  const { slotTransforms } = scene.inputs;
  if (!hasSlotTransforms(slotTransforms)) return layers;

  const key = `${baseKey}|${slotTransformKey(slotTransforms)}`;
  const hit = rig.placedCache.get(scene.id);
  if (hit && hit.key === key) return hit.layers;

  const next = applySlotTransforms(layers, slotTransforms, design);
  rig.placedCache.set(scene.id, { key, layers: next });
  return next;
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
