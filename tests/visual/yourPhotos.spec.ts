import { expect, test, type Page } from '@playwright/test';

/**
 * "Your photos" (D-147) and the guided quick start (D-148), on a phone.
 *
 * Asked for as: photos taken one at a time with the camera must not replace
 * each other; every photo added stays in the project until the person deletes
 * it; each scene picks which of them it shows. And a quick start that points
 * at the button to press, step by step, rather than a card over the screen.
 */

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const DEV_ONLY = 'Reads the dev-only editor handle, which the production build rightly omits.';
const LIFESTYLE = '/?template=pop-float&aspect=1:1&frozen=3000';

async function open(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.waitForSelector('canvas');
  await page.waitForTimeout(1_500);
}

async function picture(page: Page, colour: string): Promise<{ name: string; mimeType: string; buffer: Buffer }> {
  const base64 = await page.evaluate((fill) => {
    const canvas = document.createElement('canvas');
    canvas.width = 120;
    canvas.height = 120;
    const cx = canvas.getContext('2d');
    if (!cx) throw new Error('no context');
    cx.fillStyle = fill;
    cx.fillRect(0, 0, 120, 120);
    return canvas.toDataURL('image/png').split(',')[1] ?? '';
  }, colour);
  return { name: `${colour.slice(1)}.png`, mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') };
}

const shown = (page: Page): Promise<string[]> => page.evaluate(() =>
  (globalThis as unknown as { __motionStudio: { editor: { getState: () => { project: { scenes: { inputs: { photos: { mediaId: string }[] } }[] } } } } })
    .__motionStudio.editor.getState().project.scenes[0]?.inputs.photos.map((p) => p.mediaId) ?? []);

const distinctOwn = async (page: Page): Promise<number> => new Set((await shown(page)).filter((id) => id.startsWith('upload:'))).size;

async function openPhotos(page: Page): Promise<void> {
  await page.locator('[data-phone-toolbar="main"]').getByRole('button', { name: 'Photos', exact: true }).click();
  await expect(page.locator('[data-your-photos]')).toBeVisible();
}

test('photos taken one at a time build up instead of replacing each other', async ({ page }) => {
  test.skip(process.env['PW_PROD'] === '1', DEV_ONLY);
  await open(page, LIFESTYLE);
  // Each camera shot arrives as one file, on its own.
  await page.getByLabel('Take a photo').first().setInputFiles(await picture(page, '#ff2d55'));
  await expect.poll(() => distinctOwn(page)).toBe(1);
  await page.getByLabel('Take a photo').first().setInputFiles(await picture(page, '#2dd4ff'));
  await expect.poll(() => distinctOwn(page)).toBe(2);

  await openPhotos(page);
  await expect(page.locator('[data-library-photo]')).toHaveCount(2);
  await expect(page.locator('[data-library-photo] [aria-pressed="true"]')).toHaveCount(2);
});

test('a photo can be taken out of a scene, put back, and deleted from the project', async ({ page }) => {
  test.skip(process.env['PW_PROD'] === '1', DEV_ONLY);
  await open(page, LIFESTYLE);
  await page.getByLabel('Add your photos').first().setInputFiles([await picture(page, '#ff2d55'), await picture(page, '#2dd4ff')]);
  await expect.poll(() => distinctOwn(page)).toBe(2);
  await openPhotos(page);

  const tiles = page.locator('[data-library-photo]');
  // Out of the scene — still in Your photos.
  await tiles.nth(0).getByRole('button', { name: /tap to take it out/ }).click();
  await expect.poll(() => distinctOwn(page)).toBe(1);
  await expect(tiles).toHaveCount(2);
  // Back in, now second.
  await tiles.nth(0).getByRole('button', { name: 'Use this photo here' }).click();
  await expect.poll(() => distinctOwn(page)).toBe(2);
  await expect(tiles.nth(0).getByText('2', { exact: true })).toBeVisible();

  // Deleted: gone from the project and from the scene.
  await tiles.nth(1).getByRole('button', { name: 'Delete this photo from the project' }).click();
  await expect(tiles).toHaveCount(1);
  await expect.poll(() => distinctOwn(page)).toBe(1);
});

test('photos kept only in Your photos are still there after a reload', async ({ page }) => {
  test.skip(process.env['PW_PROD'] === '1', DEV_ONLY);
  await open(page, LIFESTYLE);
  await page.getByLabel('Add your photos').first().setInputFiles([await picture(page, '#ff2d55'), await picture(page, '#2dd4ff')]);
  await expect.poll(() => distinctOwn(page)).toBe(2);
  await openPhotos(page);
  await page.locator('[data-library-photo]').nth(1).getByRole('button', { name: /tap to take it out/ }).click();
  await expect.poll(() => distinctOwn(page)).toBe(1);
  await page.waitForTimeout(2_500);

  await page.goto('/');
  await page.waitForSelector('canvas');
  await page.waitForTimeout(1_500);
  await openPhotos(page);
  await expect(page.locator('[data-library-photo]')).toHaveCount(2);
  await expect(page.locator('[data-library-photo] img')).toHaveCount(2);
});

test.describe('the quick start', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('points at one button at a time and moves on when it is pressed', async ({ page }) => {
    await open(page, '/');
    const tour = page.locator('[data-quick-start]');
    await expect(tour).toBeVisible();
    await expect(tour).toHaveAttribute('data-quick-step', '1');
    await expect(tour).toContainText('Choose a design');

    // The popup sits beside the button it names, and does not cover it.
    const target = await page.locator('[data-tour="design"]').first().boundingBox();
    const popup = await tour.boundingBox();
    expect(target).not.toBeNull();
    expect(popup).not.toBeNull();
    if (target && popup) {
      const overlaps = popup.y < target.y + target.height && popup.y + popup.height > target.y;
      expect(overlaps, 'the popup leaves the button free').toBe(false);
    }

    // Step one done the ordinary way: the tour steps aside while the sheet is open.
    await page.locator('[data-tour="design"]').first().click();
    await expect(tour).toHaveCount(0);
    await page.locator('[data-design-card="type-typewriter"]').click();
    await page.getByRole('button', { name: 'Use this design' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(tour).toHaveAttribute('data-quick-step', '2');
    await expect(tour).toContainText('Add your photos');

    await page.getByLabel('Add your photos').first().setInputFiles(await picture(page, '#ff2d55'));
    await expect(tour).toHaveAttribute('data-quick-step', '3');
    await expect(tour).toContainText('Export');

    await tour.getByRole('button', { name: 'Skip tour' }).click();
    await expect(tour).toHaveCount(0);
    await page.reload();
    await page.waitForSelector('canvas');
    await expect(page.locator('[data-quick-start]')).toHaveCount(0);
  });
});
