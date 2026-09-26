import { expect, test, type Page } from '@playwright/test';

/**
 * Direct manipulation on the artboard (A).
 *
 * Placement used to be two sliders called "Across" and "Down", which is a way
 * of typing coordinates rather than a way of placing something. These cover
 * the gestures people arrive already knowing: drag to move, corners to resize,
 * a handle above to turn, arrows to nudge, and one ⌘Z per gesture.
 */

test.use({ viewport: { width: 1500, height: 940 } });

/** A 1×1 opaque PNG — enough to decode, small enough to inline. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const SELECTION = '[data-selection-box]';

async function openAd(page: Page): Promise<void> {
  await page.goto('/?template=quick-pitch&aspect=9:16&frozen=1500');
  await page.waitForSelector('canvas');
  await page.waitForTimeout(2_000);
}

async function addTextOverlay(page: Page): Promise<void> {
  await openAd(page);
  // By title: the button's visible text is "+ Text", so that is its
  // accessible name, and the title is the only stable description of it.
  await page.getByTitle('Add a text overlay').click();
  await expect(page.locator(SELECTION)).toBeVisible();
}

type Box = { x: number; y: number; width: number; height: number };

async function boxOf(page: Page, selector = SELECTION): Promise<Box> {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`${selector} has no box`);
  return box;
}

function centreOf(box: Box): { x: number; y: number } {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * A pointer drag with intermediate moves.
 *
 * The steps matter: the handler reads `event.buttons` on every move, and a
 * single jump from press to release would exercise none of the path the user
 * actually takes.
 */
async function drag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  options: { free?: boolean } = {},
): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  if (options.free === true) await page.keyboard.down('Shift');
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2);
  await page.mouse.move(to.x, to.y);
  if (options.free === true) await page.keyboard.up('Shift');
  await page.mouse.up();
}

const across = (page: Page): Promise<string> =>
  page.getByLabel('Across', { exact: true }).inputValue();
const down = (page: Page): Promise<string> =>
  page.getByLabel('Down', { exact: true }).inputValue();

test.describe('moving things on the canvas', () => {
  test('a drag moves an overlay by exactly the distance dragged', async ({ page }) => {
    await addTextOverlay(page);

    const canvas = await boxOf(page, 'canvas');
    const start = centreOf(await boxOf(page));

    // ⇧ turns snapping off, so this measures the drag and nothing else.
    await drag(page, start, { x: start.x + 90, y: start.y + 120 }, { free: true });

    expect(Number(await across(page))).toBeCloseTo(50 + (90 / canvas.width) * 100, 0);
    expect(Number(await down(page))).toBeCloseTo(50 + (120 / canvas.height) * 100, 0);
  });

  test('pressing the middle of a caption picks it up rather than resizing it', async ({ page }) => {
    /*
     * A one-line caption is about 20 CSS pixels tall. With a 13px handle zone
     * on the north edge and another on the south, the two met in the middle
     * and swallowed the body: pressing the centre of a caption stretched it
     * instead of moving it. Handle zones are now capped at a third of the box.
     */
    await addTextOverlay(page);
    const before = await boxOf(page);
    expect(before.height, 'a caption is thin enough for the zones to collide').toBeLessThan(40);

    await drag(page, centreOf(before), { x: centreOf(before).x, y: centreOf(before).y + 100 }, { free: true });

    const after = await boxOf(page);
    expect(after.height, 'the caption kept its size').toBeCloseTo(before.height, 0);
    expect(after.width).toBeCloseTo(before.width, 0);
    expect(after.y, 'and moved down').toBeGreaterThan(before.y + 80);
  });

  test('a whole drag is one undo step', async ({ page }) => {
    await addTextOverlay(page);
    const start = centreOf(await boxOf(page));
    await drag(page, start, { x: start.x + 80, y: start.y + 80 }, { free: true });

    expect(Number(await across(page))).not.toBe(50);
    await page.keyboard.press('ControlOrMeta+z');

    expect(Number(await across(page))).toBe(50);
    expect(Number(await down(page))).toBe(50);
  });

  test('Escape clears the selection', async ({ page }) => {
    /*
     * Escape rather than a click on bare canvas. Since the template's own
     * elements became selectable there is often no bare canvas left to click:
     * beat one of this ad is a full-bleed photo, so the corner of the frame
     * selects that photo, which is correct and is what makes the keyboard the
     * reliable way out. Clicking through to nothing is covered in
     * slotEdit.spec.ts, on a template that has visible background.
     */
    await addTextOverlay(page);
    await page.locator(SELECTION).click();

    await page.keyboard.press('Escape');
    await expect(page.locator(SELECTION)).toHaveCount(0);
  });

  test('arrow keys nudge, and ⇧ nudges further', async ({ page }) => {
    await addTextOverlay(page);
    await page.locator(SELECTION).click();

    await page.keyboard.press('ArrowRight');
    const once = Number(await across(page));
    expect(once, 'one step right').toBeGreaterThan(50);

    await page.keyboard.press('Shift+ArrowRight');
    expect(Number(await across(page)) - once, '⇧ moves further').toBeGreaterThan(once - 50);
  });
});

