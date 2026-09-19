import { expect, test, type Page } from '@playwright/test';

/**
 * M0: a placeholder frame renders correctly at all five aspects.
 * M1: the render core animates a hand-written scene at 60fps, without calling
 *     build() inside the render loop.
 *
 * "Correctly" is checked by measurement as well as by screenshot — the backing
 * store's shape, the uniformity of the scale, and the loop actually advancing.
 * A screenshot alone would happily pass a frozen canvas.
 */

const ASPECTS = [
  { label: '16:9', ratio: 16 / 9 },
  { label: '4:3', ratio: 4 / 3 },
  { label: '1:1', ratio: 1 },
  { label: '4:5', ratio: 4 / 5 },
  { label: '9:16', ratio: 9 / 16 },
] as const;

type Stats = { frameCount: number; buildCount: number; lastFrameMs: number; lastBuildMs: number };

async function canvasMetrics(page: Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) throw new Error('no canvas on the artboard');
    const rect = canvas.getBoundingClientRect();
    return { backingW: canvas.width, backingH: canvas.height, cssW: rect.width, cssH: rect.height };
  });
}

async function readStats(page: Page): Promise<Stats> {
  return page.evaluate(() => {
    const handle = (globalThis as unknown as { __motionStudio?: { stats: Stats } }).__motionStudio;
    if (!handle) throw new Error('renderer stats handle is missing');
    return { ...handle.stats };
  });
}

async function readTextCacheSize(page: Page): Promise<number> {
  return page.evaluate(() => {
    const handle = (globalThis as unknown as { __motionStudio?: { textCacheSize: () => number } }).__motionStudio;
    if (!handle) throw new Error('renderer stats handle is missing');
    return handle.textCacheSize();
  });
}

test.use({ viewport: { width: 1440, height: 900 } });

test.describe('M0 — aspect scaling', () => {
  test.beforeEach(async ({ page }) => {
    // The M0 test card, frozen at a fixed time so the baseline is stable. Its
    // sweep hand is deliberately time-driven, which is exactly what makes an
    // unfrozen screenshot useless as a baseline.
    await page.goto('/?scene=placeholder&frozen=2500');
    await page.waitForSelector('canvas');
  });

  for (const { label, ratio } of ASPECTS) {
    test(`renders at ${label}`, async ({ page }) => {
      await page.getByRole('button', { name: label, exact: true }).click();
      await page.waitForTimeout(150);

      const m = await canvasMetrics(page);

      // Backing store carries the requested aspect, within one pixel of rounding.
      expect(Math.abs(m.backingW / m.backingH - ratio)).toBeLessThan(2 / Math.min(m.backingW, m.backingH));

      // H.264 4:2:0 needs even dimensions — enforced from M0 so no export ever
      // has to renegotiate its own frame size.
      expect(m.backingW % 2).toBe(0);
      expect(m.backingH % 2).toBe(0);

      // The displayed box matches the backing store's shape, so nothing is
      // stretched on the way to the screen.
      expect(Math.abs(m.cssW / m.cssH - ratio)).toBeLessThan(0.02);

      await expect(page.locator('canvas')).toHaveScreenshot(`placeholder-${label.replace(':', '-')}.png`, {
        maxDiffPixelRatio: 0.02,
      });
    });
  }
});

test.describe('M1 — render core', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?scene=demo&frozen=3000');
    await page.waitForSelector('canvas');
  });

  for (const { label } of ASPECTS) {
    test(`draws the hand-written scene at ${label}`, async ({ page }) => {
      await page.getByRole('button', { name: label, exact: true }).click();
      await page.waitForTimeout(200);
      await expect(page.locator('canvas')).toHaveScreenshot(`demo-${label.replace(':', '-')}.png`, {
        maxDiffPixelRatio: 0.02,
      });
    });
  }

  for (const at of [400, 1200, 3000, 7000]) {
    test(`is deterministic at t=${at}ms`, async ({ page }) => {
      // The same time must produce the same pixels on every run — that is what
      // makes M4's "export matches preview" assertable at all.
      await page.goto(`/?scene=demo&frozen=${at}`);
      await page.waitForSelector('canvas');
      await page.waitForTimeout(200);
      await expect(page.locator('canvas')).toHaveScreenshot(`demo-t${at}.png`, {
        maxDiffPixelRatio: 0.02,
      });
    });
  }
});

test.describe('M1 — the render loop', () => {
  test('sustains 60fps on the hand-written scene', async ({ page }) => {
    await page.goto('/?scene=demo');
    await page.waitForSelector('canvas');
    await page.waitForTimeout(400);

    const before = await readStats(page);
    await page.waitForTimeout(1500);
    const after = await readStats(page);

    const fps = ((after.frameCount - before.frameCount) * 1000) / 1500;
    expect(fps, `measured ${fps.toFixed(1)}fps`).toBeGreaterThan(50);
  });

  test('never calls build() inside the render loop', async ({ page }) => {
    // §16, and the reason §3B exists. build() runs once per (template, inputs,
    // aspect) change; if this count tracks the frame count, the memo key is
    // churning and the 16ms build budget is being paid sixty times a second.
    await page.goto('/?scene=demo');
    await page.waitForSelector('canvas');
    await page.waitForTimeout(400);

    const before = await readStats(page);
    await page.waitForTimeout(1500);
    const after = await readStats(page);

    expect(after.frameCount - before.frameCount).toBeGreaterThan(50);
    expect(after.buildCount - before.buildCount).toBe(0);
  });

  test('rebuilds exactly once when the aspect changes', async ({ page }) => {
    await page.goto('/?scene=demo');
    await page.waitForSelector('canvas');
    await page.waitForTimeout(300);

    const before = await readStats(page);
    await page.getByRole('button', { name: '16:9', exact: true }).click();
    await page.waitForTimeout(500);
    const after = await readStats(page);

    expect(after.buildCount - before.buildCount).toBe(1);
  });

  test('does not churn the text cache while letter spacing animates', async ({ page }) => {
    // The demo scene animates the subhead's tracking. If the animated value
    // reaches the measurement cache key, every frame is a miss and the whole
    // string is laid out sixty times a second — §6.3's cache defeated exactly
    // where it matters. It also re-wraps the text mid-animation.
    await page.goto('/?scene=demo');
    await page.waitForSelector('canvas');
    await page.waitForTimeout(1800);

    const before = await readTextCacheSize(page);
    await page.waitForTimeout(1500);
    const after = await readTextCacheSize(page);

    expect(after - before, `cache grew from ${before} to ${after}`).toBe(0);
  });

  test('keeps the frame and build budgets of §14', async ({ page }) => {
    await page.goto('/?scene=demo');
    await page.waitForSelector('canvas');
    await page.waitForTimeout(800);

    const stats = await readStats(page);
    expect(stats.lastFrameMs, `frame ${stats.lastFrameMs.toFixed(2)}ms`).toBeLessThan(16);
    expect(stats.lastBuildMs, `build ${stats.lastBuildMs.toFixed(2)}ms`).toBeLessThan(16);
  });

  test('advances real time', async ({ page }) => {
    await page.goto('/?scene=demo');
    await page.waitForSelector('canvas');
    const readout = page.locator('text=/\\d+\\.\\d\\ds \\/ /');
    const first = await readout.textContent();
    await page.waitForTimeout(700);
    expect(await readout.textContent()).not.toBe(first);
  });
});
