import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { aspectValue, fitContain } from '@/core/math/aspect';
import type { RenderRig } from '@/core/render/rig';
import type { PreviewClock } from '@/core/time/clock';
import type { Project } from '@/document/types';
import type { MediaStore } from '@/media/store';
import { renderParams } from '@/dev/renderParams';
import { PLACEHOLDER_TEMPLATE_ID } from '@/document/defaults';
import { useEditor } from '@/state/store';
import { NO_ZOOM, useOverlays } from '@/ui/shell/overlays';
import { useLayout } from '@/ui/shell/useLayout';
import { useDevicePixelRatio } from '@/ui/hooks/useDevicePixelRatio';
import { usePreviewLoop } from './usePreviewLoop';
import { CanvasSelection } from './CanvasSelection';
import { RestFade } from './RestFade';
import { QUALITY_STEPS, previewSizes } from './previewResolution';

type Props = {
  project: Project;
  clock: PreviewClock;
  rig: RenderRig;
  media: MediaStore;
  /** Room round the picture. A phone has none to spare (D-109). */
  padding?: number;
};

export function Artboard({ project, clock, rig, media, padding = 24 }: Props): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  // Measure the available stage. Only fires on resize, so it never competes
  // with the render loop.
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setBox({ w: Math.floor(width), h: Math.floor(height) });
    });
    observer.observe(host);
    return () => { observer.disconnect(); };
  }, []);

  const ratio = aspectValue(project.aspect);
  const display = fitContain(box, ratio);

  // Backing store: device pixels, capped. renderFrame derives one uniform scale
  // from whatever size it finds, so preview and export lay out identically —
  // only the resolution differs. Smaller while playing on a computer, sharp
  // when paused (D-154); the loop applies whichever the clock calls for.
  const phone = useLayout() === 'phone';
  /*
   * Steps down, never back up, when playback keeps missing frames — on any
   * device since D-154, a phone only before: a steady picture a little softer
   * beats a sharp one that stutters. Reset by a reload, which is when a
   * different device could be holding it, and by a new frame shape, which
   * draws a different number of pixels.
   */
  const [slow, setSlow] = useState({ aspect: project.aspect, step: 0 });
  const step = slow.aspect === project.aspect ? slow.step : 0;
  const dpr = useDevicePixelRatio();
  // ?thumb= pins the backing store so `npm run thumbs` captures a consistent
  // size regardless of the window it happens to run in.
  const thumb = renderParams().thumbShortEdge;
  const sizes = useMemo(
    () => previewSizes({ aspect: project.aspect, display: { w: display.w, h: display.h }, dpr, phone, step, thumb }),
    [project.aspect, display.w, display.h, dpr, phone, step, thumb],
  );
  // The stage's box, or a hair inside it so the paused picture is drawn one to one.
  const shown = sizes.shown;

  // The test card draws itself and never records a scene; it is not "loading".
  const placeholder = project.scenes.every((scene) => scene.templateId === PLACEHOLDER_TEMPLATE_ID);
  const canStepDown = thumb === null && step < QUALITY_STEPS.length - 1;
  const aspect = project.aspect;
  const drawn = usePreviewLoop(
    canvas, project, clock, rig, media, sizes,
    canStepDown ? () => { setSlow({ aspect, step: step + 1 }); } : null,
  );
  // A pinch on a phone zooms the view, never the document (D-110).
  const zoom = useOverlays((o) => o.viewZoom);
  const setZoom = useOverlays((o) => o.setViewZoom);
  const zoomed = zoom.scale !== 1;

  return (
    <div
      ref={hostRef}
      className="relative grid h-full w-full place-items-center overflow-hidden"
      style={{ padding }}
      /*
       * Pressing the empty stage round the picture puts down whatever was
       * selected (point 9) — the picture's own edge is not the only "outside".
       */
      onPointerDown={(event) => {
        if (event.target !== event.currentTarget) return;
        const s = useEditor.getState();
        s.selectOverlay(null);
        s.selectSlot(null);
        s.selectLogo(false);
      }}
    >
      {shown.w > 0 && (
        /* The chrome has to sit exactly over the canvas, so the two share a
           box rather than each being placed against the stage separately. */
        <div
          className="relative"
          style={{
            width: `${shown.w}px`,
            height: `${shown.h}px`,
            ...(zoomed ? { transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`, transformOrigin: '0 0' } : {}),
          }}
        >
          {/* No width or height here: the loop sizes the backing store, in
              the frame that draws at the new size, so it never flashes blank
              (D-154). */}
          <canvas
            ref={setCanvas}
            aria-label={`Preview, ${project.aspect}`}
            style={{
              width: `${shown.w}px`,
              height: `${shown.h}px`,
              borderRadius: 'var(--r-md)',
              boxShadow: 'var(--shadow-lg)',
              display: 'block',
            }}
          />
          <RestFade canvas={canvas} clock={clock} />
          <CanvasSelection project={project} drawn={drawn} width={shown.w} />
          {/* Said while the design's code is still arriving, so a slow
              connection shows progress rather than an empty frame (D-112). */}
          {drawn === null && thumb === null && !placeholder && (
            <div
              role="status"
              data-canvas-loading
              className="pointer-events-none absolute inset-0 grid place-items-center text-[13px]"
              style={{ color: 'rgb(255 255 255 / 0.75)' }}
            >
              <span className="flex items-center gap-2">
                <span aria-hidden className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Loading design…
              </span>
            </div>
          )}
        </div>
      )}
      {zoomed && (
        <button
          type="button"
          onClick={() => { setZoom(NO_ZOOM); }}
          aria-label="Fit the picture to the screen"
          className="tabular absolute right-2 top-2 rounded-full border border-edge bg-panel px-2.5 py-1 text-[12px] font-semibold"
          style={{ boxShadow: 'var(--shadow-md)' }}
        >
          {Math.round(zoom.scale * 100)}% · Fit
        </button>
      )}
    </div>
  );
}
