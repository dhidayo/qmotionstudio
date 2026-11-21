/**
 * The two pages and their code (D-175).
 *
 * `/` is the landing page and `/studio` the editor; `public/route-boot.js`
 * chooses between them before the page draws. Each page's entry is a chunk
 * of its own. The build names each page's chunks in a `<template>` of
 * `modulepreload` links (vite.config.ts), and the boot script puts only the
 * opened page's to use: the landing page is drawn without the editor's code
 * being downloaded, and the editor keeps D-171's and D-173's preloads.
 *
 * Every host must serve the page itself at `/studio` (deploy/headers.ts), and
 * the service worker serves it there offline (its navigation fallback).
 *
 * Plain values with no imports, because vite.config.ts reads this file.
 */
export const PAGE_MODULES = {
  landing: 'src/landing/boot.tsx',
  studio: 'src/studio/boot.tsx',
} as const;
