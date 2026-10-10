import { expect, test, type Page } from '@playwright/test';

/**
 * Designs as building blocks, and projects as files (D-140, D-141).
 *
 * "Can I design multiple and save, then, on video I can do Add scene and the
 * options will be new scene or saved scene" — and "implement the Save project
 * file… option to Open project".
 */

test.use({ viewport: { width: 1500, height: 940 } });

const toast = (page: Page) => page.locator('[data-toast]');
const sceneClips = (page: Page) => page.locator('[data-scene-clip]');

async function menu(page: Page, item: RegExp): Promise<void> {
  await page.locator('[data-app-menu]').click();
  await page.getByRole('menuitem', { name: item }).click();
}

/** A photograph of "yours", uploaded through the Photos panel. */
async function uploadOwnPhoto(page: Page): Promise<void> {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d');
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(0, 0, 300, 400);
    return canvas.toDataURL('image/png').split(',')[1] ?? '';
  });
  await page.getByRole('tab', { name: 'Photos' }).click();
  await page.getByLabel('Add photos to this scene').setInputFiles({ name: 'mine.png', mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') });
  await expect(page.locator('[data-media-id]:not([data-media-id^="sample:"])').first()).toBeVisible({ timeout: 10_000 });
}

test('a saved design comes into a video as a scene, from My designs', async ({ page }) => {
  await page.goto('/?template=type-typewriter&aspect=9:16');
  await page.waitForSelector('canvas');
  await page.waitForTimeout(1_200);
  await page.getByRole('tab', { name: 'Style' }).click();
  await page.locator('[data-look="emerald"]').click();
  await expect(page.locator('[data-save-state]').first()).toHaveAttribute('data-save-state', 'saved', { timeout: 10_000 });

  await menu(page, /^New video/);
  await expect(toast(page)).toContainText('New video');
  const before = await sceneClips(page).count();

  await page.getByRole('button', { name: /^Add a scene after this one/ }).click();
  const picker = page.getByRole('dialog', { name: 'Add a scene' });
  await picker.getByRole('tab', { name: 'My designs' }).click();
  const design = picker.locator('[data-my-design]').first();
  await expect(design).toBeVisible();
  await design.click();

  await expect(picker).toHaveCount(0);
  await expect(sceneClips(page)).toHaveCount(before + 1);
  await expect(toast(page)).toContainText('Added your design');
});

test('a project saved as a file opens on another device with its photos', async ({ page, browser }) => {
  await page.goto('/?template=pop-float&aspect=1:1');
  await page.waitForSelector('canvas');
  await page.waitForTimeout(1_200);
  await uploadOwnPhoto(page);

  const downloading = page.waitForEvent('download');
  await menu(page, /^Save project file/);
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/\.qmotion$/);
  const path = await download.path();

  // Another device: nothing of the first one's storage.
  const other = await browser.newContext({
    viewport: { width: 1500, height: 940 },
    storageState: { cookies: [], origins: [{ origin: new URL(page.url()).origin, localStorage: [{ name: 'ms.quickstart', value: 'done' }] }] },
  });
  const there = await other.newPage();
  await there.goto('/');
  await there.waitForSelector('canvas');
  await there.getByRole('tab', { name: 'Photos' }).click();
  await expect(there.locator('[data-media-id]:not([data-media-id^="sample:"])')).toHaveCount(0);

  const choosing = there.waitForEvent('filechooser');
  await menu(there, /^Open project file/);
  await (await choosing).setFiles(path);
  await expect(toast(there)).toContainText('Opened');
  await there.getByRole('tab', { name: 'Photos' }).click();
  await expect(there.locator('[data-media-id]:not([data-media-id^="sample:"])').first()).toBeVisible({ timeout: 10_000 });
  await other.close();
});

test('a file that is not a project is refused, and the open project stays', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('canvas');
  const choosing = page.waitForEvent('filechooser');
  await menu(page, /^Open project file/);
  await (await choosing).setFiles({ name: 'notes.qmotion', mimeType: 'application/octet-stream', buffer: Buffer.from('not a zip') });
  await expect(toast(page)).toContainText(/not a Q Motion Studio project|damaged/);
  await expect(page.locator('canvas')).toBeVisible();
});
