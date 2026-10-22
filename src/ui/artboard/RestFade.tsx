import { useEffect, useRef } from 'react';
import type { PreviewClock } from '@/core/time/clock';

/** Long enough to read as a dissolve, short enough not to hold anyone up. */
const FADE_MS = 250;
/** A rest closer to the end than this is the end: nothing jumps, so nothing is softened. */
const SAME_FRAME_MS = 50;

/**
 * A short cross-fade where an image comes to rest (D-155).
 *
 * Image plays a design once and then rests on its picture moment — the
 * template's own best still — which is often earlier than the last frame: a
 * Soft Pop design ends on its last photo leaving, and rests on all of them in
 * place. Going straight there is a cut, and a cut at the very end of a play
 * looks like a fault. So the moment the clock comes to rest, the frame the
 * canvas still holds is copied onto a veil over it, and faded out over the
 * picture underneath.
 *
 * Self-contained: it listens to the clock and copies the canvas it is given,
 * and the artboard only mounts it. It never draws a frame of its own, so the
 * preview and the export are unaffected. Moving the playhead or playing again
 * puts it away at once.
 *
 * The veil's own canvas sits in a closed shadow root, so the page still has
 * exactly one canvas — the artboard. Whatever looks for "the canvas" (the
 * visual suite, the thumbnail job, a browser extension) finds the picture,
 * not a copy of it. Its pixels are let go as soon as the fade ends.
 */
export function RestFade({
  canvas,
  clock,
}: {
  canvas: HTMLCanvasElement | null;
  clock: PreviewClock;
}): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null);
  const veil = useRef<HTMLCanvasElement | null>(null);

  // The veil's canvas, made once, inside a shadow root of its own.
  useEffect(() => {
    const el = host.current;
    if (!el || veil.current) return;
    const root = el.attachShadow({ mode: 'closed' });
    const made = document.createElement('canvas');
    made.width = 0;
    made.height = 0;
    made.style.cssText = 'display:block;width:100%;height:100%;';
    root.append(made);
    veil.current = made;
  }, []);

  useEffect(() => {
    if (!canvas) return;
    let wasEnded = clock.ended;
    let fade: Animation | null = null;

    const hide = (): void => {
      fade?.cancel();
      fade = null;
      if (host.current) host.current.style.visibility = 'hidden';
      // A preview-sized copy is megabytes; nothing is kept while nothing shows.
      if (veil.current) {
        veil.current.width = 0;
        veil.current.height = 0;
      }
    };

    const unsubscribe = clock.subscribe(() => {
      const ended = clock.ended;
      const justEnded = ended && !wasEnded;
      wasEnded = ended;
      const shown = host.current;
      const copy = veil.current;
      if (!shown || !copy) return;
      if (!justEnded) {
        // Played again, or moved by hand: the picture underneath is the one to see.
        if (!ended) hide();
        return;
      }
      /*
       * Heard from inside the clock's tick, before the loop draws the frame it
       * has come to rest on — so the canvas still holds the last frame played.
       */
      if (clock.restAtMs === null || clock.durationMs - clock.timeMs < SAME_FRAME_MS) return;
      hide();
      if (typeof shown.animate !== 'function') return;
      copy.width = canvas.width;
      copy.height = canvas.height;
      const ctx = copy.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(canvas, 0, 0);
      shown.style.visibility = 'visible';
      fade = shown.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, easing: 'ease-out', fill: 'forwards' });
      fade.onfinish = hide;
    });

    return () => {
      unsubscribe();
      hide();
    };
  }, [canvas, clock]);

  return (
    <div
      ref={host}
      aria-hidden
      data-rest-fade
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ borderRadius: 'var(--r-md)', visibility: 'hidden' }}
    />
  );
}
