import { expect, test, type Page } from '@playwright/test';

/**
 * Editing on the canvas itself (D-107).
 *
 * Asked for as: "change content of text in the canvas … once the item is
 * clicked and cursor allows users to clear texts and retype", pictures that
 * can be "deleted, replaced, right clicked to perform actions", and
 * "shortcuts to things that can be done on them".
 */

test.use({ viewport: { width: 1500, height: 940 } });

const SELECTION = '[data-selection-box]';
const EDITOR = '[data-inline-editor]';
const TOOLBAR = '[data-selection-toolbar]';
const toast = (page: Page) => page.locator('[data-toast]');

async function openLifestyle(page: Page): Promise<void> {
  // Float Away, three seconds in: the headline at the top, a photo in the middle.
  await page.goto('/?template=pop-float&aspect=1:1&frozen=3000');
  await page.waitForSelector('canvas');
  await page.waitForTimeout(2_500);
}

async function canvasPoint(page: Page, fx: number, fy: number): Promise<{ x: number; y: number }> {
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('no canvas');
  return { x: box.x + box.width * fx, y: box.y + box.height * fy };
}

async function fingerprint(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) throw new Error('no artboard');
    const small = document.createElement('canvas');
    small.width = 32;
    small.height = 32;
    const cx = small.getContext('2d', { alpha: false });
    if (!cx) throw new Error('no context');
    cx.drawImage(canvas, 0, 0, 32, 32);
    return [...cx.getImageData(0, 0, 32, 32).data];
  });
}

function difference(a: number[], b: number[]): number {
  let total = 0;
  for (let i = 0; i < a.length; i++) total += Math.abs((a[i] ?? 0) - (b[i] ?? 0));
  return total / a.length;
}

/** A photo of the person's own, made on the spot: bold stripes nothing in the samples looks like. */
async function stripesPng(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 320;
    const cx = canvas.getContext('2d');
    if (!cx) throw new Error('no context');
    for (let i = 0; i < 8; i++) {
      cx.fillStyle = i % 2 === 0 ? '#ff2d55' : '#ffe600';
      cx.fillRect(i * 40, 0, 40, 320);
    }
    return canvas.toDataURL('image/png').split(',')[1] ?? '';
  });
  return Buffer.from(base64, 'base64');
}

const HEADLINE = { x: 0.5, y: 0.08 };
const PHOTO = { x: 0.5, y: 0.5 };

test.describe('typing on the canvas', () => {
  test('double-click text, type over it, Enter keeps it', async ({ page }) => {
    await openLifestyle(page);
    const at = await canvasPoint(page, HEADLINE.x, HEADLINE.y);
    const before = await fingerprint(page);

    await page.mouse.dblclick(at.x, at.y);
    const editor = page.locator(EDITOR);
    await expect(editor).toBeVisible();
    await expect(editor).toHaveValue('Let it all go');
    // Everything is selected on opening, so typing replaces it.
    await page.keyboard.type('Brand new words');
    await page.keyboard.press('Enter');

    await expect(editor).toHaveCount(0);
    expect(difference(before, await fingerprint(page))).toBeGreaterThan(0.3);

    // It is the document that changed, not just the picture: opening it again shows the new words.
    await page.mouse.dblclick(at.x, at.y);
    await expect(page.locator(EDITOR)).toHaveValue('Brand new words');
  });

  test('Escape puts back what was there', async ({ page }) => {
    await openLifestyle(page);
    const at = await canvasPoint(page, HEADLINE.x, HEADLINE.y);
    await page.mouse.dblclick(at.x, at.y);
    await page.keyboard.type('Not this');
    await page.keyboard.press('Escape');
    await expect(page.locator(EDITOR)).toHaveCount(0);

    await page.mouse.dblclick(at.x, at.y);
    await expect(page.locator(EDITOR)).toHaveValue('Let it all go');
  });

  test('clearing all the words does not close the editor under your fingers', async ({ page }) => {
    await openLifestyle(page);
    const at = await canvasPoint(page, HEADLINE.x, HEADLINE.y);
    await page.mouse.dblclick(at.x, at.y);
    await page.keyboard.press('Backspace');
    await expect(page.locator(EDITOR)).toBeVisible();
    await page.keyboard.type('Back again');
    await page.keyboard.press('Enter');
    await page.mouse.dblclick(at.x, at.y);
    await expect(page.locator(EDITOR)).toHaveValue('Back again');
  });

  test('a caption layer is edited the same way', async ({ page }) => {
    await page.goto('/?template=quick-pitch&aspect=9:16&frozen=1500');
    await page.waitForSelector('canvas');
    await page.waitForTimeout(2_000);
    await page.getByTitle('Add a text overlay').click();
    const box = await page.locator(SELECTION).boundingBox();
    if (!box) throw new Error('no selection');
    await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.locator(EDITOR)).toHaveValue('New caption');
    await page.keyboard.type('Sale ends Friday');
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-overlay-clip]').first()).toContainText('Sale ends Friday');
  });
});

