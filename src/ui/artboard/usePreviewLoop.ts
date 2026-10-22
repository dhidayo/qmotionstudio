import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Project } from '@/document/types';
import type { PreviewClock } from '@/core/time/clock';
import type { DrawnScene, RenderRig } from '@/core/render/rig';
import { renderFrame } from '@/core/render/renderFrame';
import { videoDemandsWithLead } from '@/document/select/media';
import { totalDurationMs } from '@/document/select/timeline';
import { DEMO_TEMPLATE_ID, PLACEHOLDER_TEMPLATE_ID } from '@/document/defaults';
import type { MediaStore } from '@/media/store';
import { peekTemplate } from '@/templates/registry';
import { FrameMeter } from './frameMeter';
import type { PreviewSizes } from './previewResolution';

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

/**
 * A paused picture is redrawn at least this often even when nothing seems to
 * have changed (D-154) — the safety net under the list of things that can.
 */
const PAUSED_REDRAW_MS = 500;

/**
 * Whether every scene's design has arrived (D-029 fetches them lazily). The
 * scene under the playhead says so by drawing nothing, but the one coming in
 * on a transition does not, and its arrival changes the picture.
 */
function designsLoaded(project: Project): boolean {
  return project.scenes.every(({ templateId }) =>
    templateId === PLACEHOLDER_TEMPLATE_ID || templateId === DEMO_TEMPLATE_ID || peekTemplate(templateId) !== null);
}

export function usePreviewLoop(
  canvas: HTMLCanvasElement | null,
  project: Project,
  clock: PreviewClock,
  rig: RenderRig,
  media: MediaStore,
  /**
   * The canvas backing store while playing and while paused (D-154). The loop
   * owns it: it changes size inside the animation frame that draws at the new
   * size, so the picture never shows a cleared canvas in between.
   */
  sizes: PreviewSizes,
  /**
   * Called when playback has been missing frames for a while (D-112, D-154),
   * so the artboard can draw at a lower resolution. Null when it cannot go lower.
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
  // Read by the loop every frame, so a new size never restarts it.
  const wanted = useRef(sizes);
  useLayoutEffect(() => { wanted.current = sizes; }, [sizes]);
  // Kept across restarts: what it has learnt about the screen stays true.
  const meterRef = useRef<FrameMeter | null>(null);

  useEffect(() => {
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      throw new Error('Artboard: could not acquire a 2D context. The editor cannot render.');
    }

    meterRef.current ??= new FrameMeter();
    const meter = meterRef.current;
    // A document change is an edit, not playback: the frames around it say
    // nothing about the device.
    meter.reset();

    let frame = 0;
    let previous = performance.now();
    let cancelled = false;

    /*
     * What the paused picture was last drawn from (D-154).
     *
     * Paused, the same time draws the same pixels (§3A), so redrawing a
     * megapixel and a half sixty times a second only made the editor's own
     * controls slower to respond. A frame is drawn when anything that can
     * change it has: the time, the canvas size, a photo decoding, a font
     * loading or added, a design arriving (which also empties the layer cache),
     * the watermark — and the document, which restarts this effect. Anything
     * still on its way (a scene's design, a font, a video's frames) draws every
     * frame until it is there, and at least every PAUSED_REDRAW_MS regardless.
     */
    let drawnAt = Number.NEGATIVE_INFINITY;
    let drawnMs = Number.NaN;
    let drawnRevision = -1;
    let drawnFontsLoaded = false;
    let drawnFontCount = -1;
    let drawnBuilt = -1;
    let drawnWatermark: boolean | null = null;
    // Once true it stays true: the document is fixed for this effect's life.
    let designsHere = false;

    const tick = (now: number): void => {
      if (cancelled) return;
      const delta = now - previous;
      previous = now;

      const wasPlaying = clock.playing;
      const timeMs = clock.tick(delta);
      // Read after the tick: a clock that plays once stops by itself at the end.
      const playing = clock.playing;

      // The size for what the picture is doing now, applied in the frame that
      // draws at it. Exact ratios (previewResolution) keep the design box the
      // same, so this never rebuilds the template or moves the selection.
      const size = wanted.current[playing ? 'playing' : 'paused'];
      const resized = canvas.width !== size.w || canvas.height !== size.h;
      if (resized) {
        canvas.width = size.w;
        canvas.height = size.h;
      }

      if (wasPlaying && playing && !resized && document.visibilityState === 'visible') {
        const verdict = meter.push(delta);
        if (verdict !== 'ignored') {
          rig.stats.playedFrames += 1;
          if (verdict === 'late') rig.stats.droppedFrames += 1;
        }
        if (meter.takeSlow()) slow.current?.();
      } else {
        meter.reset();
      }

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
      const demands = videoDemandsWithLead(project, renderMs);
      for (const demand of demands) {
        void media.prefetchVideo(demand.mediaId, demand.timeMs).catch((error: unknown) => {
          // §16: surface it. A decode that fails every frame would otherwise
          // be an overlay that is simply never there.
          console.error(`Could not decode custom media "${demand.mediaId}".`, error);
        });
      }

      const fonts = document.fonts;
      const fontsLoaded = fonts.status === 'loaded';
      const watermark = rig.watermark();
      designsHere ||= designsLoaded(project);
      const unchanged =
        !playing &&
        !resized &&
        rig.drawn !== null &&
        designsHere &&
        demands.length === 0 &&
        // Both: a frame drawn while a font was loading used a stand-in for it.
        fontsLoaded &&
        drawnFontsLoaded &&
        fonts.size === drawnFontCount &&
        renderMs === drawnMs &&
        media.revision === drawnRevision &&
        rig.layerCache.size === drawnBuilt &&
        watermark === drawnWatermark &&
        now - drawnAt < PAUSED_REDRAW_MS;

      if (!unchanged) {
        renderFrame(ctx, project, renderMs, rig);
        drawnAt = now;
        drawnMs = renderMs;
        drawnRevision = media.revision;
        drawnFontsLoaded = fontsLoaded;
        drawnFontCount = fonts.size;
        // Read after drawing, which may itself have built a scene.
        drawnBuilt = rig.layerCache.size;
        drawnWatermark = watermark;
        rig.stats.backingW = canvas.width;
        rig.stats.backingH = canvas.height;

        // Identity comparison, not a deep one: renderFrame keeps the same object
        // until the scene or its layers actually change.
        if (rig.drawn !== lastDrawn.current) {
          lastDrawn.current = rig.drawn;
          setDrawn(rig.drawn);
        }
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
