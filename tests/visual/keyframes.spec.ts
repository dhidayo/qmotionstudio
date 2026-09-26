import { expect, test, type Page } from '@playwright/test';

/**
 * Overlay motion, end to end.
 *
 * The interaction is three things: turn it on, move the playhead, drag. If
 * that loop works and the overlay is genuinely somewhere in between at a time
 * between two keyframes, the feature does what it claims.
 */

test.use({ viewport: { width: 1500, height: 940 } });

const SELECTION = '[data-selection-box]';

type Box = { x: number; y: number; width: number; height: number };

async function boxOf(page: Page, selector = SELECTION): Promise<Box> {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`${selector} has no box`);
  return box;
}

const centreOf = (box: Box): { x: number; y: number } => ({
  x: box.x + box.width / 2,
  y: box.y + box.height / 2,
});

async function drag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.keyboard.down('Shift'); // no snapping
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2);
  await page.mouse.move(to.x, to.y);
  await page.keyboard.up('Shift');
  await page.mouse.up();
}

/** Puts the playhead at an exact project time, through the ruler. */
async function seek(page: Page, ms: number): Promise<void> {
  const ruler = page.getByLabel('Scrub');
  const box = await ruler.boundingBox();
  if (!box) throw new Error('no ruler');
  const max = Number(await ruler.getAttribute('aria-valuemax'));
  await page.mouse.click(box.x + box.width * (ms / max), box.y + box.height / 2);
  await expect(ruler).toHaveAttribute('aria-valuenow', String(ms));
}

/** An ad with one text overlay, entrance off so it is visible throughout. */
async function overlayProject(page: Page): Promise<void> {
  await page.goto('/?template=quick-pitch&aspect=9:16&frozen=1600');
  await page.waitForSelector('canvas');
  await page.waitForTimeout(2_000);

  await page.getByTitle('Add a text overlay').click();
  await expect(page.locator(SELECTION)).toBeVisible();

  // Entrance and exit to None: the presets are transient and would otherwise
  // be moving the overlay at exactly the moments this measures.
  const motion = page.getByRole('group', { name: 'Entrance' });
  await motion.getByRole('button', { name: 'None', exact: true }).click();
  await page.getByRole('group', { name: 'Exit' }).getByRole('button', { name: 'None', exact: true }).click();
}


const bar = (page: Page) => page.locator('[data-motion-bar]');
const addMotion = (page: Page) => page.getByRole('button', { name: 'Add motion' });

test.describe('motion is a span on the timeline', () => {
  /*
   * The model people arrive with, and the one every tool they have used gives
   * them: a bar with a start and an end that can be dragged and stretched.
   * Point keyframes came first and were repeatedly reported as confusing —
   * "can't I have them on the timeline like other products have them".
   */

  test('adding a motion puts a bar on the timeline', async ({ page }) => {
    await overlayProject(page);
    await expect(bar(page)).toHaveCount(0);

    await addMotion(page).click();
    await expect(bar(page)).toHaveCount(1);
    // Three seconds, not five: the default is clamped to the element, and this
    // overlay is three seconds long.
    await expect(bar(page)).toHaveAttribute('title', '0.0s → 3.0s');
  });

  test('adding one changes nothing until the element is moved', async ({ page }) => {
    await overlayProject(page);
    const before = centreOf(await boxOf(page));

    await addMotion(page).click();
    await seek(page, 4_000);

    // Both ends hold the pose it already had, so the overlay has not moved.
    const after = centreOf(await boxOf(page));
    expect(after.x).toBeCloseTo(before.x, 0);
    expect(after.y).toBeCloseTo(before.y, 0);
  });

  test('the end of the bar is where the element ends up', async ({ page }) => {
    await overlayProject(page);
    await addMotion(page).click();

    await page.getByRole('button', { name: 'Go to end' }).click();
    const from = centreOf(await boxOf(page));
    await drag(page, from, { x: from.x + 130, y: from.y + 90 });

    await page.getByRole('button', { name: 'Go to start' }).click();
    const start = centreOf(await boxOf(page));
    await page.getByRole('button', { name: 'Go to end' }).click();
    const end = centreOf(await boxOf(page));

    expect(end.x).toBeGreaterThan(start.x + 90);
    expect(end.y).toBeGreaterThan(start.y + 60);
  });

  test('dragging an end of the bar changes how long it takes', async ({ page }) => {
    await overlayProject(page);
    await addMotion(page).click();
    await expect(bar(page)).toHaveAttribute('title', '0.0s → 3.0s');

    const grip = await page.locator('[data-motion-grip="start"]').boundingBox();
    if (!grip) throw new Error('no grip');

    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(grip.x + 60, grip.y + grip.height / 2, { steps: 6 });
    await page.mouse.up();

    // Shorter, and still ending where it did.
    const title = await bar(page).getAttribute('title');
    expect(title).toMatch(/→ 3\.0s$/);
    expect(title).not.toBe('0.0s → 3.0s');
  });

  test('a motion can be removed', async ({ page }) => {
    await overlayProject(page);
    await addMotion(page).click();
    await expect(bar(page)).toHaveCount(1);

    await page.getByRole('button', { name: 'Remove motion' }).click();
    await expect(bar(page)).toHaveCount(0);
    await expect(addMotion(page)).toBeVisible();
  });

  test('the motion style can be changed', async ({ page }) => {
    await overlayProject(page);
    await addMotion(page).click();

    const styles = page.getByRole('group', { name: 'How it moves' });
    await expect(styles.getByRole('button', { name: 'Smooth' })).toHaveAttribute('aria-pressed', 'true');

    await styles.getByRole('button', { name: 'Soft bounce' }).click();
    await expect(styles.getByRole('button', { name: 'Soft bounce' })).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('seeing the motion', () => {
  test('draws the path across the artboard once the element has moved', async ({ page }) => {
    await overlayProject(page);
    await expect(page.locator('[data-motion-path]')).toHaveCount(0);

    await addMotion(page).click();
    await page.getByRole('button', { name: 'Go to end' }).click();
    const from = centreOf(await boxOf(page));
    await drag(page, from, { x: from.x + 120, y: from.y + 80 });

    await expect(page.locator('[data-motion-path] polyline')).toHaveCount(1);
    await expect(page.locator('[data-path-pose]')).toHaveCount(2);
  });

  test('goes away when the overlay is deselected', async ({ page }) => {
    await overlayProject(page);
    await addMotion(page).click();
    await expect(page.locator('[data-motion-path]')).toHaveCount(1);

    await page.keyboard.press('Escape');
    await expect(page.locator('[data-motion-path]')).toHaveCount(0);
  });
});
