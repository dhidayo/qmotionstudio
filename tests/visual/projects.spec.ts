import { expect, test, type Page } from '@playwright/test';

/**
 * Choosing scenes, starting from nothing, and managing projects (D-097–D-099).
 *
 * Reported together: "+ Scene" forced a design on you, there was no blank
 * canvas, the project's name was buried in a dialog, there was no Save as —
 * and work had to carry on across all of it ("ensure continuity in user work").
 */

test.use({ viewport: { width: 1500, height: 940 } });

const toast = (page: Page) => page.locator('[data-toast]');

/** An ad project, with the timeline on screen. */
async function openAd(page: Page): Promise<void> {
  await page.goto('/?template=quick-pitch&aspect=9:16&frozen=1000');
  await page.waitForSelector('canvas');
  await page.waitForTimeout(2_000);
}

const sceneClips = (page: Page) => page.getByRole('button', { name: /^\d+\. / });

/** A photograph of "yours": a generated PNG, uploaded through the Photos panel. */
async function uploadOwnPhoto(page: Page): Promise<void> {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d');
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(0, 0, 300, 400);
    ctx.fillStyle = '#f1c40f';
    ctx.fillRect(60, 80, 180, 240);
    return canvas.toDataURL('image/png').split(',')[1] ?? '';
  });
  await page.getByRole('tab', { name: 'Photos' }).click().catch(() => undefined);
  await page.getByLabel('Add photos to this scene').setInputFiles({
    name: 'my-own-photo.png',
    mimeType: 'image/png',
    buffer: Buffer.from(base64, 'base64'),
  });
  // Decoded and in the panel.
  await expect(page.locator('[data-media-id]:not([data-media-id^="sample:"])').first()).toBeVisible({ timeout: 10_000 });
}

test.describe('+ Scene asks what kind of scene (D-097)', () => {
  test('adds the design you choose, after the selected scene', async ({ page }) => {
    await openAd(page);
    await expect(sceneClips(page)).toHaveCount(5);

    await page.getByRole('button', { name: /^Add a scene after this one/ }).click();
    const picker = page.getByRole('dialog', { name: 'Add a scene' });
    await expect(picker).toBeVisible();

    await picker.getByRole('button', { name: /^Float Away/ }).click();
    await expect(picker).toHaveCount(0);

    await expect(sceneClips(page)).toHaveCount(6);
    await expect(sceneClips(page).nth(1)).toHaveText(/2\. Float Away/);
    await expect(toast(page)).toContainText('Added “Float Away” as scene 2');
  });

  test('finds designs by name', async ({ page }) => {
    await openAd(page);
    await page.getByRole('button', { name: /^Add a scene after this one/ }).click();
    const picker = page.getByRole('dialog', { name: 'Add a scene' });

    await picker.getByLabel('Search designs').fill('quote');
    await expect(picker.getByRole('button', { name: /^Pull Quote/ })).toBeVisible();
    await expect(picker.getByRole('button', { name: /^Scatter/ })).toHaveCount(0);
  });

  test('offers a blank scene to build on', async ({ page }) => {
    await openAd(page);
    await page.getByRole('button', { name: /^Add a scene after this one/ }).click();
    await page.getByRole('dialog', { name: 'Add a scene' }).getByRole('button', { name: /^Blank/ }).click();
    await expect(sceneClips(page).nth(1)).toHaveText(/2\. Blank/);
  });

  test('changes a scene’s design and keeps its length', async ({ page }) => {
    await openAd(page);
    const length = page.getByLabel('Scene length');
    const before = await length.inputValue();

    await page.getByRole('button', { name: "Change this scene's design" }).click();
    const picker = page.getByRole('dialog', { name: 'Change scene 1' });
    await picker.getByRole('button', { name: /^Big Number/ }).click();

    await expect(sceneClips(page)).toHaveCount(5);
    await expect(sceneClips(page).first()).toHaveText(/1\. Big Number/);
    await expect(length).toHaveValue(before);
  });
});

