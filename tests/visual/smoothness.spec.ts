import { expect, test, type Page } from '@playwright/test';

/**
 * Smooth motion on a computer (D-154).
 *
 * "I am viewing on landscape on system, and I see that the motion drags." A
 * 16:9 picture on a retina laptop drew every one of the screen's pixels while
 * it played — one and a half megapixels a frame through every blur and shadow
 * — where a phone had been capped since D-112. Playing, the preview now draws
 * within a budget; paused, it goes back to the screen's full sharpness; and a
 * device that still cannot keep up steps down on its own, computers included.
 *
 * The sizes are asserted in the app project, since they are not timings. The
 * frame rates are `@perf`, which runs on a quiet machine (see
 * playwright.config.ts): five browsers at once measure the machine, not the code.
 */

type Stats = {
  frameCount: number;
  frameMsTotal: number;
  buildCount: number;
  playedFrames: number;
  droppedFrames: number;
  backingW: number;
  backingH: number;
};

/** The default Social opener, in the frame shape that dragged. */
const WIDE = '/?template=flow-polaroid-pass&aspect=16:9';
/** PreviewResolution's PLAYING_PIXEL_BUDGET. */
const BUDGET = 800_000;

const DEV_ONLY = 'Reads the dev-only renderer handle, which the production build rightly omits.';

test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });

async function open(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.waitForSelector('canvas');
  await expect(page.locator('[data-canvas-loading]')).toHaveCount(0, { timeout: 30_000 });
}

async function backing(page: Page): Promise<{ w: number; h: number; cssW: number; cssH: number }> {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) throw new Error('no canvas on the artboard');
    const rect = canvas.getBoundingClientRect();
    return { w: canvas.width, h: canvas.height, cssW: rect.width, cssH: rect.height };
  });
}

async function readStats(page: Page): Promise<Stats> {
  return page.evaluate(() => {
    const handle = (globalThis as unknown as { __motionStudio?: { stats: Stats } }).__motionStudio;
    if (!handle) throw new Error('renderer stats handle is missing');
    return { ...handle.stats };
  });
}

const area = (size: { w: number; h: number }): number => size.w * size.h;

test.describe('preview resolution (D-154)', () => {
  test('plays a 16:9 design within the budget, in exactly the frame shape', async ({ page }) => {
    await open(page, WIDE);
    await expect(page.getByRole('button', { name: 'Pause' }).first()).toBeVisible();

    await expect.poll(async () => area(await backing(page))).toBeLessThanOrEqual(BUDGET);
    const playing = await backing(page);
    // Exactly 16:9 and even, so the design is laid out 1920 wide, as exported.
    expect(playing.w * 9).toBe(playing.h * 16);
    expect(playing.w % 2).toBe(0);
    expect(playing.h % 2).toBe(0);
  });

  test('sharpens to the screen when paused, and goes back to the budget on play', async ({ page }) => {
    await open(page, WIDE);
    await expect.poll(async () => area(await backing(page))).toBeLessThanOrEqual(BUDGET);
    const playing = await backing(page);

    await page.getByRole('button', { name: 'Pause' }).first().click();
    await expect.poll(async () => area(await backing(page))).toBeGreaterThan(1_300_000);
    const paused = await backing(page);
    expect(area(paused)).toBeGreaterThan(area(playing));
    expect(paused.w * 9).toBe(paused.h * 16);
    // One to one: every backing pixel is one of the screen's.
    expect(paused.cssW * 2).toBeCloseTo(paused.w, 3);
    expect(paused.cssH * 2).toBeCloseTo(paused.h, 3);
    // The box on screen does not move between the two.
    expect(paused.cssW).toBeCloseTo(playing.cssW, 3);

    await page.getByRole('button', { name: 'Play' }).first().click();
    await expect.poll(async () => area(await backing(page))).toBeLessThanOrEqual(BUDGET);
  });

  test('changes resolution without building the design again', async ({ page }) => {
    test.skip(process.env['PW_PROD'] === '1', DEV_ONLY);
    await open(page, WIDE);
    await expect.poll(async () => area(await backing(page))).toBeLessThanOrEqual(BUDGET);
    await page.waitForTimeout(300);
    const before = await readStats(page);

    await page.getByRole('button', { name: 'Pause' }).first().click();
    await expect.poll(async () => area(await backing(page))).toBeGreaterThan(BUDGET);
    await page.getByRole('button', { name: 'Play' }).first().click();
    await expect.poll(async () => area(await backing(page))).toBeLessThanOrEqual(BUDGET);
    await page.waitForTimeout(300);

    // Exact ratios keep the design box, and so the build key, the same (§16).
    expect((await readStats(page)).buildCount - before.buildCount).toBe(0);
  });

  test('does not redraw a paused picture that has not changed, and does when it has', async ({ page }) => {
    test.skip(process.env['PW_PROD'] === '1', DEV_ONLY);
    await open(page, WIDE);
    await page.getByRole('button', { name: 'Pause' }).first().click();
    await page.waitForTimeout(400);

    const before = await readStats(page);
    await page.waitForTimeout(1_200);
    const idle = (await readStats(page)).frameCount - before.frameCount;
    // Sixty or so before; now only the half-second safety net.
    expect(idle, `${idle} frames drawn in 1.2s while paused`).toBeLessThanOrEqual(4);

    // A seek changes the picture, so it is drawn at once.
    const seeked = (await readStats(page)).frameCount;
    await page.evaluate(() => {
      const handle = (globalThis as unknown as { __motionStudio: { clock: { seek: (ms: number) => void } } }).__motionStudio;
      handle.clock.seek(1_234);
    });
    await expect.poll(async () => (await readStats(page)).frameCount, { timeout: 400 }).toBeGreaterThan(seeked);
  });

  test('keeps the tour from measuring the page every frame', async ({ browser }) => {
    // The quick start open on step two, as on a first visit (D-148).
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();
    await page.addInitScript(() => {
      localStorage.setItem('ms.workspace', 'both');
      const proto = Element.prototype;
      const original = Object.getOwnPropertyDescriptor(proto, 'getBoundingClientRect')?.value as (this: Element) => DOMRect;
      const counter = globalThis as unknown as { __rects: number };
      counter.__rects = 0;
      proto.getBoundingClientRect = function (this: Element) {
        counter.__rects += 1;
        return original.call(this);
      };
    });
    await open(page, WIDE);
    await expect(page.locator('.tour-ring')).toBeVisible();
    await page.waitForTimeout(500);

    const count = (): Promise<number> => page.evaluate(() => (globalThis as unknown as { __rects: number }).__rects);
    const before = await count();
    await page.waitForTimeout(1_000);
    const calls = (await count()) - before;
    // Four measures a second, against sixty before.
    expect(calls, `${calls} layout reads in a second`).toBeLessThan(15);
    await context.close();
  });
});

