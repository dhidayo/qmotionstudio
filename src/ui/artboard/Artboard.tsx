import { useLayoutEffect, useRef, useState } from 'react';
import { aspectValue, fitContain, renderSizeFor } from '@/core/math/aspect';
import type { RenderRig } from '@/core/render/rig';
import type { PreviewClock } from '@/core/time/clock';
import type { Project } from '@/document/types';
import type { MediaStore } from '@/media/store';
import { renderParams } from '@/dev/renderParams';
import { PLACEHOLDER_TEMPLATE_ID } from '@/document/defaults';
import { useEditor } from '@/state/store';
import { NO_ZOOM, useOverlays } from '@/ui/shell/overlays';
import { useLayout } from '@/ui/shell/useLayout';
import { usePreviewLoop } from './usePreviewLoop';
import { CanvasSelection } from './CanvasSelection';

/**
 * Preview renders at most this on the short edge regardless of display size.
 * A 5K monitor would otherwise have us shading 14 megapixels a frame to show a
 * picture that is about to be exported at 2.
 */
const MAX_PREVIEW_SHORT_EDGE = 1080;

/*
 * A phone previews at most at 2× and 720 on the short edge (D-112).
 *
 * A 3× phone screen asked for a 922×1640 canvas — one and a half megapixels
 * redrawn every frame, through blur passes that cost in proportion — and
 * played at under twenty frames a second on a mid-range phone. The picture
 * on a six-inch screen at 2× is indistinguishable from 3× while it moves; the
 * export renders at full size regardless, from its own rig.
 */
const PHONE_PREVIEW_SHORT_EDGE = 720;
const PHONE_MAX_DPR = 2;

/** How far the preview may step down on a phone that still cannot keep up. */
const QUALITY_STEPS = [1, 0.75, 0.5] as const;

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
  // only the resolution differs.
  const phone = useLayout() === 'phone';
  /*
   * Steps down, never back up, when playback on a phone keeps missing frames:
   * a steady picture a little softer beats a sharp one that stutters. Reset by
   * a reload, which is when a different phone could be holding it.
   */
  const [step, setStep] = useState(0);
  const quality = phone ? QUALITY_STEPS[step] ?? 1 : 1;
  const deviceDpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1;
  const dpr = (phone ? Math.min(deviceDpr, PHONE_MAX_DPR) : deviceDpr) * quality;
  // ?thumb= pins the backing store so `npm run thumbs` captures a consistent
  // size regardless of the window it happens to run in.
  const thumb = renderParams().thumbShortEdge;
  const ceiling = phone ? PHONE_PREVIEW_SHORT_EDGE : MAX_PREVIEW_SHORT_EDGE;
  const wanted = thumb ?? Math.min(Math.min(display.w, display.h) * dpr, ceiling);
  const backing = renderSizeFor(project.aspect, Math.max(2, Math.round(wanted)));

  // The test card draws itself and never records a scene; it is not "loading".
  const placeholder = project.scenes.every((scene) => scene.templateId === PLACEHOLDER_TEMPLATE_ID);
  const canStepDown = phone && thumb === null && step < QUALITY_STEPS.length - 1;
  const drawn = usePreviewLoop(canvas, project, clock, rig, media, canStepDown ? () => { setStep((n) => n + 1); } : null);
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
      {display.w > 0 && (
        /* The chrome has to sit exactly over the canvas, so the two share a
           box rather than each being placed against the stage separately. */
        <div
          className="relative"
          style={{
            width: `${display.w}px`,
            height: `${display.h}px`,
            ...(zoomed ? { transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`, transformOrigin: '0 0' } : {}),
          }}
        >
          <canvas
            ref={setCanvas}
            width={backing.w}
            height={backing.h}
            aria-label={`Preview, ${project.aspect}`}
            style={{
              width: `${display.w}px`,
              height: `${display.h}px`,
              borderRadius: 'var(--r-md)',
              boxShadow: 'var(--shadow-lg)',
              display: 'block',
            }}
          />
          <CanvasSelection project={project} drawn={drawn} width={display.w} />
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
