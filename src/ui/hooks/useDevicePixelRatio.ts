import { useSyncExternalStore } from 'react';

/**
 * The screen's device pixel ratio, kept current (D-154).
 *
 * Read once during render, it went stale when the window moved to a screen
 * of a different density — a laptop's retina panel to an ordinary monitor —
 * and the preview kept drawing for the old one: twice the pixels it needed,
 * or half the sharpness. A media query on the current ratio fires when it
 * stops being true, and is then replaced by one for the new ratio.
 */
function subscribe(changed: () => void): () => void {
  if (typeof matchMedia !== 'function') return () => {};
  let query: MediaQueryList | null = null;
  const watch = (): void => {
    query?.removeEventListener('change', onChange);
    query = matchMedia(`(resolution: ${String(readRatio())}dppx)`);
    query.addEventListener('change', onChange);
  };
  function onChange(): void {
    watch();
    changed();
  }
  watch();
  return () => { query?.removeEventListener('change', onChange); };
}

function readRatio(): number {
  return typeof devicePixelRatio === 'number' && devicePixelRatio > 0 ? devicePixelRatio : 1;
}

export function useDevicePixelRatio(): number {
  return useSyncExternalStore(subscribe, readRatio, () => 1);
}
