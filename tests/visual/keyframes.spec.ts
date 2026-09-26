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

const diamonds = (page: Page) => page.locator('[data-keyframe]');

/** The Movement toggle renders as a switch with its label as text. */
const movementSwitch = (page: Page) => page.getByRole('switch', { name: 'Animate movement' });

test.describe('overlay keyframes', () => {
  test('are off until asked for, and start from where the overlay already is', async ({ page }) => {
    await overlayProject(page);
    await expect(diamonds(page)).toHaveCount(0);

    const before = await boxOf(page);
    await movementSwitch(page).click();

    // One keyframe is the same picture as none: nothing may move.
    await expect(page.getByText('1 keyframe', { exact: false })).toBeVisible();
    await expect(diamonds(page)).toHaveCount(1);

    const after = await boxOf(page);
    expect(after.x).toBeCloseTo(before.x, 0);
    expect(after.y).toBeCloseTo(before.y, 0);
  });

  test('dragging at a new time records a keyframe there', async ({ page }) => {
    await overlayProject(page);
    await movementSwitch(page).click();

    await seek(page, 4_400);
    const box = await boxOf(page);
    await drag(page, centreOf(box), { x: centreOf(box).x + 120, y: centreOf(box).y + 90 });

    await expect(diamonds(page)).toHaveCount(2);
    // 4400 project − 1600 overlay start = 2800 in the overlay's own time.
    await expect(diamonds(page).nth(1)).toHaveAttribute('data-keyframe', '2800');
  });

  test('the overlay is genuinely between its keyframes in between', async ({ page }) => {
    await overlayProject(page);
    await movementSwitch(page).click();

    await seek(page, 1_600);
    const start = centreOf(await boxOf(page));

    await seek(page, 4_400);
    const from = centreOf(await boxOf(page));
    await drag(page, from, { x: from.x + 120, y: from.y + 90 });
    const end = centreOf(await boxOf(page));

    expect(end.x).toBeGreaterThan(start.x + 80);

    await seek(page, 3_000);
    const middle = centreOf(await boxOf(page));

    expect(middle.x, 'past the start').toBeGreaterThan(start.x + 10);
    expect(middle.x, 'short of the end').toBeLessThan(end.x - 10);
    expect(middle.y).toBeGreaterThan(start.y + 5);
    expect(middle.y).toBeLessThan(end.y - 5);
  });

  test('a keyframe can be removed, and the last one turns movement off', async ({ page }) => {
    await overlayProject(page);
    await movementSwitch(page).click();

    await seek(page, 4_400);
    const box = await boxOf(page);
    await drag(page, centreOf(box), { x: centreOf(box).x + 100, y: centreOf(box).y });
    await expect(diamonds(page)).toHaveCount(2);

    // The playhead is on the keyframe just written, so Remove is live.
    await page.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(diamonds(page)).toHaveCount(1);

    await seek(page, 1_600);
    await page.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(diamonds(page)).toHaveCount(0);
    await expect(page.getByText('Turn this on, then move the playhead')).toBeVisible();
  });

  test('turning movement off leaves it where the playhead showed it', async ({ page }) => {
    await overlayProject(page);
    await movementSwitch(page).click();

    await seek(page, 4_400);
    const box = await boxOf(page);
    await drag(page, centreOf(box), { x: centreOf(box).x + 130, y: centreOf(box).y });

    await seek(page, 3_000);
    const midway = centreOf(await boxOf(page));

    await movementSwitch(page).click();
    await expect(diamonds(page)).toHaveCount(0);

    const frozen = centreOf(await boxOf(page));
    expect(frozen.x).toBeCloseTo(midway.x, 0);
    expect(frozen.y).toBeCloseTo(midway.y, 0);
  });

  test('a whole drag at one keyframe is one undo step', async ({ page }) => {
    await overlayProject(page);
    await movementSwitch(page).click();

    await seek(page, 4_400);
    const box = await boxOf(page);
    const before = centreOf(box);
    await drag(page, before, { x: before.x + 110, y: before.y });
    expect(centreOf(await boxOf(page)).x).toBeGreaterThan(before.x + 80);

    await page.keyboard.press('ControlOrMeta+z');
    await page.waitForTimeout(200);
    expect(centreOf(await boxOf(page)).x).toBeCloseTo(before.x, 0);
  });
});

test.describe('seeing the motion', () => {
  test('draws the path across the artboard once there is one', async ({ page }) => {
    /*
     * The discoverability fix. With only a panel and a few small diamonds on
     * the clip, nothing on screen answered the question anyone actually has
     * while placing keyframes: where is this thing going?
     */
    await overlayProject(page);
    await expect(page.locator('[data-motion-path]')).toHaveCount(0);

    await movementSwitch(page).click();
    // One pose is not a journey, but the dot still marks it.
    await expect(page.locator('[data-path-pose]')).toHaveCount(1);

    await seek(page, 4_400);
    const box = await boxOf(page);
    await drag(page, centreOf(box), { x: centreOf(box).x + 120, y: centreOf(box).y + 80 });

    await expect(page.locator('[data-motion-path] polyline')).toHaveCount(1);
    await expect(page.locator('[data-path-pose]')).toHaveCount(2);
  });

  test('goes away when the overlay is deselected', async ({ page }) => {
    await overlayProject(page);
    await movementSwitch(page).click();
    await expect(page.locator('[data-motion-path]')).toHaveCount(1);

    await page.keyboard.press('Escape');
    await expect(page.locator('[data-motion-path]')).toHaveCount(0);
  });
});
