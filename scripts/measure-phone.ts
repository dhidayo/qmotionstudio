import { chromium, type Browser, type BrowserContext, type CDPSession, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';

/**
 * `npm run measure:phone` — §14's budgets on an ordinary phone, measured
 * rather than assumed (D-171).
 *
 * Run it against the production build, which is what people download:
 *
 *   npm run build && npx vite preview --port 4173 --strictPort
 *   npm run measure:phone            # or PHONE_URL=http://localhost:5481 …
 *
 * The phone is a 390×844 touch screen at 3× with Chrome DevTools' "Fast 3G"
 * (1.44 Mbps down, 675 kbps up, 562.5 ms round trip) and the CPU slowed four
 * times, the usual stand-in for a mid-range Android phone on a laptop. Each
 * measurement is a fresh browser context, so nothing is cached and no service
 * worker is installed.
 *
 * It reports, against §14:
 *   - cold load to an interactive editor (canvas, Export and the first frame);
 *   - time to the first drawn frame (the artboard's loading veil gone);
 *   - the preview's frame rate while an eight-photo design and a five-scene
 *     video play, read from the `?perf=1` overlay (D-154);
 *   - memory after adding eight 4000×3000 photographs: the page's JavaScript
 *     heap, and the resident memory of every browser process, which is where
 *     decoded pictures live.
 *
 * Not a test: on a shared machine the numbers move with the load, so it
 * prints them and leaves the judgement to whoever runs it. `PHONE_RUNS`
 * repeats the cold load (median printed); `PHONE_CPU` changes the slowdown.
 * Set PHONE_CHROMIUM to a browser binary to use one other than Playwright's.
 * `PHONE_TRACE=1` lists the median cold load's downloads and when each
 * arrived; `PHONE_COLD_ONLY=1` stops after the cold load (D-173).
 */

const URL = (process.env['PHONE_URL'] ?? 'http://localhost:4173').replace(/\/$/, '');
const RUNS = Number(process.env['PHONE_RUNS'] ?? '3');
const CPU = Number(process.env['PHONE_CPU'] ?? '4');
const EXECUTABLE = process.env['PHONE_CHROMIUM'];

const EIGHT_PHOTOS = '/?template=ring-ferris-wheel&aspect=9:16&perf=1';
const FIVE_SCENES = '/?template=film-product-launch&aspect=9:16&perf=1';

/** The suite's first-visit state (tests/support/storage.ts), so no question covers the editor. */
const SEEDED = [
  { name: 'ms.quickstart', value: 'done' },
  { name: 'ms.workspace', value: 'both' },
  { name: 'ms.timeline', value: 'open' },
];

async function phone(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
    storageState: { cookies: [], origins: [{ origin: URL, localStorage: SEEDED }] },
  });
}

async function throttle(page: Page, network: boolean): Promise<CDPSession> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  if (network) {
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 562.5,
      downloadThroughput: (1.44 * 1024 * 1024) / 8,
      uploadThroughput: (675 * 1024) / 8,
    });
  }
  return cdp;
}

/** What a cold load downloaded before the editor answered, by kind, in bytes (D-173). */
type Transfer = { total: number; byKind: Record<string, number>; trace: string[] };

type ColdLoad = { interactive: number; firstFrame: number; transferred: Transfer };

/** Cold load: navigation to an editor whose first frame is drawn and whose Export answers. */
async function coldLoad(browser: Browser): Promise<ColdLoad> {
  const context = await phone(browser);
  try {
    const page = await context.newPage();
    await throttle(page, true);
    const started = Date.now();
    await page.goto(`${URL}/`, { waitUntil: 'commit' });
    await page.waitForSelector('canvas', { timeout: 120_000 });
    await page.locator('[data-canvas-loading]').first().waitFor({ state: 'detached', timeout: 120_000 }).catch(() => undefined);
    await page.waitForFunction(() => document.querySelector('[data-canvas-loading]') === null, undefined, { timeout: 120_000, polling: 100 });
    const firstFrame = Date.now() - started;
    await page.getByRole('button', { name: /Export/ }).first().waitFor({ state: 'visible', timeout: 120_000 });
    const interactive = Date.now() - started;
    /*
     * Only what arrived before the editor answered: the chunks fetched when
     * idle afterwards (D-173) are not part of the cold load, and counting them
     * would hide what the split saved.
     */
    const transferred = await page.evaluate((untilMs) => {
      const byKind: Record<string, number> = {};
      const trace: string[] = [];
      let total = 0;
      for (const entry of performance.getEntriesByType('resource') as PerformanceResourceTiming[]) {
        if (entry.startTime > untilMs) continue;
        const path = new globalThis.URL(entry.name).pathname;
        const kind = /\.js$/.test(path) ? 'script' : /\.woff2$/.test(path) ? 'font' : /\.css$/.test(path) ? 'style' : /\.(webp|png|svg)$/.test(path) ? 'picture' : 'other';
        const size = entry.transferSize || 0;
        byKind[kind] = (byKind[kind] ?? 0) + size;
        total += size;
        trace.push(`${(entry.startTime / 1000).toFixed(2)}–${(entry.responseEnd / 1000).toFixed(2)}s ${(size / 1024).toFixed(1).padStart(6)} KB ${path}`);
      }
      return { total, byKind, trace };
    }, interactive);
    return { interactive, firstFrame, transferred };
  } finally {
    await context.close();
  }
}

