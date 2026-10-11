import { expect, test, type Locator, type Page } from '@playwright/test';
import { seededState } from '../support/storage';
import { answerWelcome } from '../support/workspace';

/**
 * "Set up for" (D-149), on a computer.
 *
 * Asked for as: "ask users one simple question on visit on what they would do
 * most with Q Motion, this will shape how the environment would be setup; user
 * would be able to switch mode anyway … if it is for Personal Social Posts,
 * then, I think gallery will be better to have at the top".
 */

test.use({ viewport: { width: 1500, height: 1003 } });

const ORIGIN = process.env['PW_PROD'] === '1' ? 'http://localhost:4173' : 'http://localhost:5173';
const EMPTY = { cookies: [], origins: [] };
const seeded = (workspace: string): ReturnType<typeof seededState> =>
  seededState([{ name: 'ms.quickstart', value: 'done' }, { name: 'ms.workspace', value: workspace }], ORIGIN);

const QUESTION = 'What will you make most?';

async function open(page: Page, url = '/'): Promise<void> {
  await page.goto(url);
  await page.waitForSelector('canvas');
}

const rail = (page: Page): Locator => page.getByRole('complementary', { name: 'Template library' }).first();
const stored = (page: Page): Promise<string | null> => page.evaluate(() => localStorage.getItem('ms.workspace'));
const firstGroup = (page: Page): Locator => rail(page).locator('[data-library-category]').first();
const groupHeader = (page: Page, name: string): Locator =>
  rail(page).locator(`[data-library-category="${name}"] h3 button`);

