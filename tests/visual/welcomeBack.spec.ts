import { expect, test, type BrowserContext, type Page } from '@playwright/test';

/**
 * D-168: "When I open the application again, it goes straight to my last
 * design … it would be nice to have a popup if an existing design exists."
 *
 * Opening the app afresh is a new tab in the same browser: the same saved
 * work (IndexedDB is the context's), a new session. A reload of the tab in
 * use is carrying on, and asks nothing.
 */

test.use({ viewport: { width: 1366, height: 768 } });

type Handle = { __motionStudio: { editor: { getState: () => { project: { id: string; name: string; overlays: unknown[] } } } } };

const project = (page: Page) => page.evaluate(() => {
  const { project: p } = (globalThis as unknown as Handle).__motionStudio.editor.getState();
  return { id: p.id, name: p.name, layers: p.overlays.length };
});

async function openEditor(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('canvas');
  await page.waitForTimeout(1_500);
}

/** Some work, written to disk (persistence.spec's `settled`). */
async function makeWork(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Video', exact: true }).click();
  await page.getByTitle('Add a text overlay').click();
  await page.getByLabel('Overlay text').fill('Welcome back check');
  await page.waitForTimeout(1_200);
  await expect(page.locator('[data-save-state]')).toHaveAttribute('data-save-state', 'saved', { timeout: 10_000 });
}

async function openAgain(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.goto('/');
  await page.waitForSelector('canvas');
  return page;
}

const welcome = (page: Page) => page.getByRole('dialog', { name: 'Welcome back' });

test('opening again onto work asks first; Continue editing and Escape keep it', async ({ page, context }) => {
  await openEditor(page);
  await makeWork(page);
  const before = await project(page);

  const again = await openAgain(context);
  const dialog = welcome(again);
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await expect(dialog).toContainText(`${before.name} was last changed today at`);
  await expect(dialog).toContainText('Your designs save automatically on this device.');
  await expect(dialog.locator('[data-welcome-picture]')).toBeVisible();

  // Focus starts on the first answer and stays inside the window.
  const continueButton = dialog.getByRole('button', { name: 'Continue editing' });
  await expect(continueButton).toBeFocused();
  await again.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Start a new design' })).toBeFocused();
  await again.keyboard.press('Tab');
  await expect(continueButton).toBeFocused();
  await again.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Start a new design' })).toBeFocused();

  await again.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect(await project(again)).toEqual(before);

  // A reload of the tab in use is carrying on: no question.
  await again.reload();
  await again.waitForSelector('canvas');
  await again.waitForTimeout(2_000);
  await expect(welcome(again)).toHaveCount(0);
  expect(await project(again)).toEqual(before);

  // Another fresh open asks again, and Continue editing keeps the work.
  const third = await openAgain(context);
  await welcome(third).getByRole('button', { name: 'Continue editing' }).click();
  await expect(welcome(third)).toHaveCount(0);
  expect(await project(third)).toEqual(before);
});

test('Start a new design opens a new one and keeps the old in the project list', async ({ page, context }) => {
  await openEditor(page);
  await makeWork(page);
  const before = await project(page);

  const again = await openAgain(context);
  await welcome(again).getByRole('button', { name: 'Start a new design' }).click();
  await expect(welcome(again)).toHaveCount(0);
  // The menu's New video: the mode of the design left, empty.
  await expect.poll(async () => (await project(again)).id).not.toBe(before.id);
  expect((await project(again)).layers).toBe(0);
  await expect(again.locator('[data-toast]')).toContainText('New video');

  await again.getByRole('button', { name: 'Switch project' }).click();
  await expect(again.getByRole('dialog', { name: 'Switch project' })).toContainText(before.name);
});

test('not on a first visit, an untouched design, or a deep link', async ({ page, context }) => {
  await openEditor(page);
  await expect(welcome(page)).toHaveCount(0);
  await page.waitForTimeout(1_200);
  await expect(page.locator('[data-save-state]')).toHaveAttribute('data-save-state', 'saved', { timeout: 10_000 });

  // The starter, saved but untouched.
  const again = await openAgain(context);
  await again.waitForTimeout(2_000);
  await expect(welcome(again)).toHaveCount(0);

  await makeWork(again);
  const linked = await context.newPage();
  await linked.goto('/?template=depth-parallax');
  await linked.waitForSelector('canvas');
  await linked.waitForTimeout(2_000);
  await expect(welcome(linked)).toHaveCount(0);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the window fits the screen, its buttons a thumb wide, and names the phone menu', async ({ page, context }) => {
    await openEditor(page);
    // Work: the image made a video (the store's own switch, as the menu does it).
    await page.evaluate(() => {
      (globalThis as unknown as { __motionStudio: { editor: { getState: () => { setMode: (m: string) => void } } } }).__motionStudio.editor.getState().setMode('motionAd');
    });
    await page.waitForTimeout(2_500);

    const again = await openAgain(context);
    const dialog = welcome(again);
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog).toContainText('Open them any time from Open… in the menu.');
    for (const name of ['Continue editing', 'Start a new design']) {
      const box = await dialog.getByRole('button', { name }).boundingBox();
      expect(box?.height ?? 0, name).toBeGreaterThanOrEqual(44);
      expect((box?.x ?? -1) >= 0 && (box?.x ?? 0) + (box?.width ?? 0) <= 390, name).toBe(true);
    }
  });
});