type PlayReading = { fps: number; late: string; backing: string };

/**
 * Frame rate while playing, from the `?perf=1` overlay's own count.
 *
 * An image plays once and stops (Replay), a video plays on (Pause/Play), so
 * it is started afresh here and read only while it plays: a paused picture is
 * not redrawn, and its count says nothing. Each reading covers half a second.
 */
async function readPlaying(page: Page): Promise<PlayReading> {
  const replay = page.getByRole('button', { name: 'Replay' }).first();
  const play = page.getByRole('button', { name: 'Play' }).first();
  if (await replay.isVisible().catch(() => false)) await replay.click();
  else if (await play.isVisible().catch(() => false)) await play.click();
  await page.waitForTimeout(1_500);
  const samples: number[] = [];
  let late = '–';
  let backing = '–';
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(500);
    const rows = await page.locator('[data-perf-overlay]').innerText();
    const value = (label: string): string => new RegExp(`${label}\\s+([^\\n]+)`).exec(rows)?.[1]?.trim() ?? '–';
    // "late" is "–" once nothing is playing: stop counting there.
    if (value('late') === '–') break;
    samples.push(Number(value('fps')));
    late = value('late');
    backing = value('size');
  }
  samples.sort((a, b) => a - b);
  return { fps: samples[Math.floor(samples.length / 2)] ?? 0, late, backing };
}

async function opened(browser: Browser, path: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await phone(browser);
  const page = await context.newPage();
  await page.goto(`${URL}${path}`);
  await page.waitForSelector('canvas');
  await page.waitForFunction(() => document.querySelector('[data-canvas-loading]') === null, undefined, { timeout: 60_000 });
  return { context, page };
}

async function playing(browser: Browser, path: string): Promise<PlayReading> {
  const { context, page } = await opened(browser, path);
  try {
    await throttle(page, false);
    return await readPlaying(page);
  } finally {
    await context.close();
  }
}

/** Resident memory of every process belonging to this browser, in MB (Linux and macOS `ps`). */
function browserRssMb(browserPid: number | null): number | null {
  if (browserPid === null) return null;
  try {
    const out = execFileSync('ps', ['-eo', 'pid=,ppid=,rss='], { encoding: 'utf8' });
    const rows = out.trim().split('\n').map((line) => line.trim().split(/\s+/).map(Number));
    const family = new Set([browserPid]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const [pid, ppid] of rows) {
        if (pid !== undefined && ppid !== undefined && family.has(ppid) && !family.has(pid)) { family.add(pid); grew = true; }
      }
    }
    const kb = rows.filter(([pid]) => pid !== undefined && family.has(pid)).reduce((sum, row) => sum + (row[2] ?? 0), 0);
    return Math.round(kb / 1024);
  } catch {
    return null;
  }
}

type PhotoReading = { heapBefore: number; heapAfter: number; rssBefore: number | null; rssAfter: number | null; addMs: number; play: PlayReading };

