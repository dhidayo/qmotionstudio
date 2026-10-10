import { expect, test, type Page } from '@playwright/test';

/**
 * The way in, on every screen (D-116).
 *
 * Asked for as: the Designs, Photos, Text, Effects and Style tools "shown too"
 * on a computer; "Add Your Photos should be always shown, to be able to
 * replace all photos on template … same for choose template"; and a click on
 * the canvas that selects and nothing else — "clear gestures should be for
 * right clicks".
 */

const DEV_ONLY = 'Reads the dev-only editor handle, which the production build rightly omits.';
const LIFESTYLE = '/?template=pop-float&aspect=1:1&frozen=3000';

async function open(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.waitForSelector('canvas');
  await page.waitForTimeout(2_000);
}

async function canvasPoint(page: Page, fx: number, fy: number): Promise<{ x: number; y: number }> {
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('no canvas');
  return { x: box.x + box.width * fx, y: box.y + box.height * fy };
}

async function pictures(page: Page): Promise<Buffer[]> {
  const make = (colour: string): Promise<string> => page.evaluate((fill) => {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 200;
    const cx = canvas.getContext('2d');
    if (!cx) throw new Error('no context');
    cx.fillStyle = fill;
    cx.fillRect(0, 0, 200, 200);
    return canvas.toDataURL('image/png').split(',')[1] ?? '';
  }, colour);
  return [Buffer.from(await make('#ff2d55'), 'base64'), Buffer.from(await make('#2dd4ff'), 'base64')];
}

const photoIds = (page: Page): Promise<string[][]> => page.evaluate(() =>
  (globalThis as unknown as { __motionStudio: { editor: { getState: () => { project: { scenes: { inputs: { photos: { mediaId: string }[] } }[] } } } } })
    .__motionStudio.editor.getState().project.scenes.map((scene) => scene.inputs.photos.map((p) => p.mediaId)));

test.describe('on a computer', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('the tools sit under the picture, and each opens what it says', async ({ page }) => {
    await open(page, LIFESTYLE);
    const strip = page.locator('[data-tool-strip]');
    await expect(strip.getByRole('button', { name: 'Choose a design' })).toBeVisible();
    await expect(strip.getByRole('button', { name: 'Add your photos' })).toBeVisible();
    for (const name of ['Designs', 'Photos', 'Text', 'Effects', 'Style']) {
      await expect(strip.getByRole('button', { name, exact: true })).toBeVisible();
    }
    const canvas = await page.locator('canvas').boundingBox();
    const bar = await strip.boundingBox();
    expect(bar && canvas && bar.y >= canvas.y + canvas.height - 1, 'under the picture').toBe(true);

    await strip.getByRole('button', { name: 'Text', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Text' })).toHaveAttribute('aria-selected', 'true');
    await strip.getByRole('button', { name: 'Style', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Style' })).toHaveAttribute('aria-selected', 'true');

    // Designs opens as a window in the middle, not a sheet stuck to the bottom.
    await strip.getByRole('button', { name: 'Designs', exact: true }).click();
    const window = page.getByRole('dialog', { name: 'Choose a design' });
    await expect(window).toBeVisible();
    const panel = await window.locator(':scope > div').first().boundingBox();
    expect(panel && panel.y + panel.height < 900 - 10, 'floats, not docked').toBe(true);
    await window.getByRole('button', { name: 'Close choose a design' }).click();
    await expect(window).toHaveCount(0);
  });

  test('a click selects and nothing more; right-click brings the menu', async ({ page }) => {
    await open(page, LIFESTYLE);
    const at = await canvasPoint(page, 0.5, 0.5);
    await page.mouse.click(at.x, at.y);
    await expect(page.locator('[data-selection-box]')).toBeVisible();
    await page.mouse.click(at.x, at.y);
    await page.waitForTimeout(600);
    await expect(page.getByRole('menu'), 'a second click is still just a click').toHaveCount(0);
    await page.mouse.click(at.x, at.y, { button: 'right' });
    await expect(page.getByRole('menu')).toBeVisible();
  });

  test('Add your photos puts them in every photo of the design, and stays', async ({ page }) => {
    test.skip(process.env['PW_PROD'] === '1', DEV_ONLY);
    await open(page, LIFESTYLE);
    await page.getByLabel('Add your photos').setInputFiles([
      { name: 'red.png', mimeType: 'image/png', buffer: (await pictures(page))[0] ?? Buffer.alloc(0) },
      { name: 'blue.png', mimeType: 'image/png', buffer: (await pictures(page))[1] ?? Buffer.alloc(0) },
    ]);
    await expect.poll(async () => (await photoIds(page))[0]?.every((id) => id.startsWith('upload:'))).toBe(true);
    const ids = (await photoIds(page))[0] ?? [];
    expect(new Set(ids).size, 'both photos, repeating in order').toBe(2);
    await expect(page.locator('[data-start-actions]').getByRole('button', { name: 'Add your photos' })).toBeVisible();
    // One undo takes them all back out.
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(async () => (await photoIds(page))[0]?.every((id) => id.startsWith('sample:'))).toBe(true);
  });

  test('in a video, your photos fill the scene you are on — and every scene only when asked (D-137)', async ({ page }) => {
    test.skip(process.env['PW_PROD'] === '1', DEV_ONLY);
    await open(page, '/?template=launch-story&aspect=9:16&frozen=2000');
    await page.getByLabel('Add your photos').setInputFiles([
      { name: 'red.png', mimeType: 'image/png', buffer: (await pictures(page))[0] ?? Buffer.alloc(0) },
    ]);
    // Scene 1 is the one selected when the video opens.
    await expect.poll(async () => (await photoIds(page))[0]?.every((id) => id.startsWith('upload:'))).toBe(true);
    const others = (await photoIds(page)).slice(1).flat();
    expect(others.length).toBeGreaterThan(0);
    expect(others.some((id) => id.startsWith('upload:'))).toBe(false);

    await page.getByRole('tab', { name: 'Photos' }).click();
    await page.getByRole('button', { name: 'Use on every scene' }).click();
    await expect.poll(async () => (await photoIds(page)).flat().every((id) => id.startsWith('upload:'))).toBe(true);
  });
});

test.describe('on a tablet', () => {
  test.use({ viewport: { width: 900, height: 1100 } });

  test('one row of header, one frame-shape chip, and the tools open their panels', async ({ page }) => {
    await open(page, LIFESTYLE);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, 'no sideways scroll').toBeLessThanOrEqual(1);
    await expect(page.getByRole('button', { name: /^Frame shape 1:1/ })).toBeVisible();
    await page.locator('[data-tool-strip]').getByRole('button', { name: 'Photos', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Photos, text and style' })).toBeVisible();
  });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('Choose a design and Add your photos stay while something is selected', async ({ page }) => {
    await open(page, LIFESTYLE);
    const box = await page.locator('canvas').boundingBox();
    if (!box) throw new Error('no canvas');
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.locator('[data-phone-toolbar="selection"]')).toBeVisible();
    const row = page.locator('[data-start-actions]');
    await expect(row.getByRole('button', { name: 'Choose a design' })).toBeVisible();
    await expect(row.getByRole('button', { name: 'Add your photos' })).toBeVisible();
  });
});
