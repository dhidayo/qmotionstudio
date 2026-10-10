import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * The Text tab as a list (D-124): "each text shown as collapsible element in
 * the Text tab in which when the collapsed tile is expanded, I can then see
 * all the settings… then I can delete the text element… new texts can be
 * added to canvas and it will be on the text element lists."
 */

test.use({ viewport: { width: 1500, height: 1003 } });

const tile = (page: Page, key: string) => page.locator(`[data-text-tile="${key}"]`);

async function open(page: Page): Promise<void> {
  // Call to Action: a headline, a line under it and a button — three texts.
  await page.goto('/?template=el-cta-button&aspect=1:1&frozen=3000');
  await page.waitForSelector('canvas');
  await page.waitForTimeout(1_500);
  await page.getByRole('tab', { name: 'Text' }).click();
}

/** A coarse fingerprint of the frame, to see that the picture changed. */
async function fingerprint(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const cx = canvas?.getContext('2d');
    if (!canvas || !cx) throw new Error('no canvas');
    const out: number[] = [];
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const d = cx.getImageData(Math.floor(((x + 0.5) * canvas.width) / 16), Math.floor(((y + 0.5) * canvas.height) / 16), 1, 1).data;
        out.push((d[0] ?? 0) + (d[1] ?? 0) + (d[2] ?? 0));
      }
    }
    return out;
  });
}
const changed = (a: number[], b: number[]): number => a.reduce((sum, v, i) => sum + Math.abs(v - (b[i] ?? 0)), 0) / a.length;

test('every text in the design is a tile that opens to its settings', async ({ page }) => {
  await open(page);
  for (const key of ['text:headline', 'text:subline', 'text:button']) await expect(tile(page, key)).toBeVisible();

  const head = tile(page, 'text:headline').getByRole('button', { expanded: false });
  await head.click();
  await expect(tile(page, 'text:headline').getByRole('button', { name: /^Headline/, expanded: true })).toBeVisible();
  await expect(tile(page, 'text:headline').getByRole('button', { name: 'Delete this text' })).toBeVisible();
  // Opening a tile picks its text on the canvas: its toolbar appears there.
  await expect(page.locator('[data-selection-toolbar]')).toBeVisible();
});

test('the design\'s own text can be deleted and put back as it was', async ({ page }) => {
  await open(page);
  const before = await fingerprint(page);
  await tile(page, 'text:button').getByRole('button', { name: 'Delete button' }).click();
  await expect(tile(page, 'text:button')).toContainText('Removed');
  await expect.poll(async () => changed(before, await fingerprint(page))).toBeGreaterThan(0.5);

  await tile(page, 'text:button').getByRole('button', { name: 'Put back' }).click();
  await expect(tile(page, 'text:button')).toContainText('Book now');
  await expect.poll(async () => changed(before, await fingerprint(page))).toBeLessThan(0.5);
});

test('added text joins the list, and is deleted from it', async ({ page }) => {
  await open(page);
  const before = await fingerprint(page);
  await page.locator('[data-add-text]').click();
  // A ready-made style from the gallery (D-145).
  await page.locator('[data-text-preset="neon"]').click();
  const added = page.locator('[data-text-tile^="layer:"]');
  await expect(added).toHaveCount(1);
  await expect(added.getByRole('button', { expanded: true })).toBeVisible();
  await added.getByLabel('Overlay text').fill('Opening this Friday');
  await expect(added).toContainText('Opening this Friday');
  await expect.poll(async () => changed(before, await fingerprint(page))).toBeGreaterThan(0.5);

  await added.getByRole('button', { name: 'Delete this text' }).click();
  await expect(added).toHaveCount(0);
});

test('text picked on the canvas opens its tile', async ({ page }) => {
  await open(page);
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('no canvas');
  const opened = page.locator('[data-text-tile^="text:"]').filter({ has: page.getByRole('button', { expanded: true }) });
  // Down the middle of the design until a click lands on its words.
  for (let fy = 0.3; fy <= 0.75 && (await opened.count()) === 0; fy += 0.03) {
    await page.mouse.click(box.x + box.width / 2, box.y + box.height * fy);
    await page.waitForTimeout(120);
  }
  // The text clicked on the canvas is the one whose tile opened — and only it.
  await expect(opened).toHaveCount(1);
  await expect(page.locator('[data-selection-toolbar]')).toBeVisible();
});

