import { expect, test, type Page } from '@playwright/test';
import { seededState } from '../support/storage';
import { choosePurpose } from '../support/workspace';

/** Purpose (D-150) on a phone — and, by its name, in Safari's engine too. */

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const ORIGIN = process.env['PW_PROD'] === '1' ? 'http://localhost:4173' : 'http://localhost:5173';

/** The quick start already seen, on whichever server this run uses. */
const quickStartDone = async (
  { baseURL }: { baseURL: string | undefined },
  use: (state: ReturnType<typeof seededState>) => Promise<void>,
): Promise<void> => {
  await use(seededState([{ name: 'ms.quickstart', value: 'done' }], baseURL ?? ORIGIN));
};

async function open(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('canvas');
  await page.waitForTimeout(600);
}

for (const viewport of [{ width: 390, height: 844 }, { width: 375, height: 600 }]) {
  test.describe(`at ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, storageState: quickStartDone });

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
  test.use({ storageState: quickStartDone });

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

  /*
   * The owner's phone: "only the Start Here segment changes as I switch
   * purpose." That browser had the library grouped by style, which ignored
   * the purpose. The grouping is gone and the saved choice with it (D-160),
   * and Start here is one sideways row, so the groups that change are on the
   * sheet's first screen.
   */
  test('a library once grouped by style follows the purpose on a phone (D-160)', async ({ page }) => {
    await page.addInitScript(() => { localStorage.setItem('ms.library.groupBy', 'style'); });
    await open(page);
    const sheet = page.getByRole('dialog', { name: 'Choose a design' });
    const firstGroup = sheet.locator('[data-library-category]').first();
    const designs = page.locator('[data-phone-toolbar="main"]').getByRole('button', { name: 'Designs' });

    await choosePurpose(page, 'business');
    await designs.click();
    await expect(firstGroup).toHaveAttribute('data-library-category', 'Business posts');
    await expect(sheet.locator('[data-group-by]')).toHaveCount(0);
    // Start here no longer fills the first screen: the first purpose group shows without scrolling.
    await expect(sheet.locator('[data-start-here-row]')).toBeVisible();
    await expect(firstGroup.getByRole('heading')).toBeInViewport();
    await sheet.getByRole('button', { name: 'Close choose a design' }).click();
    await expect(sheet).toHaveCount(0);

    await choosePurpose(page, 'news');
    await designs.click();
    await expect(firstGroup).toHaveAttribute('data-library-category', 'Events & dates');
    await expect(firstGroup.getByRole('heading')).toBeInViewport();
  });
});
