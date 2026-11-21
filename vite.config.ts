import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';
import { ROUTE_BOOT, apacheHtaccess, cloudflareHeaders, cloudflareRedirects, headersFor } from './deploy/headers';
import { OPENER_MODULES } from './deploy/openers';
import { LAYOUT_MEDIA, LAYOUT_MODULES } from './deploy/layouts';
import { PAGE_MODULES } from './deploy/routes';

/**
 * The host configuration, from one definition (D-094).
 *
 * Writes `_headers` and `_redirects` for Cloudflare Pages and `.htaccess` for
 * Apache/cPanel into the build, and sends the same headers from `vite preview` — so
 * `npm run e2e:prod` runs the whole suite under the real security policy
 * rather than discovering on launch day that it blocks something.
 */
function hostConfig(): Plugin {
  return {
    name: 'motion-studio:host-config',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: '_headers', source: cloudflareHeaders() });
      this.emitFile({ type: 'asset', fileName: '_redirects', source: cloudflareRedirects() });
      this.emitFile({ type: 'asset', fileName: '.htaccess', source: apacheHtaccess() });
    },
  };
}

function previewHeaders(): Plugin {
  return {
    name: 'motion-studio:preview-headers',
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        for (const [name, value] of Object.entries(headersFor(req.url ?? '/'))) res.setHeader(name, value);
        next();
      });
    },
  };
}

/**
 * The opening designs' code, fetched with the editor rather than after it
 * (D-171, deploy/openers.ts).
 *
 * Each opener's chunk and the chunks it imports in turn are named in the page
 * as `modulepreload` links, after the editor's own. The editor's entry chunk
 * is left out — the page already loads it — and so is anything it pulls in
 * statically, which is already on its way.
 *
 * Each device's layout the same way (D-173, deploy/layouts.ts): the phone's
 * chunks and the wide layout's behind media queries that match `useLayout`,
 * so a device fetches only its own; the chunks both share, for any device.
 *
 * Since the landing page (D-175, deploy/routes.ts) the editor is a chunk of
 * its own, and none of this may download for someone reading the landing
 * page. So the links go in a `<template>` per page — inert until used — and
 * `public/route-boot.js`, written into the page, puts the opened page's to
 * use as the head is read; the landing page uses the studio's again once it
 * has loaded and is idle, so Open Studio opens at once.
 */
