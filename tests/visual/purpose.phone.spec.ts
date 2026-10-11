import { expect, test, type Page } from '@playwright/test';
import { seededState } from '../support/storage';
import { choosePurpose } from '../support/workspace';

/** Purpose (D-150) on a phone — and, by its name, in Safari's engine too. */

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const ORIGIN = process.env['PW_PROD'] === '1' ? 'http://localhost:4173' : 'http://localhost:5173';

async function open(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('canvas');
  await page.waitForTimeout(600);
}

for (const viewport of [{ width: 390, height: 844 }, { width: 375, height: 600 }]) {
  test.describe(`at ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, storageState: seededState([{ name: 'ms.quickstart', value: 'done' }], ORIGIN) });

    test('one row under the top bar, every choice in reach, no sideways scroll', async ({ page }) => {
      await open(page);
      const bar = page.locator('[data-purpose-bar]');
      const box = await bar.boundingBox();
      expect(box?.height ?? 99).toBeLessThanOrEqual(48);
      for (const id of ['social', 'business', 'news', 'both']) {
        const part = bar.locator(`[data-workspace="${id}"]`);
        await expect(part).toBeInViewport({ ratio: 1 });
        expect((await part.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(32);
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  });
}

test.describe('choosing', () => {
  test.use({ storageState: seededState([{ name: 'ms.quickstart', value: 'done' }], ORIGIN) });

  test('Business swaps the starting design, and the design sheet follows, in the frame shape', async ({ page }) => {
    await open(page);
    await choosePurpose(page, 'business');
    await expect(page.locator('[data-toast]')).toContainText('A matching design is now open.');
    await page.locator('[data-phone-toolbar="main"]').getByRole('button', { name: 'Designs' }).click();
    const sheet = page.getByRole('dialog', { name: 'Choose a design' });
    await expect(sheet.locator('[data-library-featured] [data-featured-card]').first()).toBeVisible();
    await expect(sheet.locator('[data-library-category]').first()).toHaveAttribute('data-library-category', 'Business posts');
    await expect(sheet.locator('[data-card-shape]').first()).toHaveAttribute('data-card-shape', '4:5');
  });
});
