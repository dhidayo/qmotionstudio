import { defineConfig, devices } from '@playwright/test';

/*
 * `PW_PROD=1` runs the suite against the production build instead of the dev
 * server (`npm run e2e:prod`).
 *
 * The dev server and the build are different programs. The export worker is
 * bundled differently, the service worker only exists in the build, and the
 * build is what people actually load — so a suite that has only ever seen the
 * dev server has never tested the thing that ships. Port 4173 so the two can
 * run side by side.
 */
const PROD = process.env['PW_PROD'] === '1';
const BASE_URL = PROD ? 'http://localhost:4173' : 'http://localhost:5173';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    /*
     * The quick start (D-142) is a first visit's card; the suite is not about
     * it, and a card over the picture would sit under clicks meant for the
     * canvas. Marked as seen everywhere; its own test starts from nothing.
     */
    storageState: { cookies: [], origins: [{ origin: BASE_URL, localStorage: [{ name: 'ms.quickstart', value: 'done' }] }] },
    trace: 'on-first-retry',
  },
  /*
   * Export tests get their own project, with parallelism off *and* a
   * dependency on the rest of the suite.
   *
   * Each one encodes a 1080p clip, which is genuinely CPU-bound. Run six at
   * once alongside everything else and the machine saturates: unrelated timing
   * assertions start failing and the whole run took ten minutes (D-042).
   *
   * `fullyParallel: false` alone was not enough once M5 added a thirty-second
   * eight-scene encode. Serialising *within* the project still left it
   * competing with five app workers, and it went from twenty seconds alone to
   * over two minutes under that load. The dependency makes the two phases
   * disjoint, which is both more honest and, at about 2.7 minutes end to end,
   * faster than the contended run it replaces.
   */
  projects: [
    {
      name: 'app',
      testIgnore: /export\.spec\.ts/,
      grepInvert: /@perf/,
      use: { ...devices['Desktop Chrome'] },
    },
    /*
     * The phone tests again, in Safari's engine (D-111).
     *
     * WebKit would not store a photo in IndexedDB in a private window, and a
     * reload lost every picture — invisible in Chromium, where the same code
     * worked. Phones are where Safari is, so the phone suite runs in both.
     * Needs `npx playwright install webkit` once.
     */
    {
      name: 'phone-webkit',
      testMatch: /phone\.spec\.ts/,
      use: { ...devices['iPhone 13'] },
    },
    /*
     * The measurements, on a quiet machine.
     *
     * §14's frame and build budgets and §10's drift budget are the only tests
     * here that measure *time*, and time is the one thing five parallel
     * browsers make meaningless. Run alongside everything else they report the
     * load on the machine rather than the cost of the code: a 60fps assertion
     * that passes six times out of six on its own fails roughly one run in two
     * inside a saturated pool, and the number it prints is real — the frames
     * genuinely did not happen, because the CPU was busy running the rest of
     * the suite.
     *
     * Same reasoning as D-042, which gave the export encodes their own phase,
     * and the same remedy: make the phases disjoint so each one measures what
     * it claims to.
     */
    {
      name: 'perf',
      testIgnore: /export\.spec\.ts/,
      grep: /@perf/,
      fullyParallel: false,
      dependencies: ['app'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'export',
      testMatch: /export\.spec\.ts/,
      fullyParallel: false,
      dependencies: ['perf'],
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: PROD ? 'npm run build && npm run preview -- --port 4173 --strictPort' : 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
  },
});