test.describe('a first visit', () => {
  test.use({ storageState: EMPTY });

  test('asks one question with four answers, before the tour', async ({ page }) => {
    await open(page);
    const question = page.getByRole('dialog', { name: QUESTION });
    await expect(question).toBeVisible();
    await expect(question.locator('[data-workspace-option]')).toHaveCount(4);
    await expect(question.getByRole('button', { name: 'Skip and show all designs' })).toBeVisible();
    await expect(page.locator('[data-quick-start]'), 'the tour waits for the answer').toHaveCount(0);
    const box = await question.locator('[data-workspace-question]').boundingBox();
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(1003);
  });

  test('Social puts photo galleries first and opens a gallery at 4:5', async ({ page }) => {
    await open(page);
    await answerWelcome(page, 'Social posts');
    expect(await stored(page)).toBe('social');
    await expect(page.getByRole('group', { name: 'Aspect ratio' }).getByRole('button', { name: '4:5', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(rail(page).locator('[data-design-card="flow-polaroid-pass"]')).toHaveAttribute('aria-pressed', 'true');

    const featured = rail(page).locator('[data-library-featured]');
    await expect(featured.locator('[data-featured-card]')).toHaveCount(6);
    await expect(firstGroup(page)).toHaveAttribute('data-library-category', 'Photo galleries');
    await expect(groupHeader(page, 'Photo galleries')).toHaveAttribute('aria-expanded', 'true');
    await expect(firstGroup(page).locator('[data-design-card]').first()).toHaveAttribute('data-design-card', 'flow-coverflow');
    await expect(groupHeader(page, 'Moodboards')).toHaveAttribute('aria-expanded', 'false');
    // Start here sits above the groups.
    const startTop = (await featured.boundingBox())?.y ?? 0;
    const groupTop = (await firstGroup(page).boundingBox())?.y ?? 0;
    expect(startTop).toBeLessThan(groupTop);

    const tour = page.locator('[data-quick-start]');
    await expect(tour).toHaveAttribute('data-quick-step', '1');
    await expect(tour).toContainText('a gallery, a moodboard');
  });

  test('Business puts products first, and advert films first under Video', async ({ page }) => {
    await open(page);
    await answerWelcome(page, 'Business ads');
    await expect(rail(page).locator('[data-design-card="pd-new-arrival"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(firstGroup(page)).toHaveAttribute('data-library-category', 'Products');
    await expect(page.locator('[data-quick-start]')).toContainText('switch to Video at the top');

    await page.getByRole('group', { name: 'Mode' }).getByRole('button', { name: 'Video', exact: true }).click();
    await expect(rail(page).locator('[data-library-featured] [data-featured-card="social-post"]')).toBeVisible();
    await expect(firstGroup(page)).toHaveAttribute('data-library-category', 'Product launches & offers');
  });

  test('News & events opens on words alone, and its tour has no photo step', async ({ page }) => {
    await open(page);
    await answerWelcome(page, 'News & events');
    await expect(rail(page).locator('[data-featured-card="el-eyebrow-title"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(firstGroup(page)).toHaveAttribute('data-library-category', 'Events & dates');
    await expect(page.locator('[data-quick-start]')).toContainText('Step 1 of 2');
  });

  test('the answer is kept, and asked only once', async ({ page }) => {
    await open(page);
    await answerWelcome(page, 'Social posts');
    await page.waitForTimeout(1_500);
    await page.reload();
    await page.waitForSelector('canvas');
    await page.waitForTimeout(800);
    await expect(page.getByRole('dialog', { name: QUESTION })).toHaveCount(0);
    await expect(firstGroup(page)).toHaveAttribute('data-library-category', 'Photo galleries');
    await page.getByRole('button', { name: 'Switch project' }).click();
    await expect(page.locator('[data-project]'), 'the swap made no second project').toHaveCount(1);
  });

  test('switching from the library while the tour shows step one keeps it on step one', async ({ page }) => {
    await open(page);
    await answerWelcome(page, 'Social posts');
    const tour = page.locator('[data-quick-start]');
    await expect(tour).toHaveAttribute('data-quick-step', '1');
    await rail(page).locator('[data-workspace="business"]').click();
    await expect(rail(page).locator('[data-design-card="pd-new-arrival"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(tour).toHaveAttribute('data-quick-step', '1');
    await rail(page).locator('[data-featured-card="pd-price-reveal"]').click();
    await expect(tour).toHaveAttribute('data-quick-step', '2');
  });

  test('the keyboard can answer, and Escape skips to everything', async ({ page }) => {
    await open(page);
    const question = page.getByRole('dialog', { name: QUESTION });
    await expect(question.locator('[data-workspace-option="social"]')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(question).toHaveCount(0);
    expect(await stored(page)).toBe('both');
    await expect(firstGroup(page)).toHaveAttribute('data-library-category', 'Headlines & hooks');
    await expect(page.locator('[data-quick-start]')).toHaveAttribute('data-quick-step', '1');
  });

  for (const url of ['/?template=type-typewriter', '/?frozen=1000']) {
    test(`a link that names what to show is never interrupted: ${url}`, async ({ page }) => {
      await open(page, url);
      await page.waitForTimeout(1_000);
      await expect(page.getByRole('dialog', { name: QUESTION })).toHaveCount(0);
      expect(await stored(page)).toBeNull();
    });
  }
});

test.describe('set up for social', () => {
  test.use({ storageState: seeded('social') });

  test('switching an untouched starter opens the new workspace\'s design', async ({ page }) => {
    await open(page);
    await expect(rail(page).locator('[data-design-card="flow-polaroid-pass"]')).toHaveAttribute('aria-pressed', 'true');
    await rail(page).locator('[data-workspace="business"]').click();
    await expect(rail(page).locator('[data-design-card="pd-new-arrival"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-toast]')).toContainText('A matching design is now open.');
    expect(await stored(page)).toBe('business');
  });

  test('picks are copies: no duplicate cards, and they step aside for a search or a filter', async ({ page }) => {
    await open(page);
    const ids = await rail(page).locator('[data-design-card]').evaluateAll((cards) => cards.map((c) => c.getAttribute('data-design-card')));
    expect(new Set(ids).size).toBe(ids.length);

    await rail(page).getByRole('searchbox', { name: 'Search templates' }).fill('pricing');
    await expect(rail(page).locator('[data-library-featured]')).toHaveCount(0);
    await expect(rail(page).locator('[data-design-card="biz-pricing"]')).toHaveCount(1);
    await rail(page).getByRole('searchbox', { name: 'Search templates' }).fill('');

    await rail(page).getByRole('button', { name: 'Free', exact: true }).click();
    await expect(rail(page).locator('[data-library-featured]')).toHaveCount(0);
    await rail(page).getByRole('button', { name: 'All', exact: true }).click();

    await rail(page).locator('[data-fold-all]').click();
    await expect(rail(page).locator('[data-design-card], [data-featured-card]')).toHaveCount(0);
  });

  test('folds are remembered per workspace, and a switch opens the new one\'s first groups', async ({ page }) => {
    await open(page);
    await groupHeader(page, 'Moodboards').click();
    await expect(groupHeader(page, 'Moodboards')).toHaveAttribute('aria-expanded', 'true');
    await page.reload();
    await page.waitForSelector('canvas');
    await expect(groupHeader(page, 'Moodboards')).toHaveAttribute('aria-expanded', 'true');

    await rail(page).locator('[data-workspace="business"]').click();
    await expect(groupHeader(page, 'Products')).toHaveAttribute('aria-expanded', 'true');
    await expect(rail(page).locator('[data-library-featured] h3 button')).toHaveAttribute('aria-expanded', 'true');
    await expect(groupHeader(page, 'Moodboards')).toHaveAttribute('aria-expanded', 'false');

    await rail(page).locator('[data-workspace="social"]').click();
    await expect(groupHeader(page, 'Moodboards')).toHaveAttribute('aria-expanded', 'true');
    await expect(groupHeader(page, 'Photo galleries')).toHaveAttribute('aria-expanded', 'true');
  });
});

test.describe('set up for everything', () => {
  test.use({ storageState: seeded('both') });

  test('switching never touches a project someone has worked on', async ({ page }) => {
    await open(page);
    await page.getByRole('group', { name: 'Aspect ratio' }).getByRole('button', { name: '1:1', exact: true }).click();
    await rail(page).locator('[data-workspace="business"]').click();
    await expect(firstGroup(page)).toHaveAttribute('data-library-category', 'Products');
    await expect(page.locator('[data-toast]')).toContainText('Your project has not changed.');
    // The design is still the one worked on; its group starts folded here.
    await groupHeader(page, '3D & depth').click();
    await expect(rail(page).locator('[data-design-card="depth-parallax"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: /^Undo/ })).toBeEnabled();
  });

  test('"everything" keeps the library exactly as it was', async ({ page }) => {
    await open(page);
    await expect(rail(page).locator('[data-library-featured]')).toHaveCount(0);
    await expect(firstGroup(page)).toHaveAttribute('data-library-category', 'Headlines & hooks');
    await expect(rail(page).locator('[data-workspace="both"]')).toHaveAttribute('aria-checked', 'true');
  });

  test('the menu changes the answer, and closing it changes nothing', async ({ page }) => {
    await open(page);
    await page.locator('[data-app-menu]').click();
    const item = page.getByRole('menuitem', { name: /^Set up for…/ });
    await expect(item).toContainText('All');
    await item.click();
    const form = page.getByRole('dialog', { name: QUESTION });
    await expect(form.locator('[data-workspace-option="both"]')).toHaveAttribute('aria-current', 'true');
    await form.getByRole('button', { name: 'Close without changing' }).click();
    await expect(form).toHaveCount(0);
    await expect(page.locator('[data-toast]')).toHaveCount(0);
    expect(await stored(page)).toBe('both');

    await page.locator('[data-app-menu]').click();
    await page.getByRole('menuitem', { name: /^Set up for…/ }).click();
    await form.locator('[data-workspace-option="news"]').click();
    await expect(firstGroup(page)).toHaveAttribute('data-library-category', 'Events & dates');
    expect(await stored(page)).toBe('news');
  });

  test('a returning visitor is asked once, and their project stays as it is', async ({ page }) => {
    await open(page);
    await page.locator('[data-project-title]').click();
    await page.getByLabel('Rename project').fill('Our launch');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1_500);
    await page.evaluate(() => { localStorage.removeItem('ms.workspace'); });
    await page.reload();
    await page.waitForSelector('canvas');
    await answerWelcome(page, 'Social posts');
    await expect(page.locator('[data-project-title]')).toHaveText('Our launch');
    await expect(firstGroup(page)).toHaveAttribute('data-library-category', 'Photo galleries');
    await groupHeader(page, '3D & depth').click();
    await expect(rail(page).locator('[data-design-card="depth-parallax"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-quick-start]'), 'the tour does not restart').toHaveCount(0);
  });

  test('the rail\'s controls fit on one line each', async ({ page }) => {
    await open(page);
    const box = await rail(page).boundingBox();
    const fold = await rail(page).locator('[data-fold-all]').boundingBox();
    const sw = await rail(page).locator('[data-workspace-switch]').boundingBox();
    expect((fold?.x ?? 0) + (fold?.width ?? 0)).toBeLessThanOrEqual((box?.x ?? 0) + (box?.width ?? 0));
    expect(sw?.height ?? 99).toBeLessThanOrEqual(30);
  });
});

test.describe('on a tablet', () => {
  test.use({ viewport: { width: 900, height: 1000 }, storageState: EMPTY });

  test('the question is a centred window, and Choose a design follows the answer', async ({ page }) => {
    await open(page);
    const panel = page.locator('[data-workspace-question]');
    await expect(panel).toBeVisible();
    const box = await panel.boundingBox();
    expect(box?.width ?? 999).toBeLessThanOrEqual(560);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(1000);
    await answerWelcome(page, 'Business ads');
    await page.locator('[data-tour="design"]').first().click();
    const sheet = page.getByRole('dialog', { name: 'Choose a design' });
    await expect(sheet.locator('[data-workspace-switch]')).toBeVisible();
    await expect(sheet.locator('[data-library-featured]')).toBeVisible();
    await expect(sheet.locator('[data-library-category]').first()).toHaveAttribute('data-library-category', 'Products');
  });
});
