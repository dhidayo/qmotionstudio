import { expect, test, type Page } from '@playwright/test';

/**
 * Arranging things (D-130 to D-134): scenes dragged into a new order, settings
 * that fold under navy bars and stay as they were left, effects that fold and
 * delete from their own bar, a phone that can change a transition, and a
 * brand saved once and used anywhere.
 */

test.use({ viewport: { width: 1500, height: 1003 } });

const sceneClip = (page: Page, n: number) => page.locator(`[data-scene-clip="${n}"]`);

test('a scene dragged along the timeline lands where it is dropped, and undo puts it back', async ({ page }) => {
  // Big Announcement: Mask Wipe, Stack Drop, Big Number, End Card.
  await page.goto('/?template=story-big-news&aspect=9:16');
  await page.waitForSelector('canvas');
  await page.waitForTimeout(1_500);
  await expect(sceneClip(page, 0)).toContainText('Mask Wipe');

  const from = await sceneClip(page, 0).boundingBox();
  const past = await sceneClip(page, 2).boundingBox();
  if (!from || !past) throw new Error('no scene clips');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(from.x + from.width / 2 + ((past.x + past.width * 0.8 - (from.x + from.width / 2)) * i) / 10, from.y + from.height / 2);
  }
  await expect(page.locator('[data-scene-drop]')).toBeVisible();
  await page.mouse.up();

  // Mask Wipe is now third, after Stack Drop and Big Number.
  await expect(sceneClip(page, 0)).toContainText('Stack Drop');
  await expect(sceneClip(page, 2)).toContainText('Mask Wipe');
  await page.getByRole('button', { name: /^Undo Reorder scenes/ }).click();
  await expect(sceneClip(page, 0)).toContainText('Mask Wipe');
});

test('a short press on a scene is still a click, not a drag', async ({ page }) => {
  await page.goto('/?template=story-big-news&aspect=9:16');
  await page.waitForSelector('canvas');
  await page.waitForTimeout(1_000);
  const box = await sceneClip(page, 1).boundingBox();
  if (!box) throw new Error('no clip');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 3, box.y + box.height / 2);
  await page.mouse.up();
  await expect(sceneClip(page, 1)).toHaveAttribute('aria-pressed', 'true');
  await expect(sceneClip(page, 1)).toContainText('Stack Drop');
});

test('a section folds under its navy bar and stays folded after a reload', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('canvas');
  await page.getByRole('tab', { name: 'Style' }).click();
  const bar = page.getByRole('button', { name: 'Looks', exact: true });
  await expect(bar).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('[data-look="cream"]')).toBeVisible();
  const navy = await bar.evaluate((el) => getComputedStyle(el.closest('.brand-surface') ?? el).backgroundColor);
  expect(navy).toBe('rgb(13, 27, 69)');

  await bar.click();
  await expect(bar).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('[data-look="cream"]')).toHaveCount(0);

  await page.reload();
  await page.waitForSelector('canvas');
  await page.getByRole('tab', { name: 'Style' }).click();
  await expect(page.getByRole('button', { name: 'Looks', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: 'Looks', exact: true }).click();
  await expect(page.locator('[data-look="cream"]')).toBeVisible();
});

test('an effect folds and deletes from its own bar', async ({ page }) => {
  await page.goto('/?template=pop-float&aspect=1:1');
  await page.waitForSelector('canvas');
  await page.waitForTimeout(1_500);
  await page.getByRole('tab', { name: 'Effects' }).click();
  await page.getByRole('button', { name: '+ Add effect' }).first().click();
  const library = page.getByRole('dialog', { name: 'Effects' });
  await library.getByRole('tab', { name: 'Stylize' }).click();
  await library.locator('[data-effect="sepia"]').click();

  const card = page.locator('[data-effect-row="sepia"]');
  await expect(card.getByRole('slider', { name: 'Intensity' })).toBeVisible();
  await card.getByRole('button', { name: 'Fold Sepia' }).click();
  await expect(card.getByRole('slider', { name: 'Intensity' })).toHaveCount(0);
  await card.getByRole('button', { name: 'Remove Sepia' }).click();
  await expect(card).toHaveCount(0);
});

