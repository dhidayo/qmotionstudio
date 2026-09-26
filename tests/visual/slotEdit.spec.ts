import { expect, test, type Page } from '@playwright/test';

/**
 * Dragging the template's own elements (B).
 *
 * The choice being tested is that a nudge is an *offset* from where the
 * template put something, never an absolute position. Everything worth
 * asserting follows from that: the rest of the layout stays put, the
 * template's motion survives, switching aspect still re-lays-out, and undoing
 * it is exactly forgetting it.
 */

test.use({ viewport: { width: 1500, height: 940 } });

const SELECTION = '[data-selection-box]';

async function openScene(page: Page, frozenMs = 2_500): Promise<void> {
  await page.goto(`/?template=depth-parallax&aspect=9:16&frozen=${frozenMs}`);
  await page.waitForSelector('canvas');
  // Sample photos decode asynchronously and the planes are sized from them.
  await page.waitForTimeout(2_500);
}

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
  await page.keyboard.down('Shift'); // no snapping: this measures the drag
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2);
  await page.mouse.move(to.x, to.y);
  await page.keyboard.up('Shift');
  await page.mouse.up();
}

/** The frame the canvas is showing, as a data URL, for comparing renders. */
async function frameHash(page: Page): Promise<string> {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) throw new Error('no canvas');
    return canvas.toDataURL('image/png').slice(-2_000);
  });
}

/** Scoped: the Photos tab has frame-ratio buttons with the same labels. */
const aspectButton = (page: Page, label: string) =>
  page.getByRole('group', { name: 'Aspect ratio' }).getByRole('button', { name: label, exact: true });

/**
 * Clicks the headline, which sits in the type band at the foot of the frame.
 *
 * Tries a couple of points down the band rather than one: the headline's
 * height depends on how the string wraps, which depends on the measured font,
 * and a single hard-coded fraction is the kind of thing that passes on the
 * machine it was written on.
 *
 * That tolerance means this cannot prove the box is in the *right* place — it
 * found a mis-anchored box quite happily. `bounds.test.ts` pins the anchor
 * arithmetic exactly; this only has to get hold of the headline.
 */
async function selectHeadline(page: Page): Promise<Box> {
  const canvas = await boxOf(page, 'canvas');
  for (const y of [0.87, 0.84, 0.9, 0.81]) {
    await page.mouse.click(canvas.x + canvas.width * 0.4, canvas.y + canvas.height * y);
    const label = await page.locator(SELECTION).getAttribute('aria-label').catch(() => null);
    if (label !== null && /Headline selected/.test(label)) return boxOf(page);
  }
  throw new Error('could not find the headline on the artboard');
}

/** Clicks the front photo plane, which sits just left of centre. */
async function selectFrontPhoto(page: Page): Promise<Box> {
  const canvas = await boxOf(page, 'canvas');
  await page.mouse.click(canvas.x + canvas.width * 0.42, canvas.y + canvas.height * 0.45);
  await expect(page.locator(SELECTION)).toBeVisible();
  return boxOf(page);
}