test.describe('photos on the canvas', () => {
  test('double-click a photo to replace it', async ({ page }) => {
    await openLifestyle(page);
    const at = await canvasPoint(page, PHOTO.x, PHOTO.y);
    const before = await fingerprint(page);

    await page.mouse.dblclick(at.x, at.y);
    const dialog = page.getByRole('dialog', { name: 'Replace photo' });
    await expect(dialog).toBeVisible();
    // The person's own photos only: the samples are not offered as replacements.
    await expect(dialog.locator('[data-photo-choice^="sample:"]')).toHaveCount(0);
    await dialog.getByLabel('Upload a photo').setInputFiles({ name: 'mine.png', mimeType: 'image/png', buffer: await stripesPng(page) });

    await expect(dialog).toHaveCount(0);
    await expect(toast(page)).toContainText('Photo replaced');
    // The new picture is drawn on the next frame after it lands.
    await expect.poll(async () => difference(before, await fingerprint(page))).toBeGreaterThan(1);
  });

  test('the toolbar beside a selected photo: replace, effects, motion, delete, more', async ({ page }) => {
    await openLifestyle(page);
    const at = await canvasPoint(page, PHOTO.x, PHOTO.y);
    await page.mouse.click(at.x, at.y);
    const toolbar = page.locator(TOOLBAR);
    await expect(toolbar).toBeVisible();
    for (const name of ['Replace', 'Effects', 'Motion', 'Delete', 'More']) {
      await expect(toolbar.getByRole('button', { name })).toBeVisible();
    }

    await expect(page.getByLabel('Photo count')).toBeAttached().catch(() => undefined);
    await toolbar.getByRole('button', { name: 'Delete' }).click();
    await expect(toast(page)).toContainText('Photo removed');
  });

  test('right-click a photo for everything that can be done to it', async ({ page }) => {
    await openLifestyle(page);
    const at = await canvasPoint(page, PHOTO.x, PHOTO.y);
    await page.mouse.click(at.x, at.y, { button: 'right' });
    const menu = page.locator('[data-context-menu]');
    for (const item of ['Replace photo', 'Frame and crop', 'Effects', 'Motion properties', 'Delete photo']) {
      await expect(menu.getByRole('menuitem', { name: new RegExp(`^${item}`) })).toBeVisible();
    }
    await menu.getByRole('menuitem', { name: /^Replace photo/ }).click();
    await expect(page.getByRole('dialog', { name: 'Replace photo' })).toBeVisible();
  });
});

test.describe('shortcuts', () => {
  test('? lists them', async ({ page }) => {
    await openLifestyle(page);
    await page.keyboard.press('?');
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toHaveCount(0);
  });

  test('⌘D duplicates the selected layer', async ({ page }) => {
    await page.goto('/?template=quick-pitch&aspect=9:16&frozen=1500');
    await page.waitForSelector('canvas');
    await page.waitForTimeout(2_000);
    await page.getByTitle('Add a text overlay').click();
    await page.locator('[data-overlay-clip]').first().click();
    await page.keyboard.press('ControlOrMeta+d');
    await expect(page.locator('[data-overlay-clip]')).toHaveCount(2);
  });

  test('Delete on selected text removes it, and ⌘Z brings it back', async ({ page }) => {
    await openLifestyle(page);
    const at = await canvasPoint(page, HEADLINE.x, HEADLINE.y);
    await page.mouse.click(at.x, at.y);
    const before = await fingerprint(page);
    await page.keyboard.press('Delete');
    await expect(toast(page)).toContainText('Text removed');
    await page.waitForTimeout(300);
    expect(difference(before, await fingerprint(page))).toBeGreaterThan(0.3);
    await page.keyboard.press('ControlOrMeta+z');
    await page.waitForTimeout(300);
    expect(difference(before, await fingerprint(page))).toBe(0);
  });
});
