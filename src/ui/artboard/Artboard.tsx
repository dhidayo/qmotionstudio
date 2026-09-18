import { useLayoutEffect, useRef, useState } from 'react';
import { aspectValue, fitContain, renderSizeFor } from '@/core/math/aspect';
import type { RenderRig } from '@/core/render/rig';
import type { PreviewClock } from '@/core/time/clock';
import type { Project } from '@/document/types';
import { usePreviewLoop } from './usePreviewLoop';

/**
 * Preview renders at most this on the short edge regardless of display size.
 * A 5K monitor would otherwise have us shading 14 megapixels a frame to show a
 * picture that is about to be exported at 2.
 */
const MAX_PREVIEW_SHORT_EDGE = 1080;

type Props = { project: Project; clock: PreviewClock; rig: RenderRig };

export function Artboard({ project, clock, rig }: Props): React.JSX.Element {
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
  const dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1;
  const wanted = Math.min(Math.min(display.w, display.h) * dpr, MAX_PREVIEW_SHORT_EDGE);
  const backing = renderSizeFor(project.aspect, Math.max(2, Math.round(wanted)));

  usePreviewLoop(canvas, project, clock, rig);

  return (
    <div ref={hostRef} className="relative grid h-full w-full place-items-center overflow-hidden p-6">
      {display.w > 0 && (
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
      )}
    </div>
  );
}
