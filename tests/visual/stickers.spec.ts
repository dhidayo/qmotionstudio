import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * The animated sticker library (D-158): "should we have animations that we can
 * add too? … Youtube like, YouTube subscribe, FaceBook like, lots of library
 * for this."
 *
 * The library's art is tested in Node (src/core/stickers/stickers.test.ts);
 * these check what a person meets: every sticker in the Elements picker under
 * its kind, words that can be changed and undone, and pictures of the picker
 * and the canvas for review.
 */

test.skip(process.env['PW_PROD'] === '1', 'Reads the dev-only editor handle, which the production build rightly omits.');

const SHOTS = process.env['STICKER_SHOTS'];

type Handle = {
  editor: { getState(): { project: { overlays: { kind: string; content: Record<string, unknown> }[] } } };
};

const picker = (page: Page): Locator => page.getByRole('dialog', { name: 'Elements' });

async function open(page: Page, theme: 'light' | 'dark' = 'light'): Promise<void> {
  await page.addInitScript((t) => { localStorage.setItem('ms.theme', t); }, theme);
  await page.goto('/?template=el-cta-button&aspect=1:1&frozen=3000');
  await page.waitForSelector('canvas');
  await page.waitForTimeout(1_500);
}

async function openStickers(page: Page): Promise<void> {
  await page.locator('[data-add-bar] [data-add="element"]').first().click();
  await expect(picker(page)).toBeVisible();
  await picker(page).getByRole('tab', { name: 'Stickers', exact: true }).click();
}

async function contents(page: Page): Promise<Record<string, unknown>[]> {
  return page.evaluate(() => (globalThis as unknown as { __motionStudio: Handle }).__motionStudio.editor.getState().project.overlays.map((o) => o.content));
}

test.describe('on a computer', () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  test('the picker lists every sticker under its kind', async ({ page }) => {
    await open(page);
    await openStickers(page);
    await expect(picker(page).locator('[data-element-tile^="sticker:"]')).toHaveCount(30);
    for (const [kind, first] of [['Social', 'subscribe'], ['Reactions', 'react-laugh'], ['Badges', 'burst-new'], ['Pointers', 'pointer-arrow']] as const) {
      await picker(page).getByRole('tab', { name: kind, exact: true }).click();
      await expect(picker(page).locator(`[data-element-tile="sticker:${first}"]`)).toBeVisible();
      await expect(picker(page).locator('[data-element-tile^="shape:"]')).toHaveCount(0);
    }
    // Search finds a sticker by what it is for.
    await picker(page).getByRole('tab', { name: 'All', exact: true }).first().click();
    await picker(page).getByRole('searchbox').fill('subscribe');
    await expect(picker(page).locator('[data-element-tile="sticker:subscribe"]')).toBeVisible();
  });

  test('a sticker’s words can be changed, and undone', async ({ page }) => {
    await open(page);
    await openStickers(page);
    await picker(page).locator('[data-element-tile="sticker:subscribe"]').click();
    await expect(picker(page)).toHaveCount(0);
    const words = page.getByLabel('Button words');
    await words.fill('JOIN US');
    await words.press('Enter');
    await expect.poll(async () => ((await contents(page))[0]?.['labels'] as Record<string, string> | undefined)?.['label']).toBe('JOIN US');
    await page.locator('canvas').first().click({ position: { x: 5, y: 5 }, force: true }).catch(() => undefined);
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(async () => ((await contents(page))[0]?.['labels'] as Record<string, string> | undefined)?.['label']).not.toBe('JOIN US');
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`pictures of the picker and the canvas, ${theme}`, async ({ page }) => {
      test.skip(!SHOTS, 'Pictures for review only: set STICKER_SHOTS to a folder.');
      await open(page, theme);
      await openStickers(page);
      await picker(page).locator('[data-element-tile="sticker:like"]').hover();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${SHOTS}/picker-desktop-${theme}.png` });
      await picker(page).locator('[data-element-tile="sticker:subscribe"]').click();
      for (const id of ['burst-sale', 'react-love', 'pointer-hand']) {
        await openStickers(page);
        await picker(page).locator(`[data-element-tile="sticker:${id}"]`).click();
      }
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${SHOTS}/canvas-desktop-${theme}.png` });
    });
  }
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  for (const theme of ['light', 'dark'] as const) {
    test(`pictures of the sticker sheet, ${theme}`, async ({ page }) => {
      test.skip(!SHOTS, 'Pictures for review only: set STICKER_SHOTS to a folder.');
      await open(page, theme);
      await page.locator('[data-phone-toolbar="main"]').getByRole('button', { name: 'Add', exact: true }).tap();
      await page.locator('[data-add="element"]').tap();
      await expect(picker(page)).toBeVisible();
      await picker(page).getByRole('tab', { name: 'Stickers', exact: true }).tap();
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${SHOTS}/picker-phone-${theme}.png` });
      await picker(page).locator('[data-element-tile="sticker:subscribe"]').tap();
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${SHOTS}/canvas-phone-${theme}.png` });
    });
  }
});