async function largePhotos(browser: Browser, pid: number | null): Promise<PhotoReading> {
  const { context, page } = await opened(browser, EIGHT_PHOTOS);
  try {
    // Eight different 4000×3000 JPEGs, made in the page (before the slowdown) so the script needs no fixtures.
    const files = await page.evaluate(async () => {
      const made: { name: string; base64: string }[] = [];
      for (let i = 0; i < 8; i++) {
        const canvas = new OffscreenCanvas(4000, 3000);
        const cx = canvas.getContext('2d');
        if (!cx) throw new Error('no 2D context');
        const gradient = cx.createLinearGradient(0, 0, 4000, 3000);
        gradient.addColorStop(0, `hsl(${i * 45} 70% 50%)`);
        gradient.addColorStop(1, `hsl(${i * 45 + 120} 70% 30%)`);
        cx.fillStyle = gradient;
        cx.fillRect(0, 0, 4000, 3000);
        for (let s = 0; s < 400; s++) {
          cx.fillStyle = `hsl(${(s * 37) % 360} 60% ${30 + (s % 40)}%)`;
          cx.fillRect((s * 997) % 4000, (s * 613) % 3000, 60 + (s % 90), 40 + (s % 70));
        }
        const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = '';
        for (let b = 0; b < bytes.length; b += 0x8000) binary += String.fromCharCode(...bytes.subarray(b, b + 0x8000));
        made.push({ name: `large-${i + 1}.jpg`, base64: btoa(binary) });
      }
      return made;
    });

    const cdp = await throttle(page, false);
    const heap = async (): Promise<number> => {
      await cdp.send('HeapProfiler.collectGarbage');
      return (await cdp.send('Runtime.getHeapUsage')).usedSize / 1024 / 1024;
    };
    const heapBefore = await heap();
    const rssBefore = browserRssMb(pid);

    const started = Date.now();
    await page.getByLabel('Add your photos').setInputFiles(files.map((f) => ({ name: f.name, mimeType: 'image/jpeg', buffer: Buffer.from(f.base64, 'base64') })));
    await page.locator('[data-toast]').filter({ hasText: /photo/i }).first().waitFor({ timeout: 180_000 });
    const addMs = Date.now() - started;
    await page.waitForTimeout(3_000);
    const heapAfter = await heap();
    const rssAfter = browserRssMb(pid);
    const play = await readPlaying(page);
    return { heapBefore, heapAfter, rssBefore, rssAfter, addMs, play };
  } finally {
    await context.close();
  }
}

/** The browser's own process id, found from its DevTools connection (Chromium only). */
async function browserPid(browser: Browser): Promise<number | null> {
  try {
    const cdp = await browser.newBrowserCDPSession();
    const info = await cdp.send('SystemInfo.getProcessInfo');
    const main = info.processInfo.find((p) => p.type === 'browser');
    return main?.id ?? null;
  } catch {
    return null;
  }
}

const s = (ms: number): string => `${(ms / 1000).toFixed(2)}s`;

async function main(): Promise<void> {
  const browser = await chromium.launch(EXECUTABLE === undefined ? {} : { executablePath: EXECUTABLE });
  try {
    const pid = await browserPid(browser);
    const loads: ColdLoad[] = [];
    for (let i = 0; i < RUNS; i++) loads.push(await coldLoad(browser));
    loads.sort((a, b) => a.interactive - b.interactive);
    const median = loads[Math.floor(loads.length / 2)];
    if (median === undefined) throw new Error('no cold-load runs');
    const kb = (bytes: number): string => `${(bytes / 1024).toFixed(0)} KB`;
    const kinds = Object.entries(median.transferred.byKind).sort((a, b) => b[1] - a[1]).map(([kind, bytes]) => `${kind} ${kb(bytes)}`).join(', ');
    console.log(`Phone (390×844, CPU ×${CPU}, Fast 3G), ${URL}`);
    console.log(`Cold load to interactive: ${loads.map((l) => s(l.interactive)).join(', ')} — median ${s(median.interactive)} (budget 2.50s)`);
    console.log(`First drawn frame:        ${loads.map((l) => s(l.firstFrame)).join(', ')} — median ${s(median.firstFrame)}`);
    console.log(`Transferred on cold load: ${kb(median.transferred.total)} (${kinds})`);
    // `PHONE_TRACE=1` lists each download of the median run, when it started and finished.
    if (process.env['PHONE_TRACE'] === '1') for (const line of median.transferred.trace) console.log(`  ${line}`);
    // `PHONE_COLD_ONLY=1` stops after the cold load, for a quick before-and-after.
    if (process.env['PHONE_COLD_ONLY'] === '1') return;

    const eight = await playing(browser, EIGHT_PHOTOS);
    console.log(`Playing, eight photos:    ${eight.fps.toFixed(0)} fps, late ${eight.late}, canvas ${eight.backing} (budget ≥ 30fps on a laptop)`);
    const five = await playing(browser, FIVE_SCENES);
    console.log(`Playing, five scenes:     ${five.fps.toFixed(0)} fps, late ${five.late}, canvas ${five.backing}`);

    const mem = await largePhotos(browser, pid);
    console.log(`Eight 4000×3000 photos:   added in ${s(mem.addMs)}; JS heap ${mem.heapBefore.toFixed(0)} → ${mem.heapAfter.toFixed(0)} MB; browser RSS ${mem.rssBefore ?? '?'} → ${mem.rssAfter ?? '?'} MB (budget peak heap ≤ 900MB)`);
    console.log(`Playing them:             ${mem.play.fps.toFixed(0)} fps, late ${mem.play.late}, canvas ${mem.play.backing}`);
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
  console.error('measure:phone failed:', error);
  process.exitCode = 1;
});