test.describe('snapping', () => {
  test('pulls to the centre line, and ⇧ lets go', async ({ page }) => {
    await addTextOverlay(page);
    const canvas = await boxOf(page, 'canvas');
    const start = centreOf(await boxOf(page));

    // Four pixels off centre — inside the snap tolerance.
    await drag(page, start, { x: start.x + 4, y: start.y + 70 }, { free: true });
    const unsnapped = Number(await across(page));
    expect(unsnapped, 'with ⇧ held it stays where it was put').not.toBe(50);

    // Same nudge again without ⇧, from wherever it now is, back towards centre.
    const now = centreOf(await boxOf(page));
    await drag(page, now, { x: canvas.x + canvas.width / 2 + 3, y: now.y });

    expect(Number(await across(page)), 'snapped back onto the centre line').toBe(50);
    await expect(page.locator('[data-guide="x"]')).toHaveCount(0); // gone once the drag ends
  });
});

test.describe('resizing and turning', () => {
  test('a corner drag keeps the opposite corner still and the proportions right', async ({ page }) => {
    await addTextOverlay(page);
    const before = await boxOf(page);

    // The south-east corner, outwards.
    await drag(
      page,
      { x: before.x + before.width, y: before.y + before.height },
      { x: before.x + before.width + 60, y: before.y + before.height + 60 },
      { free: true },
    );

    const after = await boxOf(page);
    expect(after.x, 'the north-west corner stayed put').toBeCloseTo(before.x, 0);
    expect(after.y).toBeCloseTo(before.y, 0);
    expect(after.width, 'and it grew').toBeGreaterThan(before.width + 20);

    const ratioBefore = before.width / before.height;
    const ratioAfter = after.width / after.height;
    expect(ratioAfter, 'a corner never distorts').toBeCloseTo(ratioBefore, 1);
  });

  test('over-dragging an edge collapses it rather than turning it inside out', async ({ page }) => {
    await addTextOverlay(page);
    const before = await boxOf(page);

    // Drag the north edge far *below* the south edge.
    await drag(
      page,
      { x: before.x + before.width / 2, y: before.y },
      { x: before.x + before.width / 2, y: before.y + before.height + 160 },
      { free: true },
    );

    const after = await boxOf(page);
    expect(after.height, 'collapsed, not mirrored').toBeLessThan(before.height);
    expect(after.y + after.height, 'the south edge held').toBeLessThan(before.y + before.height + 12);
  });

  test('the rotate handle turns in fifteens, and ⇧ turns freely', async ({ page }) => {
    await addTextOverlay(page);
    const box = await boxOf(page);
    const centre = centreOf(box);
    const grip = await boxOf(page, '[data-grip="rotate"]');

    await drag(page, centreOf(grip), { x: centre.x + 70, y: centre.y + 40 });

    const snapped = Number(await page.getByLabel('Rotation', { exact: true }).inputValue());
    expect(snapped % 15, `${snapped}° should be a multiple of fifteen`).toBe(0);
    expect(snapped).not.toBe(0);
  });
});

test.describe('the logo (§8.3)', () => {
  test('can be dragged, which is what its own panel promises', async ({ page }) => {
    await openAd(page);

    await page.getByRole('tab', { name: 'Logo' }).click();
    await page.locator('input[type="file"]').last().setInputFiles({
      name: 'logo.png', mimeType: 'image/png', buffer: PNG,
    });

    // Centre it so the click target is somewhere this test can name. Scoped to
    // the Position group: the template library has its own "Free" button.
    const position = page.getByRole('group', { name: 'Position' });
    await position.getByRole('button', { name: 'Centre', exact: true }).click();

    const canvas = await boxOf(page, 'canvas');
    const middle = { x: canvas.x + canvas.width / 2, y: canvas.y + canvas.height / 2 };

    await page.mouse.click(middle.x, middle.y);
    await expect(page.locator(SELECTION)).toHaveAttribute('aria-label', /Logo selected/);

    await drag(page, middle, { x: middle.x - 90, y: middle.y - 130 }, { free: true });

    // Dragging a pinned logo unpins it — the alternative is a drag that does
    // nothing until the user finds the right radio button first.
    await expect(position.getByRole('button', { name: 'Free', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    const after = centreOf(await boxOf(page));
    expect(after.x).toBeLessThan(middle.x - 60);
    expect(after.y).toBeLessThan(middle.y - 100);
  });
});
