import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Aspect, Size } from '@/core/types';
import { aspectValue, fitContain, renderSizeFor } from '@/core/math/aspect';
import { createRenderRig, disposeRenderRig } from '@/core/render/rig';
import { PreviewClock } from '@/core/time/clock';
import { totalDurationMs } from '@/document/select/timeline';
import type { Project } from '@/document/types';
import { watermarked } from '@/entitlements';
import { usePreviewLoop } from '@/ui/artboard/usePreviewLoop';
import { useMediaStore } from '@/ui/media/MediaProvider';

/**
 * A design playing live, in the project's own frame shape (D-160).
 *
 * "When I click choose a design, it should take the aspect ratio when it is
 * telling me to select it." The recorded loops were made in each design's
 * first shape, so at 4:5 they showed a 9:16 picture boxed inside a 4:5 frame.
 * This draws the trial project — the person's photos, words, look and logo in
 * the design — with the real renderer, exactly as the canvas will once it is
 * picked: an artboard with nothing to select, zoom or drag.
 *
 * The frame and the design's still in that shape show at once; the live
 * picture fades in over the still once `project` is ready and its first frame
 * is drawn, so the picture is never empty and never jumps.
 */
export function LivePreview({
  project,
  aspect,
  still,
  maxShortEdge,
  rounded = false,
}: {
  /** What to play; null while it is still being worked out, which shows the still alone. */
  project: Project | null;
  aspect: Aspect;
  /** The design's still in this frame shape, shown until the first frame lands. */
  still: string;
  /**
   * The most pixels to draw on the short edge. The editor's canvas still
   * draws underneath while this plays, so a preview spends less than it does.
   */
  maxShortEdge: number;
  /** A picture standing on its own, as the large preview's is, gets the artboard's corners and shadow. */
  rounded?: boolean;
}): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Size>({ w: 0, h: 0 });
  // The project whose first frame is on the canvas; another one fades back to the still.
  const [drawnFor, setDrawnFor] = useState<Project | null>(null);
  const live = project !== null && drawnFor === project;

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setBox({ w: Math.floor(entry.contentRect.width), h: Math.floor(entry.contentRect.height) });
    });
    observer.observe(host);
    return () => { observer.disconnect(); };
  }, []);

  const display = fitContain(box, aspectValue(aspect));
  const deviceDpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1;
  const wanted = Math.min(Math.min(display.w, display.h) * Math.min(deviceDpr, 2), maxShortEdge);
  const backing = renderSizeFor(aspect, Math.max(2, Math.round(wanted)));
  const corners = rounded ? { borderRadius: 'var(--r-md)', boxShadow: 'var(--shadow-lg)' } : {};
  const fade = { transition: 'opacity 160ms ease-out' };

  return (
    <div ref={hostRef} className="absolute inset-0 grid place-items-center">
      {display.w > 0 && (
        <div
          className="relative overflow-hidden"
          data-preview-frame={aspect}
          style={{ width: `${Math.round(display.w)}px`, height: `${Math.round(display.h)}px`, ...corners }}
        >
          <img src={still} alt="" decoding="async" className="absolute inset-0 size-full object-cover" style={{ opacity: live ? 0 : 1, ...fade }} />
          {project !== null && (
            <LiveCanvas project={project} backing={backing} visible={live} onDrawn={setDrawnFor} />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The canvas and its render loop. Its own clock and rig (D-001: one rig per
 * renderer), so it never disturbs the editor's caches or transport; both go
 * when it does.
 */
function LiveCanvas({
  project,
  backing,
  visible,
  onDrawn,
}: {
  project: Project;
  backing: Size;
  visible: boolean;
  /** Told once a frame of `project` is on the canvas. */
  onDrawn: (project: Project) => void;
}): React.JSX.Element {
  const media = useMediaStore();
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  // Loops, so a design can be watched as long as the person likes.
  const clock = useMemo(() => new PreviewClock(0, { loop: true }), []);
  // The editor's watermark rule (§12): what is previewed is what exports.
  const rig = useMemo(() => createRenderRig(media, watermarked), [media]);
  useEffect(() => () => { disposeRenderRig(rig); }, [rig]);

  useEffect(() => {
    clock.setDuration(totalDurationMs(project));
    clock.seek(0);
    clock.play();
    return () => { clock.pause(); };
  }, [clock, project]);

  // One fixed size, playing or paused: a preview is small already (D-154 owns the backing store in the loop).
  const { w, h } = backing;
  const sizes = useMemo(() => {
    const size = { w, h };
    return { playing: size, paused: size, shown: size };
  }, [w, h]);
  const drawn = usePreviewLoop(canvas, project, clock, rig, media, sizes);
  useEffect(() => { if (drawn !== null) onDrawn(project); }, [drawn, project, onDrawn]);

  return (
    <canvas
      ref={setCanvas}
      data-live-preview={project.aspect}
      aria-hidden
      className="absolute inset-0 block size-full"
      style={{ opacity: visible ? 1 : 0, transition: 'opacity 160ms ease-out' }}
    />
  );
}
