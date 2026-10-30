import { expect, test, type Page } from '@playwright/test';

/**
 * A design's own parts (D-159): "The T and the background box cannot be
 * modified, changed, or customized. Same with Episode 24 rounded
 * background." Covers & Thumbnails, where every decoration and number is
 * now the person's to pick, recolour, move, type into, delete and put back.
 */

test.use({ viewport: { width: 1366, height: 768 } });

const SELECTION = '[data-selection-box]';

async function open(page: Page, template: string): Promise<void> {
  await page.goto(`/?template=${template}&aspect=16:9&frozen=2500`);
  await page.waitForSelector('canvas');
  await page.waitForTimeout(2_000);
}

type Box = { x: number; y: number; width: number; height: number };

async function canvasBox(page: Page): Promise<Box> {
  const box = await page.locator('canvas').first().boundingBox();
  if (!box) throw new Error('no canvas');
  return box;
}

/**
 * Clicks across the picture until the element with `key` is the one
 * selected — a search rather than a coordinate, so a change of font or
 * layout does not break it. Returns where it was found.
 */
async function pick(page: Page, key: string, area = { x0: 0, y0: 0, x1: 1, y1: 1 }): Promise<{ x: number; y: number }> {
  const canvas = await canvasBox(page);
  for (let fy = area.y0 + 0.02; fy < area.y1; fy += 0.035) {
    for (let fx = area.x0 + 0.01; fx < area.x1; fx += 0.02) {
      const at = { x: canvas.x + canvas.width * fx, y: canvas.y + canvas.height * fy };
      await page.mouse.click(at.x, at.y);
      if (await page.locator(`[data-selection-box="${key}"]`).count() > 0) return at;
    }
  }
  throw new Error(`could not pick ${key}`);
}

async function frame(page: Page): Promise<string> {
  return page.evaluate(() => document.querySelector('canvas')?.toDataURL('image/png') ?? '');
}

test('the YouTube Bold brand mark is picked, recoloured, deleted and put back exactly', async ({ page }) => {
  await open(page, 'tn-youtube-bold');
  const before = await frame(page);

  await pick(page, 'shape:mark', { x0: 0, y0: 0, x1: 0.15, y1: 0.25 });
  await expect(page.locator(SELECTION)).toHaveAttribute('aria-label', /Brand mark selected/);
  // Its settings open in Style, with the colour row an added shape has.
  await expect(page.locator('[data-part-settings="shape:mark"]')).toBeVisible();
  await page.getByRole('button', { name: 'Colour: Text' }).click();
  await page.waitForTimeout(300);
  const recoloured = await frame(page);
  expect(recoloured).not.toBe(before);

  await page.locator(SELECTION).focus();
  await page.keyboard.press('Delete');
  await page.waitForTimeout(300);
  await expect(page.locator(SELECTION)).toHaveCount(0);
  const gone = await frame(page);
  expect(gone).not.toBe(recoloured);

  // Undo, then undo again, is the design as it was.
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(400);
  expect(await frame(page)).toBe(before);

  // Deleted again, Style's list puts it back.
  await pick(page, 'shape:mark', { x0: 0, y0: 0, x1: 0.15, y1: 0.25 });
  await page.locator(SELECTION).focus();
  await page.keyboard.press('Delete');
  await page.getByRole('tab', { name: 'Style' }).click();
  const list = page.locator('[data-design-shapes]');
  if (!(await list.isVisible())) await page.getByRole('button', { name: /Shapes in this design/ }).click();
  await page.locator('[data-part-row="shape:mark"]').getByRole('button', { name: 'Put back' }).click();
  await page.waitForTimeout(400);
  expect(await frame(page)).toBe(before);
});

test('the highlighted words carry their box with them', async ({ page }) => {
  await open(page, 'tn-youtube-bold');
  const at = await pick(page, 'shape:highlight', { x0: 0, y0: 0.35, x1: 0.5, y1: 0.95 });
  const box = await page.locator(SELECTION).boundingBox();
  if (!box) throw new Error('no box');
  // Select the words on the box and drag them; the box comes along.
  await pick(page, 'text:highlight', { x0: 0, y0: 0.35, x1: 0.5, y1: 0.95 });
  const words = await page.locator(SELECTION).boundingBox();
  if (!words) throw new Error('no words');
  const from = { x: words.x + words.width / 2, y: words.y + words.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.keyboard.down('Shift');
  await page.mouse.move(from.x + 40, from.y - 30, { steps: 4 });
  await page.keyboard.up('Shift');
  await page.mouse.up();
  // Put the words down first: a press by their edge would take one of their handles.
  await page.keyboard.press('Escape');
  await page.mouse.click(at.x + 40, at.y - 30);
  const moved = await page.locator('[data-selection-box="shape:highlight"]').boundingBox();
  expect(moved).not.toBeNull();
  expect(Math.abs((moved?.x ?? 0) - box.x - 40)).toBeLessThan(3);
  expect(Math.abs((moved?.y ?? 0) - box.y + 30)).toBeLessThan(3);
});

test('the Episode 24 pill moves with its words', async ({ page }) => {
  await open(page, 'tn-podcast-episode');
  const pillAt = await pick(page, 'shape:eyebrowPill', { x0: 0, y0: 0.1, x1: 0.5, y1: 0.6 });
  const pill = await page.locator(SELECTION).boundingBox();
  if (!pill) throw new Error('no pill');
  await pick(page, 'text:eyebrow', { x0: 0, y0: 0.1, x1: 0.5, y1: 0.6 });
  const words = await page.locator(SELECTION).boundingBox();
  if (!words) throw new Error('no words');
  const from = { x: words.x + words.width / 2, y: words.y + words.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.keyboard.down('Shift');
  await page.mouse.move(from.x + 150, from.y - 10, { steps: 4 });
  await page.keyboard.up('Shift');
  await page.mouse.up();
  await page.keyboard.press('Escape');
  await page.mouse.click(pillAt.x + 150, pillAt.y - 10);
  const moved = await page.locator('[data-selection-box="shape:eyebrowPill"]').boundingBox();
  expect(moved).not.toBeNull();
  expect(Math.abs((moved?.x ?? 0) - pill.x - 150)).toBeLessThan(3);
  expect(Math.abs((moved?.y ?? 0) - pill.y + 10)).toBeLessThan(3);
});

test("a pillar's number is typed into on the picture", async ({ page }) => {
  await open(page, 'bp-marketing-strategy');
  await pick(page, 'text:pillarNumbers#2', { x0: 0, y0: 0.4, x1: 0.55, y1: 1 });
  await page.keyboard.press('Enter');
  const editor = page.locator('textarea').first();
  await expect(editor).toBeVisible();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('5');
  await page.keyboard.press('Enter');
  await page.getByRole('tab', { name: 'Text' }).click();
  // The entry picked on the picture opens its list's tile.
  const field = page.getByLabel('Pillar numbers', { exact: true });
  if (!(await field.isVisible())) await page.locator('[data-text-tile="text:pillarNumbers"] button').first().click();
  await expect(field).toHaveValue('01, 02, 5, 04');
});
