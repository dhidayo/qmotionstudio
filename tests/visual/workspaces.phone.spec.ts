import { expect, test, type Page } from '@playwright/test';
import { seededState } from '../support/storage';
import { answerWelcome } from '../support/workspace';

/**
 * "Set up for" (D-149) on a phone — and, by its name, in Safari's engine too.
 *
 * The question has to fit a short phone with the picture still in view, and
 * the switch has to sit in the Choose a design sheet where a thumb finds it.
 */

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const ORIGIN = process.env['PW_PROD'] === '1' ? 'http://localhost:4173' : 'http://localhost:5173';
const EMPTY = { cookies: [], origins: [] };
const QUESTION = 'What will you make most?';

async function open(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('canvas');
}

test.describe('a first visit', () => {
  test.use({ storageState: EMPTY });

  test('the question rises from the bottom, every answer in reach', async ({ page }) => {
    await open(page);
    const question = page.getByRole('dialog', { name: QUESTION });
    await expect(question).toBeVisible();
    const options = question.locator('[data-workspace-option]');
    await expect(options).toHaveCount(4);
    for (let i = 0; i < 4; i++) {
      const box = await options.nth(i).boundingBox();
      expect(box?.height ?? 0, 'a comfortable target').toBeGreaterThanOrEqual(44);
      expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(844);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, 'no sideways scroll').toBeLessThanOrEqual(1);
  });

  test('Social opens a gallery at 4:5, and the design sheet carries the switch', async ({ page }) => {
    await open(page);
    await answerWelcome(page, 'Social posts');
    await expect(page.locator('[data-phone-aspect]')).toContainText('4:5');
    await page.locator('[data-phone-toolbar="main"]').getByRole('button', { name: 'Designs' }).click();
    const sheet = page.getByRole('dialog', { name: 'Choose a design' });
    await expect(sheet.locator('[data-workspace="social"]')).toHaveAttribute('aria-checked', 'true');
    await expect(sheet.locator('[data-library-featured] [data-featured-card]').first()).toBeInViewport();
    // Switching inside the sheet reorders it and leaves it open.
    await sheet.locator('[data-workspace="both"]').click();
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('[data-library-featured]')).toHaveCount(0);
    await expect(sheet.locator('[data-library-category]').first()).toHaveAttribute('data-library-category', 'Headlines & hooks');
  });

  test('the Business tour points to Video in the menu', async ({ page }) => {
    await open(page);
    await answerWelcome(page, 'Business ads');
    await expect(page.locator('[data-quick-start]')).toContainText('choose Video in the menu');
  });
});

test.describe('on a short phone', () => {
  test.use({ viewport: { width: 375, height: 600 }, storageState: EMPTY });

  test('all four answers fit, with the picture still showing above', async ({ page }) => {
    await open(page);
    const question = page.getByRole('dialog', { name: QUESTION });
    await expect(question).toBeVisible();
    const options = question.locator('[data-workspace-option]');
    for (let i = 0; i < 4; i++) {
      const box = await options.nth(i).boundingBox();
      expect((box?.y ?? 0) + (box?.height ?? 0), `answer ${i + 1} on screen`).toBeLessThanOrEqual(600);
    }
    const panelTop = await question.locator('[data-workspace-question]').evaluate((el) => el.closest('[data-bottom-sheet] > div')?.getBoundingClientRect().top ?? 0);
    expect(panelTop, 'some of the picture stays in view').toBeGreaterThanOrEqual(80);
  });
});

test.describe('from the menu', () => {
  test.use({ storageState: seededState([{ name: 'ms.quickstart', value: 'done' }, { name: 'ms.workspace', value: 'social' }], ORIGIN) });

  test('the menu shows the answer and changes it, and the top bar stays one row', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Menu' }).first().click();
    const row = page.getByRole('button', { name: /^Set up for…/ });
    await expect(row).toContainText('Social');
    await row.click();
    await page.getByRole('dialog', { name: QUESTION }).locator('[data-workspace-option="business"]').click();
    await expect(page.locator('[data-toast]')).toContainText('Set up for business ads');
    const bar = await page.locator('header').first().boundingBox();
    expect(bar?.height ?? 99).toBeLessThanOrEqual(60);
    await expect(page.getByRole('button', { name: 'Export' })).toBeInViewport();
  });
});
