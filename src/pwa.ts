/**
 * Offline support, switched on once the editor is up (D-112).
 *
 * The service worker precaches the whole app — several megabytes of code — and
 * registering it on page load started that download alongside the first visit
 * itself, so on a slow phone connection the editor and its own cache competed
 * for the same thin pipe. It waits now: until the editor has rendered and the
 * page has gone quiet, and not at all when the person has asked their browser
 * to save data.
 *
 * Production only, like the worker itself (see vite.config.ts).
 */

import { SCHEMA_VERSION } from '@/document/types';
import { writeProject } from '@/persist/db';
import { useEditor } from '@/state/store';
import { UPDATE_READY } from '@/ui/shell/failures';

/** Long enough for the opening design and its photographs to have arrived. */
const SETTLE_MS = 4_000;

type NetworkInformation = { readonly saveData?: boolean };

export function registerOfflineSupport(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
  if (connection?.saveData === true) return;

  const register = (): void => {
    void import('virtual:pwa-register')
      .then(({ registerSW }) => {
        const update = registerSW({
          immediate: true,
          /*
           * A newer version has been downloaded and is waiting (D-171). It
           * used to take over the open page at once, while that page was
           * still running the old code — which then asked for designs and
           * windows by file names the new version no longer had, and they
           * failed to load. Now the old version keeps serving this page until
           * the person chooses to reload, saved first.
           */
          onNeedRefresh: () => {
            useEditor.getState().showToast(UPDATE_READY, {
              sticky: true,
              action: {
                label: 'Reload',
                run: () => {
                  void writeProject({ schemaVersion: SCHEMA_VERSION, project: useEditor.getState().project })
                    .catch((error: unknown) => { console.error('Could not save before updating.', error); })
                    .finally(() => { void update(true); });
                },
              },
            });
          },
          onRegisterError: (error: unknown) => {
            console.warn('Offline support could not be set up.', error);
          },
        });
        void navigator.serviceWorker.ready.then(keepWhatWasShown);
      })
      .catch((error: unknown) => {
        // §16: said, not swallowed. The app still works; it just will not open offline.
        console.warn('Offline support could not be set up.', error);
      });
  };

  const whenIdle = (): void => {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(register, { timeout: SETTLE_MS });
    else register();
  };

  const start = (): void => { setTimeout(whenIdle, SETTLE_MS); };
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
}

/** The pictures the worker caches as they are shown (vite.config.ts `runtimeCaching`). */
const PICTURE = /^\/(thumbs|samples)\/[^/]+\.webp$/;

/**
 * The pictures this visit showed before the worker existed — the opening
 * design's sample photographs, any posters already looked at — asked for again
 * once it is in charge, so they are kept for offline too. Mostly answered from
 * the browser's own cache, so it costs next to nothing.
 */
async function keepWhatWasShown(): Promise<void> {
  if (!navigator.serviceWorker.controller) {
    await new Promise<void>((resolve) => {
      navigator.serviceWorker.addEventListener('controllerchange', () => { resolve(); }, { once: true });
    });
  }
  const shown = performance.getEntriesByType('resource')
    .map((entry) => entry.name)
    .filter((url) => PICTURE.test(new URL(url).pathname));
  await Promise.all([...new Set(shown)].map(async (url) => {
    try {
      await fetch(url);
    } catch (error: unknown) {
      console.warn(`Could not keep ${url} for offline use.`, error);
    }
  }));
}