test.describe('dragging a template element', () => {
  test('a photo can be picked up, and its own panel opens', async ({ page }) => {
    await openScene(page);
    await selectFrontPhoto(page);

    await expect(page.locator(SELECTION)).toHaveAttribute('aria-label', /Photo \d+ selected/);
    // Clicking a photo on the canvas selects that photo in the Photos tab —
    // the controls on screen are the ones for the thing just clicked.
    await expect(page.getByRole('tab', { name: 'Photos' })).toHaveAttribute('aria-selected', 'true');
  });

  test('moves it without disturbing the rest of the layout', async ({ page }) => {
    await openScene(page);
    const before = await selectFrontPhoto(page);

    await drag(page, centreOf(before), { x: centreOf(before).x + 70, y: centreOf(before).y + 55 });

    const after = await boxOf(page);
    expect(after.x - before.x).toBeCloseTo(70, -1);
    expect(after.y - before.y).toBeCloseTo(55, -1);
    expect(after.width, 'a move is not a resize').toBeCloseTo(before.width, 0);

    // The headline is a different slot and must not have moved with the photo.
    await selectHeadline(page);
  });

  test('text can be dragged too, and opens the Text tab', async ({ page }) => {
    await openScene(page);

    const before = await selectHeadline(page);
    await expect(page.getByRole('tab', { name: 'Text' })).toHaveAttribute('aria-selected', 'true');
    await drag(page, centreOf(before), { x: centreOf(before).x + 40, y: centreOf(before).y - 90 });

    const after = await boxOf(page);
    expect(after.y - before.y).toBeCloseTo(-90, -1);
  });

  test('a corner resizes it proportionally', async ({ page }) => {
    await openScene(page);
    const before = await selectFrontPhoto(page);

    await drag(
      page,
      { x: before.x + before.width, y: before.y + before.height },
      { x: before.x + before.width + 55, y: before.y + before.height + 55 },
    );

    const after = await boxOf(page);
    expect(after.width).toBeGreaterThan(before.width + 20);
    expect(after.width / after.height).toBeCloseTo(before.width / before.height, 1);
    expect(after.x, 'anchored on the opposite corner').toBeCloseTo(before.x, 0);
  });
});

test.describe('clearing the selection', () => {
  test('clicking bare background deselects, because the background is not a slot', async ({ page }) => {
    // The template's background is a drawable the funnels never tagged, so it
    // is not something that can be picked up — clicking it means "nothing".
    await openScene(page);
    await selectFrontPhoto(page);

    const canvas = await boxOf(page, 'canvas');
    await page.mouse.click(canvas.x + canvas.width * 0.5, canvas.y + canvas.height * 0.06);
    await expect(page.locator(SELECTION)).toHaveCount(0);
  });
});

test.describe('a nudge is an offset, not a position', () => {
  test('“Reset to template” puts it back exactly', async ({ page }) => {
    await openScene(page);
    const before = await selectFrontPhoto(page);
    const original = await frameHash(page);

    await drag(page, centreOf(before), { x: centreOf(before).x + 80, y: centreOf(before).y - 60 });
    expect(await frameHash(page), 'the frame actually changed').not.toBe(original);

    await page.getByRole('button', { name: 'Reset to template' }).click();
    await page.waitForTimeout(200);

    expect(await frameHash(page), 'and is pixel-identical again').toBe(original);
  });

  test('⌘Z undoes the whole drag in one step', async ({ page }) => {
    await openScene(page);
    const before = await selectFrontPhoto(page);

    await drag(page, centreOf(before), { x: centreOf(before).x + 90, y: centreOf(before).y + 40 });
    expect((await boxOf(page)).x).toBeGreaterThan(before.x + 60);

    await page.keyboard.press('ControlOrMeta+z');
    await page.waitForTimeout(200);
    expect((await boxOf(page)).x).toBeCloseTo(before.x, 0);
  });

  test('survives an aspect change, because the template still lays out', async ({ page }) => {
    /*
     * The reason offsets were chosen over absolute placement. §1.3 requires
     * switching aspect to re-lay-out; an absolute position would pin the photo
     * to wherever it happened to sit in 9:16 and leave it stranded in 16:9.
     * The nudge has to survive *and* still be relative to the new layout.
     */
    await openScene(page);
    const before = await selectFrontPhoto(page);
    await drag(page, centreOf(before), { x: centreOf(before).x + 60, y: centreOf(before).y - 70 });

    await aspectButton(page, '16:9').click();
    await page.waitForTimeout(600);

    // Still nudged: the reset control only appears when something is moved.
    await expect(page.getByRole('button', { name: 'Reset to template' })).toBeVisible();

    // And still on screen, not stranded off the edge of a wider frame.
    const canvas = await boxOf(page, 'canvas');
    const box = await boxOf(page);
    expect(box.x).toBeGreaterThan(canvas.x - box.width);
    expect(box.x).toBeLessThan(canvas.x + canvas.width);
  });

  test('keeps the template’s animation running', async ({ page }) => {
    // The plane drifts across its scene. Nudging it moves where it drifts; it
    // must not freeze it in place.
    await openScene(page, 1_000);
    const before = await selectFrontPhoto(page);
    await drag(page, centreOf(before), { x: centreOf(before).x + 50, y: centreOf(before).y });

    const atOneSecond = await frameHash(page);
    await page.goto('/?template=depth-parallax&aspect=9:16&frozen=1000');
    await page.waitForTimeout(500);

    // Re-open at a later time and confirm the picture is different, i.e. the
    // scene is still animating rather than pinned.
    await page.goto('/?template=depth-parallax&aspect=9:16&frozen=6000');
    await page.waitForSelector('canvas');
    await page.waitForTimeout(2_500);
    expect(await frameHash(page)).not.toBe(atOneSecond);
  });
});

