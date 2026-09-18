import { expect, test, type Page } from '@playwright/test';

/**
 * M0's acceptance criterion: a static placeholder frame renders correctly at
 * all five aspects.
 *
 * "Correctly" is checked three ways — the backing store is the right shape, the
 * scale is uniform on both axes (a circle stays a circle), and the render loop
 * is actually advancing. Screenshots alone would pass a frozen canvas.
 */

const ASPECTS = [
  { label: '16:9', ratio: 16 / 9 },
  { label: '4:3', ratio: 4 / 3 },
  { label: '1:1', ratio: 1 },
  { label: '4:5', ratio: 4 / 5 },
  { label: '9:16', ratio: 9 / 16 },
] as const;

async function canvasMetrics(page: Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) throw new Error('no canvas on the artboard');
    const rect = canvas.getBoundingClientRect();
    return {
      backingW: canvas.width,
      backingH: canvas.height,
      cssW: rect.width,
      cssH: rect.height,
    };
  });
}

test.beforeEach(async ({ page }) => {
  // Frozen at a fixed time so the baseline is stable. The sweep hand in the
  // placeholder frame is deliberately time-driven, which is exactly what makes
  // an unfrozen screenshot useless as a baseline.
  await page.goto('/?frozen=2500');
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

    await expect(page.locator('canvas')).toHaveScreenshot(`artboard-${label.replace(':', '-')}.png`, {
      maxDiffPixelRatio: 0.02,
    });
  });
}

test('the render loop advances real time', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('canvas');
  const readout = page.locator('text=/\\d+\\.\\d\\ds \\/ /');
  const first = await readout.textContent();
  await page.waitForTimeout(700);
  const second = await readout.textContent();
  expect(second).not.toBe(first);
});

test('the preview loop sustains a usable frame rate', async ({ page }) => {
  // Counts real animation frames in the page rather than trusting the overlay.
  const fps = await page.evaluate(async () => {
    let frames = 0;
    const started = performance.now();
    await new Promise<void>((resolve) => {
      const step = (): void => {
        frames++;
        if (performance.now() - started >= 1000) resolve();
        else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    return (frames * 1000) / (performance.now() - started);
  });
  expect(fps).toBeGreaterThan(30);
});
