import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';
import { apacheHtaccess, cloudflareHeaders, headersFor } from './deploy/headers';
import { OPENER_MODULES } from './deploy/openers';

/**
 * The host configuration, from one definition (D-094).
 *
 * Writes `_headers` for Cloudflare Pages and `.htaccess` for Apache/cPanel into
 * the build, and sends the same headers from `vite preview` — so
 * `npm run e2e:prod` runs the whole suite under the real security policy
 * rather than discovering on launch day that it blocks something.
 */
function hostConfig(): Plugin {
  return {
    name: 'motion-studio:host-config',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: '_headers', source: cloudflareHeaders() });
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

        const wanted = new Set<string>();
        const visit = (fileName: string): void => {
          if (wanted.has(fileName) || eager.has(fileName)) return;
          wanted.add(fileName);
          const chunk = chunks.find((c) => c.fileName === fileName);
          for (const next of chunk?.imports ?? []) visit(next);
        };
        for (const path of OPENER_MODULES) {
          const chunk = chunks.find((c) => c.facadeModuleId?.replaceAll('\\', '/').endsWith(`/${path}`) === true);
          // A missing opener is a build mistake: say so rather than quietly preloading nothing.
          if (chunk === undefined) throw new Error(`deploy/openers.ts names ${path}, which is not a chunk of its own in this build.`);
          visit(chunk.fileName);
        }
        return [...wanted].map((fileName) => ({
          tag: 'link',
          attrs: { rel: 'modulepreload', crossorigin: true, href: `/${fileName}` },
          injectTo: 'head' as const,
        }));
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
      includeAssets: ['favicon-32.png', 'favicon-48.png', 'apple-touch-icon.png', 'brand-q.png'],
      manifest: {
        name: 'Q Motion Studio',
        short_name: 'Q Motion',
        description: 'Turn photographs into motion. Everything stays on your device.',
        theme_color: '#0d1b45',
        background_color: '#0d0d10',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
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
