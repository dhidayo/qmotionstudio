import { answerWelcome } from '../support/workspace';
import { expect, test, type Page } from '@playwright/test';

/**
 * "Your photos" (D-147), photo spots (D-150) and the guided quick start
 * (D-148), on a phone.
 *
 * Asked for as: photos taken one at a time with the camera must not replace
 * each other; every photo added stays in the project until the person deletes
 * it; "remove a sample photo for each uploaded photos", with samples in any
 * spot their photos do not fill yet. And a quick start that points at the
 * button to press, step by step, rather than a card over the screen.
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

const library = (page: Page): Promise<number> => page.evaluate(() =>
  (globalThis as unknown as { __motionStudio: { editor: { getState: () => { project: { photoLibrary?: string[] } } } } })
    .__motionStudio.editor.getState().project.photoLibrary?.length ?? 0);

const distinctOwn = async (page: Page): Promise<number> => new Set((await shown(page)).filter((id) => id.startsWith('upload:'))).size;

/** The design's own spots in Photos (D-150): `upload:` for yours, `sample:` for the samples. */
const spots = (page: Page, kind: 'upload' | 'sample') => page.locator(`[data-design-photos] [data-media-id^="${kind}:"]`);

async function openPhotos(page: Page): Promise<void> {
  await page.locator('[data-phone-toolbar="main"]').getByRole('button', { name: 'Photos', exact: true }).click();
  await expect(page.locator('[data-design-photos]')).toBeVisible();
}

/** "Your photos" folds like every section in a phone's sheet, which opens one at a time. */
async function openYourPhotos(page: Page): Promise<void> {
  await page.locator('[data-section="Your photos"] h3 button').click();
  await expect(page.locator('[data-your-photos]')).toBeVisible();
}

test('photos taken one at a time build up instead of replacing each other', async ({ page }) => {
  test.skip(process.env['PW_PROD'] === '1', DEV_ONLY);
  await open(page, LIFESTYLE);
  // Each camera shot arrives as one file, on its own, and takes the next sample's place (D-150).
  await page.getByLabel('Take a photo').first().setInputFiles(await picture(page, '#ff2d55'));
  await expect.poll(() => distinctOwn(page)).toBe(1);
  await page.getByLabel('Take a photo').first().setInputFiles(await picture(page, '#2dd4ff'));
  await expect.poll(() => distinctOwn(page)).toBe(2);
  const ids = await shown(page);
  expect(ids.slice(0, 2).every((id) => id.startsWith('upload:')), 'the first two spots').toBe(true);
  expect(ids.slice(2).every((id) => id.startsWith('sample:')), 'samples in the rest').toBe(true);

  await openPhotos(page);
  await expect(spots(page, 'upload')).toHaveCount(2);
  await expect(spots(page, 'sample')).toHaveCount(2);
  // Both are in the design, so Your photos has nothing to offer and stays out of the way.
  await expect(page.locator('[data-section="Your photos"]')).toHaveCount(0);
});

test('four spots and three photos: three of yours and one sample; + adds a sample spot (D-150)', async ({ page }) => {
  test.skip(process.env['PW_PROD'] === '1', DEV_ONLY);
  await open(page, LIFESTYLE);
  await page.getByLabel('Add your photos').first().setInputFiles([
    await picture(page, '#ff2d55'), await picture(page, '#2dd4ff'), await picture(page, '#22c55e'),
  ]);
  await expect.poll(() => distinctOwn(page)).toBe(3);
  await expect(page.locator('[data-toast]')).toContainText('Your 3 photos replaced 3 samples.');
  expect((await shown(page))[3]).toMatch(/^sample:/);

  await openPhotos(page);
  await page.getByRole('button', { name: 'Increase Photo spots' }).click();
  await expect(spots(page, 'sample')).toHaveCount(2);
  await expect.poll(async () => (await shown(page)).length).toBe(5);
  expect(new Set(await shown(page)).size, 'no photo shown twice').toBe(5);
});

test('a photo can be taken out of the design, put back, and deleted from the project', async ({ page }) => {
  test.skip(process.env['PW_PROD'] === '1', DEV_ONLY);
  await open(page, LIFESTYLE);
  await page.getByLabel('Add your photos').first().setInputFiles([await picture(page, '#ff2d55'), await picture(page, '#2dd4ff')]);
  await expect.poll(() => distinctOwn(page)).toBe(2);
  await openPhotos(page);

  // Out of the design: a sample goes back in its spot, and the photo waits in Your photos.
  await page.getByRole('button', { name: 'Take your photo out of spot 1' }).click();
  await expect.poll(() => distinctOwn(page)).toBe(1);
  expect((await shown(page))[0]).toMatch(/^sample:/);
  await openYourPhotos(page);
  const tiles = page.locator('[data-library-photo]');
  await expect(tiles).toHaveCount(1);

  // Back in, in place of the first sample — spot 1 again.
  await tiles.first().getByRole('button', { name: 'Use this photo in the design' }).click();
  await expect.poll(() => distinctOwn(page)).toBe(2);
  expect((await shown(page))[0]).toMatch(/^upload:/);
  await expect(page.locator('[data-section="Your photos"]')).toHaveCount(0);

  // Deleted: out of the design first, then from the project, where undo could bring it back.
  await page.getByRole('button', { name: 'Take your photo out of spot 2' }).click();
  await openYourPhotos(page);
  await tiles.first().getByRole('button', { name: 'Delete this photo from the project' }).click();
  await expect(page.locator('[data-section="Your photos"]')).toHaveCount(0);
  await expect.poll(() => library(page)).toBe(1);
  await expect.poll(() => distinctOwn(page)).toBe(1);
});

test('photos kept only in Your photos are still there after a reload', async ({ page }) => {
  test.skip(process.env['PW_PROD'] === '1', DEV_ONLY);
  await open(page, LIFESTYLE);
  await page.getByLabel('Add your photos').first().setInputFiles([await picture(page, '#ff2d55'), await picture(page, '#2dd4ff')]);
  await expect.poll(() => distinctOwn(page)).toBe(2);
  await openPhotos(page);
  await page.getByRole('button', { name: 'Take your photo out of spot 2' }).click();
  await expect.poll(() => distinctOwn(page)).toBe(1);
  await page.waitForTimeout(2_500);

  await page.goto('/');
  await page.waitForSelector('canvas');
  await page.waitForTimeout(1_500);
  await openPhotos(page);
  await expect(spots(page, 'upload')).toHaveCount(1);
  await openYourPhotos(page);
  await expect(page.locator('[data-library-photo]')).toHaveCount(1);
  await expect(page.locator('[data-library-photo] img')).toHaveCount(1);
});

test.describe('the quick start', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('points at one button at a time and moves on when it is pressed', async ({ page }) => {
    await open(page, '/');
    await answerWelcome(page, 'A bit of everything');
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
