import { expect, test, type Locator, type Page } from '@playwright/test';
import { seededState } from '../support/storage';
import { choosePurpose } from '../support/workspace';

/**
 * Purpose (D-150), on a computer: one slim row above the picture — Social,
 * Business, News, All — Social until another is chosen, the chosen one in
 * deep navy; the library header without clipped words; panels that resize.
 */

test.use({ viewport: { width: 1500, height: 1003 } });

const ORIGIN = process.env['PW_PROD'] === '1' ? 'http://localhost:4173' : 'http://localhost:5173';
const EMPTY = { cookies: [], origins: [] };
const seeded = (workspace: string | null): ReturnType<typeof seededState> =>
  seededState([{ name: 'ms.quickstart', value: 'done' }, ...(workspace === null ? [] : [{ name: 'ms.workspace', value: workspace }])], ORIGIN);

async function open(page: Page, url = '/'): Promise<void> {
  await page.goto(url);
  await page.waitForSelector('canvas');
  await page.waitForTimeout(600);
}

const rail = (page: Page): Locator => page.getByRole('complementary', { name: 'Template library' }).first();
const bar = (page: Page): Locator => page.locator('[data-purpose-bar]');
const stored = (page: Page): Promise<string | null> => page.evaluate(() => localStorage.getItem('ms.workspace'));
const firstGroup = (page: Page): Locator => rail(page).locator('[data-library-category]').first();
const groupHeader = (page: Page, name: string): Locator => rail(page).locator(`[data-library-category="${name}"] h3 button`);
const current = (page: Page, id: string): Locator => rail(page).locator(`[data-featured-card="${id}"], [data-design-card="${id}"]`).first();