test.describe('smooth playback (D-154)', () => {
  async function playingRate(page: Page, ms = 2_000): Promise<{ fps: number; dropped: number; frameMs: number }> {
    const before = await readStats(page);
    await page.waitForTimeout(ms);
    const after = await readStats(page);
    const frames = after.frameCount - before.frameCount;
    const played = after.playedFrames - before.playedFrames;
    return {
      fps: (frames * 1000) / ms,
      dropped: played > 0 ? (after.droppedFrames - before.droppedFrames) / played : 1,
      frameMs: frames > 0 ? (after.frameMsTotal - before.frameMsTotal) / frames : Number.POSITIVE_INFINITY,
    };
  }

  test('plays a 16:9 design at full rate with few late frames @perf', async ({ page }) => {
    test.skip(process.env['PW_PROD'] === '1', DEV_ONLY);
    await open(page, WIDE);
    await page.waitForTimeout(1_500);
    const rate = await playingRate(page);
    expect(rate.fps, `${rate.fps.toFixed(1)}fps, ${rate.frameMs.toFixed(1)}ms a frame`).toBeGreaterThan(50);
    expect(rate.dropped, `${(rate.dropped * 100).toFixed(0)}% late`).toBeLessThan(0.1);
  });

  test('plays 16:9 nearly as smoothly as 9:16 @perf', async ({ page }) => {
    test.skip(process.env['PW_PROD'] === '1', DEV_ONLY);
    await open(page, '/?template=flow-polaroid-pass&aspect=9:16');
    await page.waitForTimeout(1_500);
    const tall = await playingRate(page);
    await open(page, WIDE);
    await page.waitForTimeout(1_500);
    const wide = await playingRate(page);
    expect(wide.fps, `16:9 ${wide.fps.toFixed(1)}fps, 9:16 ${tall.fps.toFixed(1)}fps`).toBeGreaterThanOrEqual(0.85 * tall.fps);
  });

  test('steps the playing picture down on a computer that cannot keep up @perf', async ({ page }) => {
    test.skip(process.env['PW_PROD'] === '1', DEV_ONLY);
    await open(page, WIDE);
    await expect.poll(async () => area(await backing(page))).toBeLessThanOrEqual(BUDGET);
    const first = await backing(page);

    // A much slower computer: a sixth of this one's speed.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
    await expect.poll(async () => area(await backing(page)), { timeout: 12_000 }).toBeLessThan(area(first));
    const stepped = await backing(page);
    expect(stepped.w * 9).toBe(stepped.h * 16);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  });
});
