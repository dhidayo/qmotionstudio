import type { Layout } from './useLayout';
import {
  EFFECT_PICKER, ELEMENT_PICKER, EXPORT_DIALOG, PHOTO_PICKER, PROJECTS_DIALOG, SHORTCUTS, SOUND_DIALOG, TIMELINE,
} from './parts';
import { PHONE_PANELS } from '@/ui/mobile/phonePanelsPart';

/**
 * The parts a person is likely to open next, fetched once the editor has
 * drawn and gone quiet (D-173), so the first tap on Export, + Add or a
 * phone's panels opens at once instead of waiting on the network.
 *
 * Most likely first, one at a time, each when the page is idle: on a slow
 * phone each is a fraction of a second of the connection, and the person's
 * own taps and the opening design's photographs come before them. The
 * service worker caches every part too, later (D-112) — this is what makes
 * the first visit's first tap quick, before it has.
 *
 * Not when the person has asked their browser to save data, as the service
 * worker is not (src/pwa.ts): then each part downloads when it is opened.
 */
const AFTER_FIRST_FRAME_MS = 1_500;

type NetworkInformation = { readonly saveData?: boolean };

export function prefetchLikelyParts(layout: Layout): () => void {
  const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
  if (connection?.saveData === true) return () => undefined;

  const parts = layout === 'phone'
    ? [PHONE_PANELS, EXPORT_DIALOG, ELEMENT_PICKER, PHOTO_PICKER, EFFECT_PICKER, SOUND_DIALOG, SHORTCUTS, PROJECTS_DIALOG]
    : [EXPORT_DIALOG, TIMELINE, ELEMENT_PICKER, PHOTO_PICKER, EFFECT_PICKER, SOUND_DIALOG, PHONE_PANELS, SHORTCUTS, PROJECTS_DIALOG];

  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let idle: number | undefined;
  const whenIdle = (run: () => void): void => {
    if (typeof requestIdleCallback === 'function') idle = requestIdleCallback(run, { timeout: 2_000 });
    else timer = setTimeout(run, 50);
  };
  const next = (index: number): void => {
    const part = parts[index];
    if (stopped || part === undefined) return;
    part.preload()
      // A part that did not arrive is said when it is opened (D-171); here it only stops being early.
      .catch((error: unknown) => { console.warn('Could not fetch part of the editor ahead of time.', error); })
      .finally(() => { whenIdle(() => { next(index + 1); }); });
  };
  timer = setTimeout(() => { whenIdle(() => { next(0); }); }, AFTER_FIRST_FRAME_MS);
  return () => {
    stopped = true;
    if (timer !== undefined) clearTimeout(timer);
    if (idle !== undefined && typeof cancelIdleCallback === 'function') cancelIdleCallback(idle);
  };
}