test.describe('your work carries on (D-098)', () => {
  test('a new scene starts with your own photos, not the samples', async ({ page }) => {
    await openAd(page);
    await uploadOwnPhoto(page);

    await page.getByRole('button', { name: /^Add a scene after this one/ }).click();
    await page.getByRole('dialog', { name: 'Add a scene' }).getByRole('button', { name: /^Scatter/ }).click();

    // The new scene is selected, and its photos are the uploaded one.
    const mine = page.locator('[data-media-id]:not([data-media-id^="sample:"])');
    await expect(mine.first()).toBeVisible();
    await expect(page.locator('[data-media-id^="sample:"]')).toHaveCount(0);
  });
});

test.describe('the project, named at the top (D-099)', () => {
  test('click the name to rename it; it saves and says so', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('canvas');
    await page.waitForTimeout(2_000);

    await page.getByRole('button', { name: /^Project: .*Click to rename/ }).click();
    const field = page.getByLabel('Rename project');
    await field.fill('Autumn launch');
    await field.press('Enter');

    await expect(page.getByRole('button', { name: /^Project: Autumn launch/ })).toBeVisible();
    await expect(toast(page)).toContainText('“Autumn launch” saved');

    // Saved, not merely displayed: it survives a reload.
    await page.reload();
    await page.waitForSelector('canvas');
    await expect(page.getByRole('button', { name: /^Project: Autumn launch/ })).toBeVisible({ timeout: 10_000 });
  });

  test('Escape abandons a rename', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('canvas');
    await page.getByRole('button', { name: /^Project: .*Click to rename/ }).click();
    await page.getByLabel('Rename project').fill('Not this');
    await page.getByLabel('Rename project').press('Escape');
    await expect(page.getByRole('button', { name: /^Project: Untitled project/ })).toBeVisible();
  });

  test('Save as opens a renamed copy and leaves the original alone', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('canvas');
    await page.waitForTimeout(2_000);
    await page.getByRole('button', { name: /^Project: .*Click to rename/ }).click();
    await page.getByLabel('Rename project').fill('Original');
    await page.getByLabel('Rename project').press('Enter');

    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await page.getByRole('menuitem', { name: /^Save as/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Save as' });
    await dialog.getByLabel('Name').fill('Version two');
    await dialog.getByRole('button', { name: 'Save as' }).click();

    await expect(page.getByRole('button', { name: /^Project: Version two/ })).toBeVisible();
    await expect(toast(page)).toContainText('Saved as “Version two”');

    await page.getByRole('button', { name: 'Switch project' }).click();
    const list = page.getByRole('dialog', { name: 'Switch project' });
    await expect(list.locator('[data-project]')).toHaveCount(2);
    await expect(list).toContainText('Original');
  });

  test('Make a copy saves one and keeps you where you are', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('canvas');
    await page.waitForTimeout(2_000);
    await page.getByRole('button', { name: /^Project: .*Click to rename/ }).click();
    await page.getByLabel('Rename project').fill('Keeper');
    await page.getByLabel('Rename project').press('Enter');

    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await page.getByRole('menuitem', { name: /^Make a copy/ }).click();

    await expect(toast(page)).toContainText('Copy saved as “Keeper copy”');
    await expect(page.getByRole('button', { name: /^Project: Keeper\. Click/ })).toBeVisible();
  });

  test('a blank canvas opens in Motion Ads with one blank scene', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('canvas');
    await page.waitForTimeout(1_500);

    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await page.getByRole('menuitem', { name: /^New video/ }).click();

    await expect(page.getByRole('button', { name: /^Project: Untitled video/ })).toBeVisible();
    await expect(sceneClips(page)).toHaveCount(1);
    await expect(sceneClips(page).first()).toHaveText(/1\. Blank/);
    // And the tools for building on it are right there.
    await expect(page.getByTitle('Add a text overlay')).toBeVisible();
  });
});
