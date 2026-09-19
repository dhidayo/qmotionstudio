import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
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
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'export',
      testMatch: /export\.spec\.ts/,
      fullyParallel: false,
      dependencies: ['app'],
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env['CI'],
  },
});
