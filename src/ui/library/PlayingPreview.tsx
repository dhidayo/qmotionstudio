import { useEffect, useRef, useState } from 'react';
import { posterUrl, previewUrl } from '@/templates/manifest';

/** True on a screen that cannot hover — a phone, a tablet. */
export function noHover(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(hover: none)').matches;
}

type NetworkInformation = { readonly saveData?: boolean; readonly effectiveType?: string };

/**
 * Set once a preview has taken too long to start: on that connection the
 * cards stay as posters, and only the large preview plays (D-112).
 */
let slowSession = false;

/** How long a loop may take to start before the connection counts as slow. */
const SLOW_START_MS = 2_500;

/**
 * Whether the cards should play by themselves.
 *
 * Not when the person has asked their browser to save data, not on a
 * connection the browser reports as slow, and not once a loop has taken too
 * long to start this session — a browser that does not report its connection
 * (Safari) still gets found out that way.
 */
export function shouldStream(): boolean {
  if (slowSession) return false;
  const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
  if (!connection) return true;
  if (connection.saveData === true) return false;
  return !['slow-2g', '2g', '3g'].includes(connection.effectiveType ?? '4g');
}

/**
 * A card's preview: the poster at once, the loop on top of it while the card
 * is on screen (D-109, D-112).
 *
 * The poster is a small still that arrives quickly and is what a slow
 * connection shows; until it does, the card is a soft placeholder rather than
 * an empty box. The loop is only fetched while the card is visible, and a card
 * scrolled away before its loop arrived stops fetching it, so a long library
 * never downloads more than what is on the screen.
 */
export function PlayingPreview({ id }: { id: string }): React.JSX.Element {
  const box = useRef<HTMLSpanElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [posterReady, setPosterReady] = useState(false);
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    const element = video.current;
    const host = box.current;
    if (!element || !host || typeof IntersectionObserver !== 'function') return;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const stop = (): void => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      element.pause();
      // Not yet playable: let the download go rather than finish it off screen.
      if (element.readyState < HTMLMediaElement.HAVE_FUTURE_DATA && element.hasAttribute('src')) {
        element.removeAttribute('src');
        element.load();
      }
    };

    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting !== true) { stop(); return; }
      if (!shouldStream()) return;
      if (!element.hasAttribute('src')) element.src = previewUrl(id);
      if (element.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
        timer = setTimeout(() => { slowSession = true; stop(); }, SLOW_START_MS);
      }
      void element.play().catch(() => undefined);
    }, { threshold: 0.6 });
    observer.observe(host);
    // Started in time: the connection is keeping up.
    const started = (): void => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    };
    element.addEventListener('playing', started);
    return () => {
      observer.disconnect();
      element.removeEventListener('playing', started);
      if (timer !== null) clearTimeout(timer);
    };
  }, [id]);

  return (
    <span
      ref={box}
      className={`absolute inset-0 block ${posterReady ? '' : 'animate-pulse'}`}
      style={{ background: 'var(--c-panel-alt)' }}
    >
      <img
        src={posterUrl(id)}
        alt=""
        loading="lazy"
        decoding="async"
        onLoad={() => { setPosterReady(true); }}
        className="absolute inset-0 size-full object-cover"
        style={{ opacity: posterReady ? 1 : 0, transition: 'opacity 160ms ease-out' }}
      />
      <video
        ref={video}
        muted
        loop
        playsInline
        preload="none"
        aria-hidden
        data-autoplay-preview
        onPlaying={() => { setMoving(true); }}
        className="absolute inset-0 size-full object-cover"
        style={{ opacity: moving ? 1 : 0, transition: 'opacity 160ms ease-out' }}
      />
    </span>
  );
}