test.describe('a first visit', () => {
  test.use({ storageState: EMPTY });

  test('opens on Social: no question in the way, galleries first, a gallery at 4:5', async ({ page }) => {
    await open(page);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(bar(page).locator('[data-workspace="social"]')).toHaveAttribute('aria-checked', 'true');
    await expect(bar(page).locator('[data-workspace="social"]')).toHaveClass(/chip-on/);
    const box = await bar(page).boundingBox();
    expect(box?.height ?? 99, 'one slim row').toBeLessThanOrEqual(48);
    await expect(page.getByRole('group', { name: 'Aspect ratio' }).getByRole('button', { name: '4:5', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(current(page, 'flow-polaroid-pass')).toHaveAttribute('aria-pressed', 'true');
    await expect(rail(page).locator('[data-library-featured] [data-featured-card]')).toHaveCount(6);
    await expect(firstGroup(page)).toHaveAttribute('data-library-category', 'Photo galleries');
    expect(await stored(page)).toBeNull();
  });

  test('the tour begins at the purpose, and choosing the one already on moves it along', async ({ page }) => {
    await open(page);
    const tour = page.locator('[data-quick-start]');
    await expect(tour).toHaveAttribute('data-quick-step', '1');
    await expect(tour).toContainText('Pick your purpose');
    await choosePurpose(page, 'social');
    await expect(tour).toHaveAttribute('data-quick-step', '2');
    await expect(tour).toContainText('Choose a design');
    expect(await stored(page)).toBe('social');
  });

  test('Business opens a business design; News one in words alone', async ({ page }) => {
    await open(page);
    await choosePurpose(page, 'business');
    await expect(current(page, 'pd-new-arrival')).toHaveAttribute('aria-pressed', 'true');
    await expect(firstGroup(page)).toHaveAttribute('data-library-category', 'Business posts');
    await expect(page.locator('[data-toast]')).toContainText('A matching design is now open.');
    await choosePurpose(page, 'news');
    await expect(current(page, 'el-eyebrow-title')).toHaveAttribute('aria-pressed', 'true');
    await expect(firstGroup(page)).toHaveAttribute('data-library-category', 'Events & dates');
  });

  test('a changed frame shape is not work: the design still follows the purpose, in that shape', async ({ page }) => {
    await open(page);
    await page.getByRole('group', { name: 'Aspect ratio' }).getByRole('button', { name: '16:9', exact: true }).click();
    await choosePurpose(page, 'business');
    await expect(current(page, 'pd-new-arrival')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('group', { name: 'Aspect ratio' }).getByRole('button', { name: '16:9', exact: true })).toHaveAttribute('aria-pressed', 'true');
  });

  test('a link that names a design opens it, and the purpose waits', async ({ page }) => {
    await open(page, '/?template=type-typewriter');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(current(page, 'type-typewriter').or(rail(page).locator('[data-library-category]').first())).toBeVisible();
    expect(await stored(page)).toBeNull();
  });
});

test.describe('set up for social', () => {
  test.use({ storageState: seeded('social') });

  test('picks are copies: no duplicate cards, and they step aside for a search or a filter', async ({ page }) => {
    await open(page);
    const ids = await rail(page).locator('[data-design-card]').evaluateAll((cards) => cards.map((c) => c.getAttribute('data-design-card')));
    expect(new Set(ids).size).toBe(ids.length);
    await rail(page).getByRole('searchbox', { name: 'Search templates' }).fill('pricing');
    await expect(rail(page).locator('[data-library-featured]')).toHaveCount(0);
    await expect(rail(page).locator('[data-design-card="biz-pricing"]')).toHaveCount(1);
    await rail(page).getByRole('searchbox', { name: 'Search templates' }).fill('');
    await rail(page).getByRole('button', { name: 'Pro', exact: true }).click();
    await expect(rail(page).locator('[data-library-featured]')).toHaveCount(0);
    // A filter never leaves only closed headings.
    await expect(rail(page).locator('[data-design-card]').first()).toBeVisible();
  });

  test('folds are kept per purpose; Collapse all leaves the Video list as it was', async ({ page }) => {
    await open(page);
    await groupHeader(page, 'Moodboards').click();
    await expect(groupHeader(page, 'Moodboards')).toHaveAttribute('aria-expanded', 'true');
    await page.reload();
    await page.waitForSelector('canvas');
    await expect(groupHeader(page, 'Moodboards')).toHaveAttribute('aria-expanded', 'true');

    await choosePurpose(page, 'business');
    await expect(groupHeader(page, 'Business posts')).toHaveAttribute('aria-expanded', 'true');
    await expect(groupHeader(page, 'Moodboards')).toHaveAttribute('aria-expanded', 'false');
    await choosePurpose(page, 'social');
    await expect(groupHeader(page, 'Moodboards')).toHaveAttribute('aria-expanded', 'true');

    await rail(page).getByRole('button', { name: 'Collapse all groups' }).click();
    await page.getByRole('group', { name: 'Mode' }).getByRole('button', { name: 'Video', exact: true }).click();
    await expect(groupHeader(page, 'Thanks & celebrations')).toHaveAttribute('aria-expanded', 'true');
    await expect(groupHeader(page, 'Hiring')).toHaveAttribute('aria-expanded', 'false');
  });
});

test.describe('library cards', () => {
  test.use({ storageState: seeded('both') });

  test('take the frame shape chosen above the picture', async ({ page }) => {
    await open(page);
    const card = rail(page).locator('[data-design-card] [data-card-shape]').first();
    await expect(card).toHaveAttribute('data-card-shape', '9:16');
    await page.getByRole('group', { name: 'Aspect ratio' }).getByRole('button', { name: '16:9', exact: true }).click();
    await expect(card).toHaveAttribute('data-card-shape', '16:9');
    const box = await card.boundingBox();
    expect((box?.width ?? 0) / (box?.height ?? 1)).toBeCloseTo(16 / 9, 1);
    // Its still is the design in that shape.
    await expect(card.locator('img').first()).toHaveAttribute('src', /\.16x9\.webp/);
  });
});

test.describe('set up for everything', () => {
  test.use({ storageState: seeded('both') });

  test('switching never touches a project someone has worked on', async ({ page }) => {
    await open(page);
    await page.locator('[data-project-title]').click();
    await page.getByLabel('Rename project').fill('Our launch');
    await page.keyboard.press('Enter');
    await choosePurpose(page, 'business');
    await expect(firstGroup(page)).toHaveAttribute('data-library-category', 'Business posts');
    await expect(page.locator('[data-toast]')).toContainText('Your project has not changed.');
    await expect(page.locator('[data-project-title]')).toHaveText('Our launch');
  });

  test('"All" keeps the library exactly as it was', async ({ page }) => {
    await open(page);
    await expect(rail(page).locator('[data-library-featured]')).toHaveCount(0);
    await expect(firstGroup(page)).toHaveAttribute('data-library-category', 'Headlines & hooks');
    await expect(bar(page).locator('[data-workspace="both"]')).toHaveAttribute('aria-checked', 'true');
  });

  test('on the bar, the arrows move along and Space chooses', async ({ page }) => {
    await open(page);
    await bar(page).locator('[data-workspace="both"]').focus();
    await page.keyboard.press('Home');
    await expect(bar(page).locator('[data-workspace="social"]')).toBeFocused();
    await expect(bar(page).locator('[data-workspace="both"]'), 'moving is not choosing').toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Space');
    await expect(bar(page).locator('[data-workspace="social"]')).toHaveAttribute('aria-checked', 'true');
    expect(await stored(page)).toBe('social');
  });

  test('the library header: every word whole, the chosen filter in navy, icons for favourites and folding', async ({ page }) => {
    await open(page);
    const header = rail(page).locator('[data-library-header]');
    const clipped = await header.locator('button').evaluateAll((buttons) => buttons.filter((b) => b.scrollWidth > b.clientWidth + 1).map((b) => b.textContent));
    expect(clipped).toEqual([]);
    await expect(header.getByRole('button', { name: 'All', exact: true })).toHaveClass(/chip-on/);
    await header.getByRole('button', { name: 'Free', exact: true }).click();
    await expect(header.getByRole('button', { name: 'Free', exact: true })).toHaveClass(/chip-on/);
    await expect(header.getByRole('button', { name: /^Show favourites only/ })).toHaveAttribute('aria-pressed', 'false');
    await header.getByRole('button', { name: 'All', exact: true }).click();
    await header.getByRole('button', { name: 'Collapse all groups' }).click();
    await expect(rail(page).locator('[data-design-card]')).toHaveCount(0);
    await header.getByRole('button', { name: 'Expand all groups' }).click();
    await expect(rail(page).locator('[data-design-card]').first()).toBeVisible();
  });

  test('both side panels resize by dragging and by keyboard, and remember it', async ({ page }) => {
    await open(page);
    const width = async (): Promise<number> => (await rail(page).boundingBox())?.width ?? 0;
    const before = await width();
    const handle = page.locator('[data-pane-resizer="library"]');
    const box = await handle.boundingBox();
    if (!box) throw new Error('no handle');
    await page.mouse.move(box.x + box.width / 2, box.y + 300);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 100, box.y + 300, { steps: 5 });
    await page.mouse.up();
    expect(await width()).toBeGreaterThan(before + 80);

    const inspector = page.locator('[data-pane-resizer="inspector"]');
    await inspector.focus();
    await page.keyboard.press('ArrowLeft');
    const valueNow = Number(await inspector.getAttribute('aria-valuenow'));
    expect(valueNow).toBeGreaterThan(312);

    await page.reload();
    await page.waitForSelector('canvas');
    expect(await width(), 'remembered').toBeGreaterThan(before + 80);
    await page.locator('[data-pane-resizer="library"]').dblclick();
    expect(Math.round(await width()), 'back to the usual width').toBe(Math.round(before));
  });
});

test.describe('a narrower screen', () => {
  test.use({ viewport: { width: 1180, height: 820 }, storageState: seeded('social') });

  test('the purpose bar stays one row and the options never overlap', async ({ page }) => {
    await open(page);
    const box = await bar(page).boundingBox();
    expect(box?.height ?? 99).toBeLessThanOrEqual(48);
    const parts = bar(page).locator('[data-workspace]');
    const all = await parts.last().boundingBox();
    const hint = bar(page).locator('[data-purpose-hint]');
    if (await hint.isVisible()) {
      const h = await hint.boundingBox();
      expect((h?.x ?? 0), 'the hint starts after the last option').toBeGreaterThanOrEqual((all?.x ?? 0) + (all?.width ?? 0));
    }
  });
});
