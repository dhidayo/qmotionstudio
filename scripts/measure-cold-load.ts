import { chromium } from '@playwright/test';

/**
 * `npm run measure:load` — §14's "cold load to interactive editor ≤ 2.5s on a
 * fast 3G throttle", measured rather than assumed.
 *
 * Run against the production build (`npm run build && npm run preview`), which
 * is what people download; the dev server serves hundreds of unbundled modules
 * and would measure the wrong thing entirely.
 *
 * "Fast 3G" is Chrome DevTools' preset: 1.44 Mbps down, 675 kbps up, 562.5 ms
 * round trip. Each run is a fresh browser context, so nothing is cached and no
 * service worker is installed. "Interactive" means the editor's canvas and its
 * Export button are on screen and the first frame has been drawn.
 */

const URL = process.env['LOAD_URL'] ?? 'http://localhost:4173/';
const RUNS = Number(process.env['LOAD_RUNS'] ?? '3');
const BUDGET_MS = 2_500;

async function once(): Promise<number> {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 562.5,
      downloadThroughput: (1.44 * 1024 * 1024) / 8,
      uploadThroughput: (675 * 1024) / 8,
    });

    const started = Date.now();
    await page.goto(URL, { waitUntil: 'commit' });
    await page.getByRole('button', { name: 'Export' }).waitFor({ state: 'visible', timeout: 60_000 });
    await page.waitForFunction(() => {
      const canvas = document.querySelector('canvas');
      return canvas !== null && canvas.width > 0;
    }, undefined, { timeout: 60_000 });
    return Date.now() - started;
  } finally {
    await browser.close();
  }
}

async function main(): Promise<void> {
  const times: number[] = [];
  for (let i = 0; i < RUNS; i++) times.push(await once());
  times.sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)] ?? 0;
  console.log(`Cold load on Fast 3G, ${RUNS} runs: ${times.map((t) => `${(t / 1000).toFixed(2)}s`).join(', ')}`);
  console.log(`Median ${(median / 1000).toFixed(2)}s against a ${(BUDGET_MS / 1000).toFixed(1)}s budget — ${median <= BUDGET_MS ? 'within' : 'over'}.`);
}

main().catch((error: unknown) => {
  console.error('measure:load failed:', error);
  process.exitCode = 1;
});
