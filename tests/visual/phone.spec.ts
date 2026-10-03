import { expect, test, type CDPSession, type Page } from '@playwright/test';

/**
 * The phone layout (D-109) and touch on the canvas (D-110).
 *
 * Asked for as a separate design for phones, the way CapCut does it: one-row
 * top bar, one frame-shape button, clear "Choose a design" / "Add your
 * photos", designs that move, a select-then-move rule for fingers, pinch to
 * zoom the view, and Corporate Ads with its timeline folded.
 *
 * Touch is driven through the DevTools protocol, which is the only way to put
 * real fingers — and two of them — on the page.
 */

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const LIFESTYLE = '/?template=pop-float&aspect=1:1&frozen=3000';
const AD = '/?template=quick-pitch&aspect=9:16&frozen=2000';
const PHOTO = { x: 0.5, y: 0.5 };
const EMPTY = { x: 0.06, y: 0.94 };

async function open(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.waitForSelector('canvas');
  await page.waitForTimeout(2_500);
}

async function at(page: Page, fx: number, fy: number): Promise<{ x: number; y: number }> {
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('no canvas');
  return { x: box.x + box.width * fx, y: box.y + box.height * fy };
}

type Finger = { x: number; y: number };

async function fingers(page: Page): Promise<CDPSession> {
  return page.context().newCDPSession(page);
}

async function touchDrag(cdp: CDPSession, from: Finger, to: Finger): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
  for (let i = 1; i <= 10; i++) {
    const t = i / 10;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function pinchOut(cdp: CDPSession, centre: Finger, from: number, to: number): Promise<void> {
  const pair = (d: number): Finger[] => [{ x: centre.x - d / 2, y: centre.y }, { x: centre.x + d / 2, y: centre.y }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pair(from) });
  for (let i = 1; i <= 10; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pair(from + ((to - from) * i) / 10) });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/** A tap, then long enough that the next one is not a double-tap. */
async function tap(page: Page, point: Finger): Promise<void> {
  await page.touchscreen.tap(point.x, point.y);
  await page.waitForTimeout(400);
}

type Snapshot = { slot: string | null; transforms: string };

async function state(page: Page): Promise<Snapshot> {
  return page.evaluate(() => {
    const handle = (globalThis as unknown as {
      __motionStudio: { editor: { getState: () => { selectedSlot: string | null; project: { scenes: { inputs: { slotTransforms: unknown } }[] } } } };
    }).__motionStudio;
    const s = handle.editor.getState();
    return { slot: s.selectedSlot, transforms: JSON.stringify(s.project.scenes[0]?.inputs.slotTransforms ?? {}) };
  });
}

test.describe('the phone layout', () => {
  test('one-row top bar, nothing off the edge, and the frame shape behind one button', async ({ page }) => {
    await open(page, LIFESTYLE);
    const bar = await page.locator('header').first().boundingBox();
    expect(bar?.height ?? 0, 'one row').toBeLessThanOrEqual(60);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, 'no horizontal scroll').toBeLessThanOrEqual(1);
    await expect(page.getByRole('button', { name: 'Export' })).toBeInViewport();

    await page.locator('[data-phone-aspect]').tap();
    const sheet = page.getByRole('dialog', { name: 'Frame shape' });
    await expect(sheet).toBeVisible();
    await sheet.getByRole('button', { name: /^16:9/ }).tap();
    await expect(sheet).toHaveCount(0);
    await expect(page.locator('[data-phone-aspect]')).toContainText('16:9');
    const canvas = await page.locator('canvas').boundingBox();
    expect((canvas?.width ?? 0) / (canvas?.height ?? 1)).toBeCloseTo(16 / 9, 1);
  });

  test('"Choose a design": designs play by themselves, and a tap previews before it changes anything', async ({ page }) => {
    test.skip(process.env['PW_PROD'] === '1', 'Reads the dev-only editor handle, which the production build rightly omits.');
    await open(page, LIFESTYLE);
    const before = await page.evaluate(() =>
      (globalThis as unknown as { __motionStudio: { editor: { getState: () => { project: { scenes: { templateId: string }[] } } } } })
        .__motionStudio.editor.getState().project.scenes[0]?.templateId);

    await page.locator('[data-start-actions]').getByRole('button', { name: 'Choose a design' }).tap();
    const sheet = page.getByRole('dialog', { name: 'Choose a design' });
    await expect(sheet).toBeVisible();

    // Point 4: no hover on a phone, so the cards on screen play on their own.
    await expect.poll(() => page.evaluate(() =>
      [...document.querySelectorAll<HTMLVideoElement>('[data-autoplay-preview]')].filter((v) => !v.paused).length,
    )).toBeGreaterThan(0);

    const card = sheet.locator('[data-design-card][aria-pressed="false"]').first();
    await card.tap();
    const preview = page.getByRole('dialog', { name: /^Preview of / });
    await expect(preview).toBeVisible();
    await preview.getByRole('button', { name: 'Use this design' }).tap();
    await expect(sheet).toHaveCount(0);
    await expect.poll(() => page.evaluate(() =>
      (globalThis as unknown as { __motionStudio: { editor: { getState: () => { project: { scenes: { templateId: string }[] } } } } })
        .__motionStudio.editor.getState().project.scenes[0]?.templateId)).not.toBe(before);
  });

  test('the toolbar becomes the selection\'s tools, and Done puts it down', async ({ page }) => {
    test.skip(process.env['PW_PROD'] === '1', 'Reads the dev-only editor handle, which the production build rightly omits.');
    await open(page, LIFESTYLE);
    await expect(page.locator('[data-phone-toolbar="main"]')).toBeVisible();
    await tap(page, await at(page, PHOTO.x, PHOTO.y));
    const tools = page.locator('[data-phone-toolbar="selection"]');
    await expect(tools).toBeVisible();
    for (const name of ['Replace', 'Crop', 'Effects', 'Motion', 'Delete', 'Done']) {
      await expect(tools.getByRole('button', { name, exact: true })).toBeVisible();
    }
    // No floating toolbar over the picture on a phone: the bottom bar is it.
    await expect(page.locator('[data-selection-toolbar]')).toHaveCount(0);
    await tools.getByRole('button', { name: 'Done' }).tap();
    await expect(page.locator('[data-phone-toolbar="main"]')).toBeVisible();
    expect((await state(page)).slot).toBeNull();
  });

  test('Replace photo: no samples, a clear upload, and a sheet that closes', async ({ page }) => {
    await open(page, LIFESTYLE);
    await tap(page, await at(page, PHOTO.x, PHOTO.y));
    await page.locator('[data-phone-toolbar="selection"]').getByRole('button', { name: 'Replace' }).tap();
    const sheet = page.getByRole('dialog', { name: 'Replace photo' });
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('[data-photo-choice^="sample:"]')).toHaveCount(0);
    await expect(sheet.getByRole('button', { name: /Choose from your phone/ })).toBeVisible();
    const box = await sheet.locator(':scope > div').first().boundingBox();
    expect(box?.height ?? 999, 'not the whole screen').toBeLessThan(844 * 0.7);
    await sheet.getByRole('button', { name: 'Close replace photo' }).tap();
    await expect(sheet).toHaveCount(0);
  });
});

