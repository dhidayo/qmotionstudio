import { expect, test, type Page } from '@playwright/test';

/**
 * The way in, on every screen (D-116, D-162).
 *
 * Asked for first as tools under the picture and "Add Your Photos should be
 * always shown … same for choose template"; then, once that made three rows of
 * buttons under the picture with photos in four of them: "Please ensure same
 * buttons are not shown or both items are not shown two different times with
 * different representations." So one row of actions, each once — Choose a
 * design first, + Photos the one way to add photos — and the inspector's tabs
 * as the way to Photos, Text, Effects and Style. And a click on the canvas
 * that selects and nothing else — "clear gestures should be for right clicks".
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

  test('one row of actions sits under the picture, each action once (D-162)', async ({ page }) => {
    await open(page, LIFESTYLE);
    const row = page.locator('[data-control-row]');
    await expect(row.getByRole('button', { name: 'Choose a design' })).toBeVisible();
    await expect(row.getByRole('button', { name: '+ Photos' })).toBeVisible();
    // No strip of tools, no big start buttons, and photos added from one button only.
    await expect(page.locator('[data-tool-strip], [data-start-actions]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add your photos' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '+ Photo', exact: true })).toHaveCount(0);
    const labels = await row.getByRole('button').evaluateAll((all) => all.map((b) => b.textContent.trim()));
    expect(new Set(labels).size, `each once: ${labels.join(' · ')}`).toBe(labels.length);
    expect(labels.filter((label) => /photo/i.test(label))).toEqual(['+ Photos']);
    const canvas = await page.locator('canvas').boundingBox();
    const bar = await row.boundingBox();
    expect(bar && canvas && bar.y >= canvas.y + canvas.height - 1, 'under the picture').toBe(true);

    // The inspector's tabs are the way to each panel.
    await page.getByRole('tab', { name: 'Text' }).click();
    await expect(page.getByRole('tab', { name: 'Text' })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('tab', { name: 'Style' }).click();
    await expect(page.getByRole('tab', { name: 'Style' })).toHaveAttribute('aria-selected', 'true');

    // Designs opens as a window in the middle, not a sheet stuck to the bottom.
    await row.getByRole('button', { name: 'Choose a design' }).click();
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

  test('+ Photos replaces the samples one for one, and stays (D-150, D-162)', async ({ page }) => {
    test.skip(process.env['PW_PROD'] === '1', DEV_ONLY);
    await open(page, LIFESTYLE);
    await page.getByLabel('Add your photos').setInputFiles([
      { name: 'red.png', mimeType: 'image/png', buffer: (await pictures(page))[0] ?? Buffer.alloc(0) },
      { name: 'blue.png', mimeType: 'image/png', buffer: (await pictures(page))[1] ?? Buffer.alloc(0) },
    ]);
    // Four spots, two photos: the first two samples give way, the other two stay.
    await expect.poll(async () => (await photoIds(page))[0]?.filter((id) => id.startsWith('upload:')).length).toBe(2);
    const ids = (await photoIds(page))[0] ?? [];
    expect(ids.slice(0, 2).every((id) => id.startsWith('upload:')), 'yours first, in order').toBe(true);
    expect(ids.slice(2).every((id) => id.startsWith('sample:')), 'samples in the rest, not repeats').toBe(true);
    await expect(page.locator('[data-toast]')).toContainText('Your 2 photos replaced 2 samples.');
    await expect(page.locator('[data-add-bar]').getByRole('button', { name: '+ Photos' })).toBeVisible();
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
    // Every scene shows it, once: in its first spot, with samples in the rest (D-150).
    await expect.poll(async () => (await photoIds(page)).every((ids) => ids.length === 0 || ids[0]?.startsWith('upload:') === true)).toBe(true);
    const scenes = await photoIds(page);
    expect(scenes.every((ids) => ids.filter((id) => id.startsWith('upload:')).length <= 1), 'never repeated within a scene').toBe(true);
  });
});

test.describe('on a tablet', () => {
  test.use({ viewport: { width: 900, height: 1100 } });

  test('one row of header, one frame-shape chip, and Settings opens the panels', async ({ page }) => {
    await open(page, LIFESTYLE);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, 'no sideways scroll').toBeLessThanOrEqual(1);
    await expect(page.getByRole('button', { name: /^Frame shape 1:1/ })).toBeVisible();
    // The inspector is a sheet here; the row of actions ends with the way to it (D-162).
    await page.locator('[data-settings-toggle]').click();
    const sheet = page.getByRole('dialog', { name: 'Photos, text and style' });
    await expect(sheet).toBeVisible();
    for (const name of ['Photos', 'Text', 'Effects', 'Style']) {
      await expect(sheet.getByRole('tab', { name })).toBeVisible();
    }
  });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the designs and adding photos are in the toolbar once, and back with one tap after a selection (D-162)', async ({ page }) => {
    await open(page, LIFESTYLE);
    const main = page.locator('[data-phone-toolbar="main"]');
    // No row of big buttons above the toolbar: each action is in it once.
    await expect(page.locator('[data-start-actions]')).toHaveCount(0);
    const tools = await main.getByRole('button').evaluateAll((all) => all.map((b) => b.textContent.trim()));
    expect(tools).toEqual(['Designs', 'Add', 'Photos', 'Text', 'Effects', 'Style']);

    const box = await page.locator('canvas').boundingBox();
    if (!box) throw new Error('no canvas');
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.locator('[data-phone-toolbar="selection"]')).toBeVisible();
    await page.locator('[data-phone-toolbar="selection"]').getByRole('button', { name: 'Done' }).tap();
    // Photos are added from Photos; the Add sheet has no second way to do it.
    await main.getByRole('button', { name: 'Add', exact: true }).tap();
    await expect(page.getByRole('group', { name: 'Add' }).locator('[data-add="photos"]')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await main.getByRole('button', { name: 'Photos', exact: true }).tap();
    await expect(page.getByRole('button', { name: '+ Add photos' })).toBeVisible();
  });
});
