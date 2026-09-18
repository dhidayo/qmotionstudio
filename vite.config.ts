import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