test.describe('photos on top of the design', () => {
  async function pngOf(page: Page): Promise<Buffer> {
    const base64 = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 200;
      const cx = canvas.getContext('2d');
      if (!cx) throw new Error('no context');
      cx.fillStyle = '#00c800';
      cx.fillRect(0, 0, 200, 200);
      return canvas.toDataURL('image/png').split(',')[1] ?? '';
    });
    return Buffer.from(base64, 'base64');
  }

  test('+ Add photo puts a photo on the canvas, lists it, and deletes it', async ({ page }) => {
    await open(page);
    await page.getByRole('tab', { name: 'Photos' }).click();
    const before = await fingerprint(page);
    await page.getByLabel('Add a photo on top of the design').first().setInputFiles({ name: 'extra.png', mimeType: 'image/png', buffer: await pngOf(page) });
    const listed = page.locator('[data-photo-layer]');
    await expect(listed).toHaveCount(1);
    await expect.poll(async () => changed(before, await fingerprint(page))).toBeGreaterThan(0.5);

    await listed.getByRole('button', { name: 'Delete added photo 1' }).click();
    await expect(listed).toHaveCount(0);
  });
});

test.describe('a longer video from one design (D-129)', () => {
  test('+ Scene keeps the design as scene 1 and asks for the next', async ({ page }) => {
    await page.goto('/?template=type-typewriter&aspect=9:16');
    await page.waitForSelector('canvas');
    await page.waitForTimeout(1_200);
    await page.locator('[data-continue-video]').first().click();
    await expect(page.getByRole('button', { name: 'Video', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('dialog', { name: 'Add a scene' })).toBeVisible();
    // One scene so far — the design — on the timeline behind the picker.
    await expect(page.getByRole('button', { name: /^1\. Typewriter/ })).toHaveCount(1);
    await expect(page.getByRole('button', { name: /^2\. / })).toHaveCount(0);
  });
});

test('the font of any text can be any font: the app\'s, the device\'s, or one uploaded', async ({ page }) => {
  await open(page);
  await tile(page, 'text:headline').getByRole('button', { expanded: false }).first().click();
  const picker = tile(page, 'text:headline').locator('[data-font-picker]');
  const before = await fingerprint(page);
  await picker.getByRole('button', { name: /^Font: / }).click();
  await picker.locator('[data-font-option="sys:georgia"]').click();
  await expect(picker.getByRole('button', { name: 'Font: Georgia. Change' })).toBeVisible();
  await expect.poll(async () => changed(before, await fingerprint(page))).toBeGreaterThan(0.3);

  // An uploaded font is checked by loading it: a file that is not a font is refused, and said.
  await picker.getByRole('button', { name: /^Font: / }).click();
  await picker.getByLabel('Upload a font').setInputFiles({ name: 'broken.ttf', mimeType: 'font/ttf', buffer: Buffer.from('not a font') });
  await expect(picker.getByText(/could not be read as a font/)).toBeVisible();

  // A real font goes in, is chosen, and is kept for the next visit.
  await picker.getByLabel('Upload a font').setInputFiles({ name: 'My-Brand-Sans.woff2', mimeType: 'font/woff2', buffer: readFileSync('public/fonts/archivo-latin.woff2') });
  await expect(picker.getByRole('button', { name: 'Font: My Brand Sans. Change' })).toBeVisible();
  // Past the autosave's pause, so the reload finds the choice on disk.
  await page.waitForTimeout(1_200);
  await expect(page.locator('[data-save-state]')).toHaveAttribute('data-save-state', 'saved', { timeout: 10_000 });
  await page.reload();
  await page.waitForSelector('canvas');
  await page.getByRole('tab', { name: 'Text' }).click();
  await tile(page, 'text:headline').getByRole('button', { expanded: false }).first().click();
  // Still on this device: listed under Your fonts.
  await tile(page, 'text:headline').getByRole('button', { name: /^Font: / }).click();
  await expect(tile(page, 'text:headline').locator('[data-font-option^="user:"]', { hasText: 'My Brand Sans' })).toBeVisible();
});
