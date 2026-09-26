import { expect, test, type Page } from '@playwright/test';

/**
 * §12's gating, which M7 asks to "behave correctly with the dev toggle".
 *
 * Two things have to be true at once: the free tier is visibly limited, and it
 * is still usable. A cap that blocks editing would make the sample worthless;
 * a cap nobody can see would make the export a nasty surprise.
 */

test.use({ viewport: { width: 1500, height: 940 } });

const tierToggle = (page: Page) => page.getByRole('button', { name: /^Tier: / });

async function setTier(page: Page, tier: 'free' | 'pro'): Promise<void> {
  const label = await tierToggle(page).getAttribute('aria-label');
  if (label?.startsWith(`Tier: ${tier}`) === true) return;
  await tierToggle(page).click();
  await expect(tierToggle(page)).toHaveAttribute('aria-label', new RegExp(`^Tier: ${tier}`));
}

/** Mean luminance of the corner the watermark sits in. */
async function cornerBrightness(page: Page): Promise<number> {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) throw new Error('no canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no context');

    const w = Math.round(canvas.width * 0.42);
    const h = Math.round(canvas.height * 0.06);
    const data = ctx.getImageData(canvas.width - w - 4, canvas.height - h - 4, w, h).data;

    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      sum += ((data[i] ?? 0) + (data[i + 1] ?? 0) + (data[i + 2] ?? 0)) / 3;
    }
    return sum / (data.length / 4);
  });
}

test.describe('the free-tier watermark (§12)', () => {
  test('is on the preview for free and gone for pro', async ({ page }) => {
    // On the preview, not only the export: finding out at export time that
    // the picture has a mark on it would be the worst moment to learn it.
    await page.goto('/?template=quick-pitch&aspect=9:16&frozen=2000');
    await page.waitForSelector('canvas');
    await page.waitForTimeout(2_500);

    await setTier(page, 'free');
    await page.waitForTimeout(300);
    const marked = await cornerBrightness(page);

    await setTier(page, 'pro');
    await page.waitForTimeout(300);
    const clean = await cornerBrightness(page);

    expect(marked, 'the mark lightens its corner').toBeGreaterThan(clean + 1);
  });
});

test.describe('the duration cap (§12)', () => {
  test('offers both doors when a project outgrows the free tier', async ({ page }) => {
    // Launch Story is 30s; free Motion Ads stop at 15s.
    await page.goto('/?template=launch-story&aspect=9:16&frozen=2000');
    await page.waitForSelector('canvas');
    await page.waitForTimeout(3_000);
    await setTier(page, 'free');

    const upsell = page.locator('[data-duration-upsell]');
    await expect(upsell).toBeVisible();
    await expect(upsell).toContainText('Free exports stop at 15s');
    await expect(upsell.getByRole('button', { name: /Keep the first/ })).toBeVisible();
    await expect(upsell.getByRole('button', { name: 'Go Pro' })).toBeVisible();
  });

  test('editing is never blocked, only the export is capped', async ({ page }) => {
    await page.goto('/?template=launch-story&aspect=9:16&frozen=2000');
    await page.waitForSelector('canvas');
    await page.waitForTimeout(3_000);
    await setTier(page, 'free');

    // The whole ad is still there and still editable.
    await expect(page.getByText('Scene 1 of 8')).toBeVisible();
    await page.getByTitle('Add a text overlay').click();
    await expect(page.locator('[data-selection-box]')).toBeVisible();
  });

  test('"keep the first 15s" trims rather than refusing', async ({ page }) => {
    await page.goto('/?template=launch-story&aspect=9:16&frozen=2000');
    await page.waitForSelector('canvas');
    await page.waitForTimeout(3_000);
    await setTier(page, 'free');

    await page.locator('[data-duration-upsell]').getByRole('button', { name: /Keep the first/ }).click();

    // Fewer scenes, inside the cap, and the banner has done its job and gone.
    await expect(page.locator('[data-duration-upsell]')).toHaveCount(0);
    await expect(page.getByText(/Scene 1 of [1-7]$/)).toBeVisible();
  });

  test('goes away on pro', async ({ page }) => {
    await page.goto('/?template=launch-story&aspect=9:16&frozen=2000');
    await page.waitForSelector('canvas');
    await page.waitForTimeout(3_000);
    await setTier(page, 'free');
    await expect(page.locator('[data-duration-upsell]')).toBeVisible();

    await setTier(page, 'pro');
    await expect(page.locator('[data-duration-upsell]')).toHaveCount(0);
    await expect(page.getByText('Scene 1 of 8'), 'and nothing was deleted').toBeVisible();
  });
});