function preloadOpeners(): Plugin {
  return {
    name: 'motion-studio:preload-openers',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, context) {
        const bundle = context.bundle;
        if (bundle === undefined) return html;
        const chunks = Object.values(bundle).filter((output) => output.type === 'chunk');
        const eager = new Set<string>();
        const visitEager = (fileName: string): void => {
          if (eager.has(fileName)) return;
          eager.add(fileName);
          const chunk = chunks.find((c) => c.fileName === fileName);
          for (const next of chunk?.imports ?? []) visitEager(next);
        };
        for (const entry of chunks.filter((c) => c.isEntry)) visitEager(entry.fileName);

        const closure = (fileName: string, into: Set<string>): Set<string> => {
          if (into.has(fileName) || eager.has(fileName)) return into;
          into.add(fileName);
          const chunk = chunks.find((c) => c.fileName === fileName);
          for (const next of chunk?.imports ?? []) closure(next, into);
          return into;
        };
        const chunkOf = (path: string, list: string): string => {
          const named = (id: string | null): boolean => id?.replaceAll('\\', '/').endsWith(`/${path}`) === true;
          // Its own chunk; or, where Rollup kept no facade for it (the studio's entry, D-175), the chunk holding it.
          const chunk = chunks.find((c) => named(c.facadeModuleId)) ?? chunks.find((c) => c.moduleIds.some(named));
          // A missing module is a build mistake: say so rather than quietly preloading nothing.
          if (chunk === undefined) throw new Error(`${list} names ${path}, which is not a chunk of its own in this build.`);
          return chunk.fileName;
        };

        const wanted = closure(chunkOf(PAGE_MODULES.studio, 'deploy/routes.ts'), new Set());
        for (const path of OPENER_MODULES) closure(chunkOf(path, 'deploy/openers.ts'), wanted);

        const phone = closure(chunkOf(LAYOUT_MODULES.phone, 'deploy/layouts.ts'), new Set());
        const wide = closure(chunkOf(LAYOUT_MODULES.wide, 'deploy/layouts.ts'), new Set());
        const media = new Map<string, string | undefined>();
        for (const fileName of phone) media.set(fileName, wide.has(fileName) ? undefined : LAYOUT_MEDIA.phone);
        for (const fileName of wide) if (!phone.has(fileName)) media.set(fileName, LAYOUT_MEDIA.wide);

        const landing = closure(chunkOf(PAGE_MODULES.landing, 'deploy/routes.ts'), new Set());

        const link = (fileName: string, query?: string): string =>
          `<link rel="modulepreload" crossorigin href="/${fileName}"${query === undefined ? '' : ` media="${query}"`}>`;
        const template = (id: string, links: readonly string[]): string =>
          `<template id="${id}">${links.join('')}</template>`;
        const studio = template('studio-preload', [
          ...[...wanted].map((fileName) => link(fileName)),
          ...[...media].filter(([fileName]) => !wanted.has(fileName)).map(([fileName, query]) => link(fileName, query)),
        ]);
        /*
         * The templates, then the boot script written into the page itself, in
         * place of the page's `<script src="/route-boot.js">`: run as the head
         * is read, it starts the opened page's downloads at once. Fetched as a
         * file, it cost a round trip before any of them began — 0.6s of a phone
         * on Fast 3G. The security policy allows this one script by its hash
         * (deploy/headers.ts), and still no other inline script.
         */
        const tag = '<script src="/route-boot.js"></script>';
        if (!html.includes(tag)) throw new Error(`index.html must load the boot script as ${tag}.`);
        return html.replace(tag, `${studio}${template('landing-preload', [...landing].map((fileName) => link(fileName)))}<script>${ROUTE_BOOT}</script>`);
      },
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    hostConfig(),
    preloadOpeners(),
    previewHeaders(),
    /*
     * §13: "PWA via vite-plugin-pwa, installable, offline-capable".
     *
     * Offline is not a nicety here — §9 says nothing ever leaves the device,
     * so an editor that stops working without a network would be failing at
     * its own premise. Everything it needs is already local: the templates are
     * bundled, the media is in IndexedDB, and the encoders are the browser's.
     */
    VitePWA({
      // A new version waits until the person reloads, offered by a notice (src/pwa.ts, D-171).
      registerType: 'prompt',
      // Registered by the app once the editor is up and idle (src/pwa.ts), not
      // on page load, where its download competed with the first visit (D-112).
      injectRegister: false,
      includeAssets: ['favicon.svg', 'favicon-32.png', 'favicon-48.png', 'apple-touch-icon.png', 'brand-q.png'],
      manifest: {
        name: 'Q Motion Studio',
        short_name: 'Q Motion',
        description: 'Turn your photos into posts and videos that move.',
        // Paper, the landing page's and the studio's own colour (D-174, D-175).
        theme_color: '#f7f2ea',
        background_color: '#f7f2ea',
        display: 'standalone',
        orientation: 'any',
        // The installed app is the studio (D-175): it opens there, signed in on this device.
        start_url: '/studio',
        scope: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        /*
         * The code is precached — every template, the WASM decoder that makes
         * HEIC work at all, the export worker — so the app opens and works
         * offline once visited.
         *
         * The pictures are not (D-112). Precaching every design's poster and
         * every sample photograph was 2.7MB downloaded on a first visit before
         * anyone had asked to see them, on whatever connection the phone had.
         * They are cached the first time they are shown instead, so what has
         * been seen is there offline and nothing else is fetched for nothing.
         */
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,wasm}'],
        /*
         * Every address that is the page itself — `/` and `/studio` (D-175) —
         * is the precached index.html offline, which `route-boot.js` then
         * opens as the right page. Files with an extension are not pages.
         */
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/\/[^/?]+\.[^/?]+$/],
        // Takes over the open page as soon as it is ready, as it did when the
        // plugin registered it; a late registration must not mean "offline
        // only from the next visit".
        clientsClaim: true,
        /*
         * But an *update* waits (D-171). Skipping the wait swapped the cached
         * files under a page still running the old code, whose lazy designs
         * then failed to load. The notice's Reload sends the worker its
         * SKIP_WAITING message once the project is saved.
         */
        skipWaiting: false,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => /^\/(thumbs|samples)\/[^/]+\.webp$/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'pictures',
              // Every card's poster, and the samples, with room to grow.
              expiration: { maxEntries: 600 },
            },
          },
          {
            /*
             * The sound library (D-156), the same way: each sound is cached
             * the first time it is listened to or used, so a project that
             * uses it plays offline, and nobody downloads 4MB of sounds they
             * never chose.
             */
            urlPattern: ({ url }) => /^\/sounds\/[^/]+\.wav$/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'sounds',
              expiration: { maxEntries: 40 },
            },
          },
        ],
        // A 30s 1080p encode is nothing next to the WASM decoder; the default
        // 2MB cap would silently skip it and break HEIC on a second visit.
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
      },
      // Left off in development: a service worker caching the dev server is a
      // reliable way to spend an afternoon debugging yesterday's code.
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    // Bind IPv4 explicitly. Left to itself, Vite listens on [::1] only, and
    // `localhost` resolves to both ::1 and 127.0.0.1 — so whether a browser
    // reaches the dev server comes down to which family it happens to try
    // first. Pass `--host` when you need it reachable from a phone on the LAN.
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  build: {
    target: 'es2022',
    // Surfaces §14's cold-load budget as a build-time warning rather than a surprise.
    chunkSizeWarningLimit: 500,
  },
  worker: { format: 'es' },
});
