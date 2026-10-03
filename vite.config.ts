import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';
import { apacheHtaccess, cloudflareHeaders, headersFor } from './deploy/headers';

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

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    hostConfig(),
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
      registerType: 'autoUpdate',
      includeAssets: ['favicon-32.png', 'favicon-48.png', 'apple-touch-icon.png', 'brand-q.png'],
      manifest: {
        name: 'Q Motion Studio',
        short_name: 'Q Motion',
        description: 'Turn photographs into motion. Everything stays on your device.',
        theme_color: '#0d0d10',
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
         * The sample photographs and the template thumbnails are part of the
         * app as far as a first run is concerned, and the WASM decoder is what
         * makes HEIC work at all — none of it is optional offline.
         */
        globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2,wasm}'],
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
