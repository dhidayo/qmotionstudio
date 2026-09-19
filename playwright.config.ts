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
   * Export tests get their own project with parallelism off.
   *
   * Each one encodes a 1080p clip, which is genuinely CPU-bound. Run six at
   * once alongside the rest of the suite and the machine saturates: unrelated
   * timing assertions start failing and the whole run took ten minutes. Serial
   * here costs about ninety seconds and makes every result mean something.
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
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env['CI'],
  },
});