test('the effects already on something are listed first in the library, and can be changed or removed there (D-138)', async ({ page }) => {
  await page.goto('/?template=pop-float&aspect=1:1');
  await page.waitForSelector('canvas');
  await page.waitForTimeout(1_500);
  await page.getByRole('tab', { name: 'Effects' }).click();
  const addEffect = page.getByRole('button', { name: '+ Add effect' }).first();
  await addEffect.click();
  const library = page.getByRole('dialog', { name: 'Effects' });
  // Nothing on it yet: no list of current effects.
  await expect(library.locator('[data-current-effects]')).toHaveCount(0);
  await library.getByRole('tab', { name: 'Stylize' }).click();
  await library.locator('[data-effect="sepia"]').click();
  await expect(library).toHaveCount(0);

  await addEffect.click();
  const current = library.locator('[data-current-effects]');
  await expect(current).toContainText('On this scene now · 1');
  await expect(current.locator('[data-effect-row="sepia"]')).toBeVisible();
  await current.getByRole('button', { name: 'Remove Sepia' }).click();
  await expect(library.locator('[data-current-effects]')).toHaveCount(0);
  await expect(page.locator('[data-effect-row="sepia"]')).toHaveCount(0);
});

test('my brand: saved from one design, put on another in one tap', async ({ page }) => {
  await page.goto('/?template=type-typewriter&aspect=1:1');
  await page.waitForSelector('canvas');
  await page.waitForTimeout(1_200);
  await page.getByRole('tab', { name: 'Style' }).click();
  await page.locator('[data-look="emerald"]').click();
  await page.getByRole('button', { name: 'Save this as my brand' }).click();

  // Another design, in its own look, then the brand on it.
  await page.locator('[data-design-card="type-mask-wipe"]').click();
  await page.waitForTimeout(800);
  const ground = (): Promise<string> => page.locator('[data-look="emerald"]').getAttribute('aria-pressed').then((v) => v ?? '');
  await expect.poll(ground).toBe('false');
  await page.getByRole('button', { name: 'Use my brand' }).click();
  await expect.poll(ground).toBe('true');
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('a scene\'s transition can be changed from its Timing sheet', async ({ page }) => {
    await page.goto('/?template=story-big-news&aspect=9:16');
    await page.waitForSelector('canvas');
    await page.waitForTimeout(1_500);
    await page.locator('[data-phone-scene="1"]').tap();
    await page.locator('[data-phone-toolbar="selection"]').getByRole('button', { name: 'Timing' }).tap();
    const sheet = page.getByRole('dialog', { name: 'Scene 2' });
    await expect(sheet).toBeVisible();
    await sheet.getByRole('button', { name: 'Wipe' }).tap();
    await expect(sheet.getByRole('button', { name: 'Wipe' })).toHaveAttribute('aria-pressed', 'true');
    await expect(sheet.getByRole('button', { name: 'Left' })).toBeVisible();
  });
});

test.describe('a first visit', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('the quick start points at each step in turn, and stays closed once skipped (D-148)', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('canvas');
    const tour = page.locator('[data-quick-start]');
    await expect(tour).toBeVisible();
    await expect(tour).toHaveAttribute('data-quick-step', '1');

    // Step one done the ordinary way, from the library: the tour moves on by itself.
    await page.locator('[data-design-card="type-mask-wipe"]').click();
    await expect(tour).toHaveAttribute('data-quick-step', '2');

    await tour.getByRole('button', { name: 'Skip tour' }).click();
    await expect(tour).toHaveCount(0);
    await page.reload();
    await page.waitForSelector('canvas');
    await expect(page.locator('[data-quick-start]')).toHaveCount(0);

    // And back from the menu.
    await page.locator('[data-app-menu]').click();
    await page.getByRole('menuitem', { name: /^Show the quick start/ }).click();
    await expect(page.locator('[data-quick-start]')).toBeVisible();
  });
});
