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
        registerSW({ immediate: true });
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
