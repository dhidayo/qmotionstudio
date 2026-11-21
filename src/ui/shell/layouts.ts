import { useEffect, useState } from 'react';
import type { RenderRig } from '@/core/render/rig';
import type { PreviewClock } from '@/core/time/clock';
import type { Project } from '@/document/types';
import type { MediaStore } from '@/media/store';
import { lazyPart } from './lazyPart';
import { currentLayout, useLayout, type Layout } from './useLayout';

/**
 * The phone's layout and the wide one (a computer or a tablet), each a chunk
 * of its own, chosen by `useLayout` (D-173).
 *
 * A phone never draws the inspector's columns, the library rail or the
 * desktop top bar, and a computer never draws the phone's toolbar; each used
 * to download the other's all the same. The build names both chunks in the
 * page as `modulepreload` links behind a media query that matches
 * `useLayout`'s breaks (vite.config.ts), so the right one downloads alongside
 * the editor rather than a round trip after it; `preloadLayout` asks for it
 * again from the script, for a browser that ignores the query.
 */
export type LayoutProps = { project: Project; clock: PreviewClock; rig: RenderRig; media: MediaStore };

export const PHONE_LAYOUT = lazyPart<LayoutProps>(async () => (await import('@/ui/mobile/PhoneLayout')).PhoneLayout);
export const WIDE_LAYOUT = lazyPart<LayoutProps & { layout: 'desktop' | 'tablet' }>(
  async () => (await import('./WideLayout')).WideLayout,
);
/** The wide layout's top bar, from the same chunk. */
export const WIDE_TOP_BAR = lazyPart<Record<string, never>>(async () => (await import('./WideLayout')).TopBar);

function partsFor(layout: Layout): readonly { preload: () => Promise<void>; loaded: () => boolean }[] {
  return layout === 'phone' ? [PHONE_LAYOUT] : [WIDE_LAYOUT, WIDE_TOP_BAR];
}

function loaded(layout: Layout): boolean {
  return partsFor(layout).every((part) => part.loaded());
}

/** Starts this device's layout downloading, before the fonts have arrived. */
export function preloadLayout(layout: Layout = currentLayout()): Promise<void> {
  return Promise.all(partsFor(layout).map((part) => part.preload())).then(() => undefined);
}

/**
 * The layout to draw: `useLayout`'s, once its chunk is here.
 *
 * On opening, nothing has arrived and this is simply `useLayout`; the editor
 * waits behind the start-up screen as it waits for its fonts. Afterwards —
 * a window narrowed past the phone's break, a tablet turned — the layout on
 * screen stays until the other has downloaded, rather than the editor giving
 * way to a loading screen; offline after a first visit, it is already in the
 * service worker's cache. A download that fails switches anyway, so the
 * layout's boundary can say so.
 */
export function useShownLayout(): Layout {
  const wanted = useLayout();
  const [shown, setShown] = useState(wanted);
  const now = shown !== wanted && (loaded(wanted) || !loaded(shown)) ? wanted : shown;
  // Adjusted while rendering, as React suggests for state that follows another value.
  if (now !== shown) setShown(now);
  useEffect(() => {
    if (now === wanted) return;
    let live = true;
    const show = (): void => { if (live) setShown(wanted); };
    preloadLayout(wanted).then(show, show);
    return () => { live = false; };
  }, [wanted, now]);
  return now;
}
