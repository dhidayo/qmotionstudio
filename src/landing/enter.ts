import { signIn } from '@/entry/session';

/**
 * Going into the studio from the landing page (D-175): "I should be able to
 * click on Open Studio, or some CTA on the header section to begin design".
 *
 * Signs in on this device, then opens the editor in this same page rather
 * than loading a new one: its code has usually been fetched while the
 * landing page sat idle (`prefetchStudio`), so it opens at once. The address
 * becomes `/studio` by replacing this one, not adding to the history, because
 * a signed-in visit to `/` goes straight back to the studio anyway: Back
 * leaves for wherever the person came from.
 *
 * `search` opens a particular design, by the editor's own deep link
 * (`?template=…&aspect=…`), which starts a new project from it (useRestore).
 */

let leave: (() => void) | null = null;

/** The landing page's way out of the page: unmount it, and put the start-up screen back. */
export function setLeave(fn: () => void): void {
  leave = fn;
}

export function openStudio(search = ''): void {
  signIn();
  history.replaceState(null, '', `/studio${search}`);
  document.documentElement.dataset['route'] = 'studio';
  applyStudioPreloads();
  leave?.();
  window.scrollTo(0, 0);
  const host = document.getElementById('root');
  if (!host) return;
  import('@/studio/boot')
    .then(({ bootStudio }) => { bootStudio(host); })
    .catch(async (error: unknown) => {
      const { pageDidNotLoad } = await import('@/entry/failed');
      pageDidNotLoad(host, 'studio', error);
    });
}

let preloaded = false;

/**
 * The studio's code, its opening designs and this device's layout, named in
 * the page by the build (vite.config.ts) and fetched now, without running
 * any of it. Nothing in development, where there is no build to name them.
 */
function applyStudioPreloads(): void {
  if (preloaded) return;
  preloaded = true;
  const template = document.getElementById('studio-preload');
  if (template instanceof HTMLTemplateElement) document.head.appendChild(template.content.cloneNode(true));
}

type NetworkInformation = { readonly saveData?: boolean; readonly effectiveType?: string };

/**
 * Fetches the studio while the landing page is idle, so Open Studio is
 * instant — but not on a connection the person has asked to spare, nor on a
 * slow one, where it would compete with the page they are reading.
 */
export function prefetchStudio(): () => void {
  const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
  if (connection?.saveData === true || ['slow-2g', '2g'].includes(connection?.effectiveType ?? '4g')) return () => undefined;
  return whenSettled(() => { applyStudioPreloads(); }, 4_000);
}

/**
 * Once the page has finished loading what it shows — its words and its
 * pictures — and the browser is idle: for what the page can do without,
 * so it never competes with the first screen on a slow phone.
 */
export function whenSettled(fn: () => void, timeout: number): () => void {
  let idle = 0;
  let cancelled = false;
  const go = (): void => {
    if (cancelled) return;
    if (typeof requestIdleCallback === 'function') idle = requestIdleCallback(fn, { timeout });
    else idle = window.setTimeout(fn, 300);
  };
  /*
   * The page's `load` can come before the landing page has drawn its pictures
   * at all (they are React's, after the script); so the first screen's
   * pictures are waited for too, each to load or to fail.
   */
  const pictures = (): Promise<unknown> => Promise.all(
    [...document.querySelectorAll<HTMLImageElement>('.lp-hero img:not([loading="lazy"])')]
      .map((img) => (img.complete ? Promise.resolve() : new Promise((resolve) => {
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', resolve, { once: true });
      }))),
  );
  const loaded = (): void => { void pictures().then(go); };
  if (document.readyState === 'complete') loaded();
  else window.addEventListener('load', loaded, { once: true });
  return () => {
    cancelled = true;
    window.removeEventListener('load', loaded);
    if (typeof cancelIdleCallback === 'function') cancelIdleCallback(idle);
    else clearTimeout(idle);
  };
}