test.describe('fingers on the canvas', () => {
  test.skip(process.env['PW_PROD'] === '1', 'Reads the dev-only editor handle, which the production build rightly omits.');

  test('a drag on something not selected moves nothing; select first, then it moves', async ({ page }) => {
    await open(page, LIFESTYLE);
    const cdp = await fingers(page);
    const photo = await at(page, PHOTO.x, PHOTO.y);
    const start = await state(page);

    await touchDrag(cdp, photo, { x: photo.x + 60, y: photo.y + 40 });
    await page.waitForTimeout(400);
    const untouched = await state(page);
    expect(untouched.transforms, 'an unselected element does not move').toBe(start.transforms);
    expect(untouched.slot, 'and a drag is not a tap: nothing selected').toBeNull();

    await tap(page, photo);
    expect((await state(page)).slot).toMatch(/^photo:/);
    await touchDrag(cdp, photo, { x: photo.x + 60, y: photo.y + 40 });
    expect((await state(page)).transforms, 'the selected element moves').not.toBe(start.transforms);
  });

  test('a tap elsewhere puts the selection down — even on another element', async ({ page }) => {
    await open(page, LIFESTYLE);
    await tap(page, await at(page, PHOTO.x, PHOTO.y));
    expect((await state(page)).slot).toMatch(/^photo:/);
    await tap(page, await at(page, EMPTY.x, EMPTY.y));
    expect((await state(page)).slot).toBeNull();

    await tap(page, await at(page, PHOTO.x, PHOTO.y));
    // The headline is another element: the first tap only deselects.
    await tap(page, await at(page, 0.5, 0.08));
    expect((await state(page)).slot).toBeNull();
  });

  test('tap a selected element again for its menu', async ({ page }) => {
    await open(page, LIFESTYLE);
    const photo = await at(page, PHOTO.x, PHOTO.y);
    await tap(page, photo);
    await page.touchscreen.tap(photo.x, photo.y);
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: /^Replace photo/ })).toBeVisible();
  });

  test('pinch zooms the view, not the element, and Fit puts it back', async ({ page }) => {
    await open(page, LIFESTYLE);
    const cdp = await fingers(page);
    const start = await state(page);
    await pinchOut(cdp, await at(page, 0.5, 0.5), 80, 240);
    const fit = page.getByRole('button', { name: 'Fit the picture to the screen' });
    await expect(fit).toBeVisible();
    await expect(fit).not.toHaveText(/^100%/);
    const after = await state(page);
    expect(after.transforms, 'the document is untouched').toBe(start.transforms);
    expect(after.slot, 'and nothing was selected').toBeNull();
    await fit.tap();
    await expect(fit).toHaveCount(0);
  });
});

test.describe('Corporate Ads on a phone', () => {
  test('the timeline is folded, with a one-time note, and opens in full', async ({ page }) => {
    await open(page, AD);
    const strip = page.locator('[data-phone-timeline]');
    await expect(strip).toBeVisible();
    await expect(strip.locator('[data-phone-scene]')).toHaveCount(5);
    const note = strip.getByRole('note');
    await expect(note).toContainText('larger screen');
    await note.getByRole('button', { name: 'Got it' }).tap();
    await expect(note).toHaveCount(0);

    await strip.getByRole('button', { name: 'Open the full timeline' }).tap();
    const sheet = page.getByRole('dialog', { name: 'Timeline' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByTitle('Add a text overlay')).toBeVisible();
    await expect(sheet.getByLabel('Resize panel')).toHaveCount(0);
    await sheet.getByRole('button', { name: 'Close timeline' }).tap();

    // Once is enough.
    await page.reload();
    await page.waitForSelector('[data-phone-timeline]');
    await expect(page.locator('[data-phone-timeline]').getByRole('note')).toHaveCount(0);
  });

  test('tapping a scene selects it and stops there', async ({ page }) => {
    await open(page, AD);
    await page.locator('[data-phone-scene="2"]').tap();
    const tools = page.locator('[data-phone-toolbar="selection"]');
    await expect(tools).toContainText('Scene 3');
    await expect(tools.getByRole('button', { name: 'Design' })).toBeVisible();
  });
});
