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

/*
 * A video template is a whole video, not one more scene (D-160). In Video,
 * picking one was read as adding a scene and replaced every scene made; the
 * library says so first, and the toast after says how to get them back.
 */
test('in Video, the library says a template replaces the scenes, and the toast how to get them back (D-160)', async ({ page }) => {
  await page.goto('/?template=story-big-news&aspect=9:16');
  await page.waitForSelector('canvas');
  const library = page.getByRole('complementary', { name: 'Template library' });
  await expect(library.locator('[data-library-note]')).toContainText('Using one replaces your scenes');
  // Opened from the address, it is the starting point: no toast for that.
  await expect(page.locator('[data-toast]')).toHaveCount(0);

  const sceneCount = (): Promise<number> => page.evaluate(() =>
    (globalThis as unknown as { __motionStudio: { editor: { getState: () => { project: { scenes: unknown[] } } } } })
      .__motionStudio.editor.getState().project.scenes.length);
  // The video template loads lazily: count its scenes once they are there.
  await expect.poll(sceneCount).toBeGreaterThan(1);
  const scenes = await sceneCount();
  await library.locator('[data-design-card][aria-pressed="false"]').first().click();
  const toast = page.locator('[data-toast]');
  await expect(toast).toContainText('is your video now');
  await expect(toast).toContainText(`brings back your ${scenes} scenes`);
  // This browser is not a Mac: the key is written as it is here.
  await expect(toast).toContainText('Ctrl+Z');
});

test('in Design, no note: a design changes the selected scene only', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('canvas');
  await expect(page.locator('[data-library-note]')).toHaveCount(0);
});

/*
 * "The templates should take the form of the screen aspect ratio" (D-160). A
 * mouse resting on a card plays the design live in the project's frame shape,
 * with the person's own work in it; moving off ends it.
 */
test('a card a mouse rests on plays live in the project\'s frame shape (D-160)', async ({ page }) => {
  await page.goto('/?aspect=4:5');
  await page.waitForSelector('canvas');
  const library = page.getByRole('complementary', { name: 'Template library' });
  const card = library.locator('[data-design-card][aria-pressed="false"]').first();
  await expect(card.locator('[data-card-shape="4:5"]')).toHaveCount(1);
  await card.hover();
  const live = card.locator('canvas[data-live-preview="4:5"]');
  await expect(live).toHaveCount(1, { timeout: 15_000 });
  await expect.poll(() => live.evaluate((canvas) => getComputedStyle(canvas).opacity), { timeout: 15_000 }).toBe('1');
  const box = await live.boundingBox();
  expect((box?.width ?? 0) / (box?.height ?? 1)).toBeCloseTo(0.8, 1);
  // One at a time: the mouse moving off ends it.
  await page.mouse.move(800, 450);
  await expect(library.locator('canvas[data-live-preview]')).toHaveCount(0);
});

/*
 * The "Add a scene" picker follows the same rule (D-160): its cards are the
 * video's frame shape, and the one a mouse rests on plays live, as the new
 * scene would be — without adding anything until it is chosen.
 */
test('the scene picker\'s cards play live in the video\'s frame shape, and only when chosen add a scene (D-160)', async ({ page }) => {
  await page.goto('/?template=quick-pitch&aspect=1:1');
  await page.waitForSelector('canvas');
  const scenes = (): Promise<number> => page.evaluate(() =>
    (globalThis as unknown as { __motionStudio: { editor: { getState: () => { project: { scenes: unknown[] } } } } })
      .__motionStudio.editor.getState().project.scenes.length);
  const before = await scenes();

  await page.getByRole('button', { name: /^Add a scene after this one/ }).click();
  const picker = page.getByRole('dialog', { name: 'Add a scene' });
  const card = picker.locator('button:has([data-card-shape="1:1"])').first();
  await expect(card).toBeVisible();
  await card.hover();
  const live = card.locator('canvas[data-live-preview="1:1"]');
  await expect(live).toHaveCount(1, { timeout: 15_000 });
  await expect.poll(() => live.evaluate((canvas) => getComputedStyle(canvas).opacity), { timeout: 15_000 }).toBe('1');
  const box = await live.boundingBox();
  expect((box?.width ?? 0) / (box?.height ?? 1)).toBeCloseTo(1, 1);
  // Looking adds nothing.
  expect(await scenes()).toBe(before);
  await picker.getByRole('searchbox', { name: 'Search designs' }).hover();
  await expect(picker.locator('canvas[data-live-preview]')).toHaveCount(0);
});