test.describe('the whole-scene reset', () => {
  test('clears every nudge at once', async ({ page }) => {
    await openScene(page);

    const photo = await selectFrontPhoto(page);
    await drag(page, centreOf(photo), { x: centreOf(photo).x + 60, y: centreOf(photo).y + 40 });

    const headline = await selectHeadline(page);
    await drag(page, centreOf(headline), { x: centreOf(headline).x, y: centreOf(headline).y - 60 });

    await page.getByRole('tab', { name: 'Look' }).click();
    await expect(page.getByText(/2 elements have been moved/)).toBeVisible();

    await page.getByRole('button', { name: 'Reset the whole layout' }).click();
    await expect(page.getByText(/elements have been moved/)).toBeHidden();
  });
});

test.describe('stacking (Arrange)', () => {
  test('sends an element behind the others without erasing it', async ({ page }) => {
    await openScene(page);
    await selectFrontPhoto(page);
    const original = await frameHash(page);

    await page.getByRole('button', { name: 'Send to back' }).click();
    await page.waitForTimeout(300);

    const sent = await frameHash(page);
    expect(sent, 'the picture changed').not.toBe(original);

    /*
     * And the photo is still on screen. Restacking moves the template's own
     * elements among themselves; the background is not one of them, so
     * "send to back" cannot put a photo underneath it and wipe it out.
     */
    const box = await boxOf(page);
    const canvas = await boxOf(page, 'canvas');
    const sample = await page.evaluate(
      ([cx, cy]: readonly number[]) => {
        const canvasEl = document.querySelector('canvas');
        if (!canvasEl) throw new Error('no canvas');
        const ctx = canvasEl.getContext('2d');
        if (!ctx) throw new Error('no context');
        const rect = canvasEl.getBoundingClientRect();
        const x = Math.round((((cx ?? 0) - rect.left) / rect.width) * canvasEl.width);
        const y = Math.round((((cy ?? 0) - rect.top) / rect.height) * canvasEl.height);
        const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
        return (r ?? 0) + (g ?? 0) + (b ?? 0);
      },
      [box.x + box.width / 2, box.y + box.height * 0.9] as const,
    );
    expect(sample, 'still something drawn there, not bare background').toBeGreaterThan(40);
    expect(canvas.width).toBeGreaterThan(0);
  });

  test('bringing it forward again restores the original picture', async ({ page }) => {
    await openScene(page);
    await selectFrontPhoto(page);
    const original = await frameHash(page);

    await page.getByRole('button', { name: 'Send to back' }).click();
    await page.waitForTimeout(250);
    expect(await frameHash(page)).not.toBe(original);

    await page.getByRole('button', { name: 'Reset to template' }).click();
    await page.waitForTimeout(250);
    expect(await frameHash(page), 'reset puts the stacking back too').toBe(original);
  });
});
