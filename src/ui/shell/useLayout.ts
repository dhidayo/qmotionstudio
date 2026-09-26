import { useSyncExternalStore } from 'react';

/**
 * §13: "Responsive down to tablet. On phones, inspector and library become
 * bottom sheets."
 *
 * Measured against the window rather than written as media queries, because
 * the panels are not simply narrower on a phone — they change from columns
 * beside the artboard into sheets over it, which is a difference in structure
 * and belongs in the component that decides it.
 *
 * `useSyncExternalStore` rather than an effect with state: the size is
 * external, already-existing state, and reading it during the first render
 * avoids the flash of a desktop layout on a phone.
 */

export type Layout = 'desktop' | 'tablet' | 'phone';

/**
 * Where the breaks fall.
 *
 * Tablet is the width at which two side panels plus a usable artboard stop
 * fitting: at 1100px the artboard is down to about 520px with both open, which
 * is the point the preview stops being the biggest thing on screen. Phone is
 * where one panel beside the artboard is already too many.
 */
const TABLET_MAX = 1100;
const PHONE_MAX = 760;

function subscribe(onChange: () => void): () => void {
  window.addEventListener('resize', onChange);
  window.addEventListener('orientationchange', onChange);
  return () => {
    window.removeEventListener('resize', onChange);
    window.removeEventListener('orientationchange', onChange);
  };
}

function read(): Layout {
  const width = window.innerWidth;
  if (width <= PHONE_MAX) return 'phone';
  if (width <= TABLET_MAX) return 'tablet';
  return 'desktop';
}

export function useLayout(): Layout {
  // The server snapshot is the desktop one; there is no server, but the hook
  // requires an answer for an environment that never renders this.
  return useSyncExternalStore(subscribe, read, () => 'desktop');
}
