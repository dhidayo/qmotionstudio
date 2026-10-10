import { expect, test } from '@playwright/test';

/**
 * Library categories fold (D-123), and cards wear their design's ground
 * (D-121): "I would love the templates to show with the background colors for
 * users to see the exact look before clicking the template".
 */

test.use({ viewport: { width: 1500, height: 1003 } });

test('a category folds, stays folded after a reload, and a search still finds what it holds', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('canvas');
  const library = page.getByRole('complementary', { name: 'Template library' });
  const header = library.getByRole('button', { name: /^Headlines & hooks/ });
  await expect(header).toHaveAttribute('aria-expanded', 'true');
  await expect(library.locator('[data-design-card="type-typewriter"]')).toBeVisible();

  await header.click();
  await expect(header).toHaveAttribute('aria-expanded', 'false');
  await expect(library.locator('[data-design-card="type-typewriter"]')).toHaveCount(0);

  await page.reload();
  await page.waitForSelector('canvas');
  await expect(library.getByRole('button', { name: /^Headlines & hooks/ })).toHaveAttribute('aria-expanded', 'false');

  await library.getByLabel('Search templates').fill('typewriter');
  await expect(library.locator('[data-design-card="type-typewriter"]')).toBeVisible();
});

test('collapse all, then expand all', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('canvas');
  const library = page.getByRole('complementary', { name: 'Template library' });
  await library.getByRole('button', { name: 'Collapse all' }).click();
  await expect(library.locator('[data-design-card]')).toHaveCount(0);
  await library.getByRole('button', { name: 'Expand all' }).click();
  await expect(library.locator('[data-design-card]').first()).toBeVisible();
});

test('a card is the colour of the design it opens', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('canvas');
  // Typewriter opens on cream, Mask Wipe on navy (D-121).
  const ground = (id: string) => page.locator(`[data-design-card="${id}"] > span`).first().evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(await ground('type-typewriter')).toBe('rgb(242, 230, 208)');
  expect(await ground('type-mask-wipe')).toBe('rgb(14, 27, 61)');
});
