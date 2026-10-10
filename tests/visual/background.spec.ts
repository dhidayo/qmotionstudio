import { expect, test, type Page } from '@playwright/test';

/**
 * The background and the looks (D-120, D-121).
 *
 * "Allow users to change background too" — a colour, a gradient, a pattern
 * or a picture of their own, reached from the tool strip and from a
 * right-click on the empty canvas. And "the dark background on every template
 * makes it look somehow" — designs open in looks of their own, and a tap
 * restyles the same design.
 */

test.use({ viewport: { width: 1500, height: 1003 } });

type Harness = { __motionStudio: { editor: { getState: () => { setTemplate: (id: string) => void } } } };

async function open(page: Page, url = '/'): Promise<void> {
  await page.goto(url);
  await page.waitForSelector('canvas');
  await page.waitForTimeout(2_000);
}

/** The frame's colour a little in from its top-left corner, where designs leave the ground bare. */
async function corner(page: Page): Promise<[number, number, number]> {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const cx = canvas?.getContext('2d');
    if (!canvas || !cx) throw new Error('no canvas');
    const d = cx.getImageData(Math.round(canvas.width * 0.04), Math.round(canvas.height * 0.3), 1, 1).data;
    return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0];
  });
}

const brightness = ([r, g, b]: [number, number, number]): number => (r + g + b) / 3;
const distance = (a: [number, number, number], b: [number, number, number]): number =>
  Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);

async function stripesPng(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 320;
    const cx = canvas.getContext('2d');
    if (!cx) throw new Error('no context');
    // Saturated green: nothing in any look is this colour.
    cx.fillStyle = '#00c800';
    cx.fillRect(0, 0, 320, 320);
    return canvas.toDataURL('image/png').split(',')[1] ?? '';
  });
  return Buffer.from(base64, 'base64');
}

test('a picture of your own goes behind the design, and is still there after a reload', async ({ page }) => {
  await open(page);
  await page.getByRole('navigation', { name: 'Tools' }).getByRole('button', { name: 'Background' }).click();
  await page.getByRole('button', { name: 'Your picture' }).click();

  const dialog = page.getByRole('dialog', { name: 'Background picture' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Upload a photo').setInputFiles({ name: 'ground.png', mimeType: 'image/png', buffer: await stripesPng(page) });
  await expect(dialog).toHaveCount(0);

  // Green, dimmed by the look's colour, where the ground was.
  const green = async (): Promise<number> => { const [r, g, b] = await corner(page); return g - (r + b) / 2; };
  await expect.poll(green).toBeGreaterThan(60);
  await expect(page.getByRole('slider', { name: 'Dim' })).toBeVisible();

  await page.waitForTimeout(1_200);
  await expect(page.locator('[data-save-state]')).toHaveAttribute('data-save-state', 'saved', { timeout: 10_000 });
  await page.reload();
  await page.waitForSelector('canvas');
  await expect.poll(green, { timeout: 10_000 }).toBeGreaterThan(60);
});

test('right-click where nothing is offers the background', async ({ page }) => {
  await open(page);
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('no canvas');
  await page.mouse.click(box.x + 6, box.y + box.height * 0.3, { button: 'right' });
  const menu = page.locator('[data-context-menu]');
  await expect(menu.getByRole('menuitem', { name: /^Change background/ })).toBeVisible();
  await menu.getByRole('menuitem', { name: /^Use a picture as background/ }).click();
  await expect(page.getByRole('dialog', { name: 'Background picture' })).toBeVisible();
});

test('a look restyles the same design in one tap', async ({ page }) => {
  await open(page);
  await page.getByRole('navigation', { name: 'Tools' }).getByRole('button', { name: 'Style' }).click();

  await page.locator('[data-look="midnight"]').click();
  await expect.poll(async () => brightness(await corner(page))).toBeLessThan(60);
  await expect(page.locator('[data-look="midnight"]')).toHaveAttribute('aria-pressed', 'true');

  await page.locator('[data-look="sunshine"]').click();
  await expect.poll(async () => brightness(await corner(page))).toBeGreaterThan(150);

  // "Try another" steps on from the current look.
  const before = await corner(page);
  await page.locator('[data-next-look]').click();
  await expect.poll(async () => distance(before, await corner(page))).toBeGreaterThan(40);
});

test('designs open in looks of their own, light and dark', async ({ page }) => {
  // Typewriter opens on cream; Mask Wipe on navy (D-121's turn for Text Motion).
  await open(page, '/?template=type-typewriter&aspect=1:1');
  const cream = brightness(await corner(page));
  expect(cream).toBeGreaterThan(180);

  // Picking another design from the library brings its look with it.
  await page.evaluate(() => { (globalThis as unknown as Harness).__motionStudio.editor.getState().setTemplate('type-mask-wipe'); });
  await expect.poll(async () => brightness(await corner(page))).toBeLessThan(70);
});
