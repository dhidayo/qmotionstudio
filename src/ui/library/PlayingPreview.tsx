import { useEffect, useRef } from 'react';
import { posterUrl, previewUrl } from '@/templates/manifest';

/** True on a screen that cannot hover — a phone, a tablet. */
export function noHover(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(hover: none)').matches;
}

/**
 * A card's loop, playing while it is on screen and paused when it is not
 * (D-109). Phones have no hover, so the desktop's "plays when you point at it"
 * meant a phone's library was a wall of stills.
 */
export function PlayingPreview({ id }: { id: string }): React.JSX.Element {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = video.current;
    if (!element || typeof IntersectionObserver !== 'function') return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting === true) void element.play().catch(() => undefined);
      else element.pause();
    }, { threshold: 0.5 });
    observer.observe(element);
    return () => { observer.disconnect(); };
  }, []);
  return (
    <video
      ref={video}
      src={previewUrl(id)}
      poster={posterUrl(id)}
      muted
      loop
      playsInline
      preload="none"
      aria-hidden
      data-autoplay-preview
      className="absolute inset-0 size-full object-cover"
    />
  );
}

