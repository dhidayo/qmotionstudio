import { expect, test, type Page } from '@playwright/test';

/**
 * The logo, its lockup, and effects (D-100 – D-105).
 *
 * Reported: "when I move [the logo] under the Free form … I can see the
 * outline moving but not the logo; then, the lockup text doesn't seem to align
 * with the logo properly and not movable as well." These measure where the
 * logo's own pixels are on the frame — not where its selection box is, which
 * was always right; that was the bug.
 */

// 63px taller since the tool strip moved in under the picture (D-116): the
// pixel counts below are calibrated to the canvas size these were written for.
test.use({ viewport: { width: 1500, height: 1003 } });

const SELECTION = '[data-selection-box]';

async function openAd(page: Page, frozenMs = 1_500): Promise<void> {
  await page.goto(`/?template=quick-pitch&aspect=9:16&frozen=${frozenMs}`);
  await page.waitForSelector('canvas');
  await page.waitForTimeout(2_000);
}

/** A wide magenta wordmark, 2:1, so the visible logo is not its square box. */
async function logoPng(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 120;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d');
    ctx.fillStyle = '#ff00ff';
    ctx.fillRect(0, 0, 240, 120);
    return canvas.toDataURL('image/png').split(',')[1] ?? '';
  });
  return Buffer.from(base64, 'base64');
}

/** The centre and extent of the pixels matching `test`, in canvas pixels. */
async function blob(page: Page, kind: 'magenta' | 'green'): Promise<{ x: number; y: number; top: number; bottom: number; count: number }> {
  return page.evaluate((kind) => {
    const canvas = document.querySelector('canvas');
    if (!canvas) throw new Error('no canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no ctx');
    const { width, height } = canvas;
    const data = ctx.getImageData(0, 0, width, height).data;
    let sx = 0, sy = 0, n = 0, top = Infinity, bottom = -Infinity;
    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2) {
        const i = (y * width + x) * 4;
        const r = data[i] ?? 0, g = data[i + 1] ?? 0, b = data[i + 2] ?? 0;
        const hit = kind === 'magenta' ? r > 200 && g < 90 && b > 200 : g > 190 && r < 120 && b < 120;
        if (!hit) continue;
        sx += x; sy += y; n += 1;
        top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
    }
    return { x: n ? sx / n : -1, y: n ? sy / n : -1, top, bottom, count: n };
  }, kind);
}

async function addLogo(page: Page): Promise<void> {
  await page.getByRole('tab', { name: 'Style' }).click();
  await page.getByLabel('Add a logo').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: await logoPng(page) });
  await expect(page.locator('[data-logo-section] img[alt="Logo"]')).toBeVisible();
  await page.getByRole('group', { name: 'Position' }).getByRole('button', { name: 'Centre', exact: true }).click();
  await page.waitForTimeout(400);
}

async function dragSelection(page: Page, dx: number, dy: number): Promise<void> {
  const box = await page.locator(SELECTION).boundingBox();
  if (!box) throw new Error('nothing selected');
  const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.keyboard.down('Shift');
  await page.mouse.move(from.x + dx / 2, from.y + dy / 2, { steps: 4 });
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 4 });
  await page.keyboard.up('Shift');
  await page.mouse.up();
  await page.waitForTimeout(400);
}

test.describe('the logo lives in Look (D-105)', () => {
  test('in both Lifestyle and Corporate Ads, and the Logo tab is gone', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('canvas');
    await expect(page.getByRole('tab', { name: 'Logo' })).toHaveCount(0);
    await page.getByRole('tab', { name: 'Style' }).click();
    await expect(page.getByLabel('Add a logo')).toBeAttached();

    await page.getByRole('button', { name: 'Video', exact: true }).click();
    await page.getByRole('tab', { name: 'Style' }).click();
    await expect(page.getByLabel('Add a logo')).toBeAttached();
  });

  test('the product and its modes go by their new names', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('Q Motion Studio');
    await expect(page.getByRole('button', { name: 'Design', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Video', exact: true })).toBeVisible();
    // Exact: designs such as "App Showcase" are cards in the library now.
    await expect(page.getByRole('button', { name: 'Showcase', exact: true })).toHaveCount(0);
  });
});

test.describe('dragging the logo (D-101)', () => {
  test('moves the logo itself, not only its outline', async ({ page }) => {
    await openAd(page);
    await addLogo(page);
    const before = await blob(page, 'magenta');
    expect(before.count, 'the logo is on the frame').toBeGreaterThan(50);

    const canvas = await page.locator('canvas').boundingBox();
    if (!canvas) throw new Error('no canvas');
    const pxPerCss = (await page.locator('canvas').evaluate((c) => (c as HTMLCanvasElement).width)) / canvas.width;

    await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
    await expect(page.locator(SELECTION)).toHaveAttribute('aria-label', /Logo selected/);

    await dragSelection(page, -80, -150);
    const after = await blob(page, 'magenta');

    // Where the pixels went, against where the pointer went.
    expect(after.x - before.x).toBeLessThan(-80 * pxPerCss * 0.7);
    expect(after.y - before.y).toBeLessThan(-150 * pxPerCss * 0.7);

    // …and keeps following on a second drag, which is where it used to stick.
    await dragSelection(page, 120, 60);
    const again = await blob(page, 'magenta');
    expect(again.x - after.x).toBeGreaterThan(120 * pxPerCss * 0.7);
  });
});

test.describe('the lockup (D-101)', () => {
  test('sits centred just under the logo as it appears, and moves with it', async ({ page }) => {
    await openAd(page);
    await addLogo(page);
    await page.getByRole('switch', { name: 'Pair with a text mark' }).click();
    await page.getByLabel('Lockup text').fill('QUANTERA');
    await page.getByLabel('Text colour').fill('#00ff00');
    await page.waitForTimeout(400);

    const logo = await blob(page, 'magenta');
    const text = await blob(page, 'green');
    expect(text.count, 'the lockup is on the frame').toBeGreaterThan(20);
    const canvasWidth = await page.locator('canvas').evaluate((c) => (c as HTMLCanvasElement).width);

    // Under it, close under it, and centred on it.
    expect(text.top).toBeGreaterThan(logo.bottom);
    expect(text.top - logo.bottom).toBeLessThan(canvasWidth * 0.05);
    expect(Math.abs(text.x - logo.x)).toBeLessThan(canvasWidth * 0.02);

    // Pick up the logo — or its text — and both move, the same distance.
    const canvas = await page.locator('canvas').boundingBox();
    if (!canvas) throw new Error('no canvas');
    const scale = canvasWidth / canvas.width;
    await page.mouse.click(canvas.x + text.x / scale, canvas.y + text.y / scale);
    await expect(page.locator(SELECTION)).toHaveAttribute('aria-label', /Logo selected/);
    await dragSelection(page, 90, 110);

    const logoAfter = await blob(page, 'magenta');
    const textAfter = await blob(page, 'green');
    expect(logoAfter.x - logo.x).toBeGreaterThan(90 * scale * 0.7);
    expect(textAfter.x - text.x).toBeCloseTo(logoAfter.x - logo.x, -1);
    expect(textAfter.y - text.y).toBeCloseTo(logoAfter.y - logo.y, -1);
  });

  test('can sit to the right of the logo instead', async ({ page }) => {
    await openAd(page);
    await addLogo(page);
    await page.getByRole('switch', { name: 'Pair with a text mark' }).click();
    await page.getByLabel('Lockup text').fill('QUANTERA');
    await page.getByLabel('Text colour').fill('#00ff00');
    await page.getByRole('group', { name: 'Text sits' }).getByRole('button', { name: 'Right' }).click();
    await page.waitForTimeout(400);

    const logo = await blob(page, 'magenta');
    const text = await blob(page, 'green');
    expect(text.x).toBeGreaterThan(logo.x);
    expect(Math.abs(text.y - logo.y)).toBeLessThan(40);
  });
});

/** A small picture of the frame, to tell two frames apart. */
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

test.describe('effects (D-100)', () => {
  test('a scene effect from the Motion panel changes the picture, and removing it puts it back exactly', async ({ page }) => {
    await page.goto('/?template=pop-float&aspect=1:1&frozen=3000');
    await page.waitForSelector('canvas');
    await page.waitForTimeout(2_500);
    const plain = await fingerprint(page);

    await page.getByRole('tab', { name: 'Effects' }).click();
    await page.getByRole('button', { name: '+ Add effect' }).last().click();
    const library = page.getByRole('dialog', { name: 'Effects' });
    await library.getByRole('tab', { name: 'Stylize' }).click();
    await library.locator('[data-effect="sepia"]').click();
    await page.waitForTimeout(400);

    expect(difference(plain, await fingerprint(page))).toBeGreaterThan(2);
    await page.getByRole('button', { name: 'Remove Sepia' }).click();
    await page.waitForTimeout(400);
    expect(difference(plain, await fingerprint(page))).toBe(0);
  });

  test('every card in the library is a live preview', async ({ page }) => {
    await page.goto('/?template=quick-pitch&aspect=9:16&frozen=1000');
    await page.waitForSelector('canvas');
    await page.waitForTimeout(1_500);
    await page.getByTitle(/^Add an effect at the playhead/).click();
    const library = page.getByRole('dialog', { name: 'Effects' });
    await expect(library.locator('[data-effect]')).toHaveCount(38);
    // Drawn, not blank: a preview canvas with something on it.
    const inked = await library.locator('[data-effect="snow"] canvas').evaluate((c) => {
      const canvas = c as HTMLCanvasElement;
      const data = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data ?? new Uint8ClampedArray();
      let lit = 0;
      for (let i = 0; i < data.length; i += 4) if ((data[i] ?? 0) > 200) lit += 1;
      return lit;
    });
    expect(inked).toBeGreaterThan(10);
  });

  test('a timeline effect sits on the FX lane, opens its settings, and Delete removes it', async ({ page }) => {
    await page.goto('/?template=quick-pitch&aspect=9:16&frozen=1000');
    await page.waitForSelector('canvas');
    await page.waitForTimeout(1_500);
    await page.getByTitle(/^Add an effect at the playhead/).click();
    await page.getByRole('dialog', { name: 'Effects' }).locator('[data-effect="lightning"]').click();

    const clip = page.locator('[data-fx-clip="lightning"]');
    await expect(clip).toBeVisible();
    await expect(page.getByLabel('Effect inspector')).toContainText('Lightning');

    await clip.click();
    await page.keyboard.press('Delete');
    await expect(clip).toHaveCount(0);
    await expect(page.locator('[data-toast]')).toContainText('Deleted “Lightning”');
  });

  test('an element effect goes on the photo that was clicked', async ({ page }) => {
    await page.goto('/?template=pop-float&aspect=1:1&frozen=3000');
    await page.waitForSelector('canvas');
    await page.waitForTimeout(2_500);
    const canvas = await page.locator('canvas').boundingBox();
    if (!canvas) throw new Error('no canvas');
    await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
    await page.getByRole('tab', { name: 'Effects' }).click();
    const before = await fingerprint(page);

    // The photo's own section (D-132), not the scene's above it.
    await page.locator('[data-section^="Photo"]').getByRole('button', { name: '+ Add effect' }).click();
    const library = page.getByRole('dialog', { name: 'Effects' });
    await expect(library.getByRole('heading', { level: 2 })).toContainText(/Effects for photo/);
    await library.locator('[data-effect="glow-el"]').click();
    await expect(page.locator('[data-effect-row="glow-el"]')).toBeVisible();
    await page.waitForTimeout(400);
    expect(difference(before, await fingerprint(page))).toBeGreaterThan(0.5);
  });

  test('motion strength 0% holds a moving design still', async ({ page }) => {
    // Early in the design, while its photo is still on the move.
    await page.goto('/?template=pop-float&aspect=1:1&frozen=400');
    await page.waitForSelector('canvas');
    await page.waitForTimeout(2_500);
    const moving = await fingerprint(page);
    await page.getByRole('tab', { name: 'Effects' }).click();
    await page.getByLabel('How much it moves').last().fill('0');
    await page.waitForTimeout(400);
    expect(difference(moving, await fingerprint(page))).toBeGreaterThan(0.5);
  });
});
