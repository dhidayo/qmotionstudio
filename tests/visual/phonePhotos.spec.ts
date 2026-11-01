import { expect, test, type Page } from '@playwright/test';

/**
 * D-165 — photos on a phone: the library upload, moving photos between spots,
 * the photos waiting under Photo spots, and switching to Video.
 *
 * "On mobile, when I click on Photos to upload photos to replace the sample
 * pictures, upload from library doesn't upload nor replace the sample photos.
 * Again, the pictures cannot be moved around or rearranged."
 */

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const DEV_ONLY = 'Reads the dev-only editor handle, which the production build rightly omits.';
const LIFESTYLE = '/?template=pop-float&aspect=1:1&frozen=3000';

async function open(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.waitForSelector('canvas');
  await page.waitForTimeout(1_500);
}

/** A picture of the moment for review, only when PW_SHOTS names a folder to keep it in. */
async function shot(page: Page, name: string): Promise<void> {
  const folder = process.env['PW_SHOTS'];
  if (folder !== undefined) await page.screenshot({ path: `${folder}/${name}.png` });
}

type Upload = { name: string; mimeType: string; buffer: Buffer };

/** A JPEG, as an iPhone hands one over for `accept="image/*"`. */
async function jpeg(page: Page, colour: string, name = `IMG_${colour.slice(1)}.jpg`): Promise<Upload> {
  const base64 = await page.evaluate((fill) => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const cx = canvas.getContext('2d');
    if (!cx) throw new Error('no context');
    cx.fillStyle = fill;
    cx.fillRect(0, 0, 640, 480);
    return canvas.toDataURL('image/jpeg', 0.9).split(',')[1] ?? '';
  }, colour);
  return { name, mimeType: 'image/jpeg', buffer: Buffer.from(base64, 'base64') };
}

const shown = (page: Page): Promise<string[]> => page.evaluate(() =>
  (globalThis as unknown as { __motionStudio: { editor: { getState: () => { project: { scenes: { inputs: { photos: { mediaId: string }[] } }[] } } } } })
    .__motionStudio.editor.getState().project.scenes[0]?.inputs.photos.map((p) => p.mediaId) ?? []);

/** The order photos were read in: each upload's id ends in a running count. */
const readOrder = (id: string): number => Number(id.split(':').at(-1));

async function openPhotos(page: Page): Promise<void> {
  await page.locator('[data-phone-toolbar="main"]').getByRole('button', { name: 'Photos', exact: true }).click();
  await expect(page.locator('[data-design-photos]')).toBeVisible();
}

test.describe('the library upload (D-165)', () => {
  test('every photo picker asks for image/*, so an iPhone hands over JPEGs', async ({ page }) => {
    await open(page, LIFESTYLE);
    const accepts = await page.locator('input[type="file"]').evaluateAll((inputs) =>
      inputs.filter((i) => (i as HTMLInputElement).accept.includes('image')).map((i) => (i as HTMLInputElement).accept));
    expect(accepts.length).toBeGreaterThan(0);
    expect(new Set(accepts)).toEqual(new Set(['image/*']));
  });

  test('+ Add photos through the file chooser replaces the samples, in order', async ({ page }) => {
    test.skip(process.env['PW_PROD'] === '1', DEV_ONLY);
    await open(page, LIFESTYLE);
    await openPhotos(page);
    const chooser = page.waitForEvent('filechooser');
    await page.locator('[data-add-photo]').click();
    await (await chooser).setFiles([
      await jpeg(page, '#ff2d55'), await jpeg(page, '#2dd4ff'), await jpeg(page, '#22c55e'),
    ]);

    await expect(page.locator('[data-toast]')).toContainText('Your 3 photos replaced 3 samples.');
    const ids = await shown(page);
    const own = ids.slice(0, 3);
    expect(own.every((id) => id.startsWith('upload:')), 'the first three spots are yours').toBe(true);
    expect(own.map(readOrder), 'in the order chosen').toEqual([...own.map(readOrder)].sort((a, b) => a - b));
    expect(ids.slice(3).every((id) => id.startsWith('sample:')), 'samples in the rest').toBe(true);
  });

  test('a photo that cannot be read says so in a toast, even once the panel has closed', async ({ page }) => {
    test.skip(process.env['PW_PROD'] === '1', DEV_ONLY);
    await open(page, LIFESTYLE);
    await openPhotos(page);
    const chooser = page.waitForEvent('filechooser');
    await page.locator('[data-add-photo]').click();
    const picked = await chooser;
    // The sheet closes while the library is open: the input lives on (D-165).
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-design-photos]')).toHaveCount(0);
    await picked.setFiles([
      await jpeg(page, '#ff2d55'),
      { name: 'IMG_0042.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('not a picture at all') },
    ]);

    await expect(page.locator('[data-toast]')).toContainText('1 photo added; 1 could not be read.');
    await expect(page.locator('[data-toast]')).toContainText('IMG_0042.jpg');
    await expect.poll(async () => (await shown(page))[0]).toMatch(/^upload:/);
  });
});

type Finger = { x: number; y: number };

async function centre(page: Page, index: number): Promise<Finger> {
  const box = await page.locator(`[data-design-photos] [data-spot="${index}"]`).boundingBox();
  if (box === null) throw new Error(`no spot ${index}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Three of yours in the first three spots, through the Photos panel. */
async function threePhotos(page: Page): Promise<string[]> {
  await page.getByLabel('Add your photos').setInputFiles([
    await jpeg(page, '#ff2d55'), await jpeg(page, '#2dd4ff'), await jpeg(page, '#22c55e'),
  ]);
  await expect.poll(async () => (await shown(page)).filter((id) => id.startsWith('upload:')).length).toBe(3);
  await expect(page.locator('[data-toast]')).toContainText('Your 3 photos replaced 3 samples.');
  return shown(page);
}

const selectedPhoto = (page: Page): Promise<number | null> => page.evaluate(() =>
  (globalThis as unknown as { __motionStudio: { editor: { getState: () => { selectedPhoto: number | null } } } })
    .__motionStudio.editor.getState().selectedPhoto);

const undo = (page: Page): Promise<void> => page.evaluate(() => {
  (globalThis as unknown as { __motionStudio: { editor: { getState: () => { undo: () => void } } } }).__motionStudio.editor.getState().undo();
});

test.describe('moving photos between spots (D-165)', () => {
  test('a finger holds a photo, then drags it to another spot; undo puts it back', async ({ page }) => {
    test.skip(process.env['PW_PROD'] === '1', DEV_ONLY);
    await open(page, LIFESTYLE);
    await openPhotos(page);
    const before = await threePhotos(page);
    const from = await centre(page, 0);
    const to = await centre(page, 2);

    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
    await page.waitForTimeout(500);
    // Lifted in place after the hold, before it has moved.
    await expect(page.locator('[data-spot-lifted]')).toHaveCount(1);
    for (let i = 1; i <= 8; i++) {
      const t = i / 8;
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }],
      });
    }
    await expect(page.locator('[data-spot="2"][data-spot-target]')).toHaveCount(1);
    await shot(page, 'd165-phone-drag');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

    await expect(page.locator('[data-spot-lifted]')).toHaveCount(0);
    await expect(page.locator('[data-toast]')).toContainText('Photo moved to spot 3.');
    expect(await shown(page)).toEqual([before[1], before[2], before[0], ...before.slice(3)]);
    expect(await selectedPhoto(page)).toBe(2);

    // One undo step brings the order back.
    await undo(page);
    expect(await shown(page)).toEqual(before);
  });

  test('a quick swipe across the photos scrolls, and moves nothing', async ({ page }) => {
    test.skip(process.env['PW_PROD'] === '1', DEV_ONLY);
    await open(page, LIFESTYLE);
    await openPhotos(page);
    const before = await threePhotos(page);
    const from = await centre(page, 0);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
    for (let i = 1; i <= 8; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + i * 12, y: from.y - i * 6 }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(500);
    await expect(page.locator('[data-spot-lifted]')).toHaveCount(0);
    expect(await shown(page)).toEqual(before);
  });

  test('Move earlier and Move later move the chosen photo one spot, and stop at the ends', async ({ page }) => {
    test.skip(process.env['PW_PROD'] === '1', DEV_ONLY);
    await open(page, LIFESTYLE);
    await openPhotos(page);
    const before = await threePhotos(page);
    await page.locator('[data-design-photos] [data-spot="0"] [data-media-id]').click();
    const earlier = page.getByRole('button', { name: '← Move earlier' });
    const later = page.getByRole('button', { name: 'Move later →' });
    await expect(earlier).toBeDisabled();
    await page.locator('[data-spot-move]').scrollIntoViewIfNeeded();
    await shot(page, 'd165-phone-move-buttons');

    await later.click();
    await expect(page.locator('[data-toast]')).toContainText('Photo moved to spot 2.');
    expect(await shown(page)).toEqual([before[1], before[0], ...before.slice(2)]);
    expect(await selectedPhoto(page)).toBe(1);
    await earlier.click();
    expect(await shown(page)).toEqual(before);

    // The last spot cannot go later.
    await page.locator(`[data-design-photos] [data-spot="${before.length - 1}"] [data-media-id]`).click();
    await expect(later).toBeDisabled();
    await expect(earlier).toBeEnabled();
  });
});

test.describe('photos not in the design (D-165)', () => {
  test('wait under Photo spots, in view, with no section to open', async ({ page }) => {
    test.skip(process.env['PW_PROD'] === '1', DEV_ONLY);
    await open(page, LIFESTYLE);
    await openPhotos(page);
    await threePhotos(page);
    await expect(page.locator('[data-your-photos]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Take your photo out of spot 3' }).click();
    await expect(page.locator('[data-toast]')).toContainText('Your photo is still in this project, under Photo spots.');

    const waiting = page.locator('[data-design-photos] [data-your-photos]');
    await expect(waiting).toBeVisible();
    await expect(waiting).toContainText('Not in this design — tap one to use it.');
    await expect(page.locator('[data-section="Your photos"]')).toHaveCount(0);
    // Directly under the Photo spots stepper.
    const stepper = await page.getByRole('button', { name: 'Increase Photo spots' }).boundingBox();
    const list = await waiting.boundingBox();
    expect(stepper !== null && list !== null && list.y > stepper.y && list.y - (stepper.y + stepper.height) < 40).toBe(true);
    await waiting.scrollIntoViewIfNeeded();
    await shot(page, 'd165-phone-waiting');

    await waiting.getByRole('button', { name: 'Use this photo in the design' }).click();
    await expect(page.locator('[data-your-photos]')).toHaveCount(0);
  });

  test('on a design with no photo spots, wait under + Add extra photos', async ({ page }) => {
    test.skip(process.env['PW_PROD'] === '1', DEV_ONLY);
    await open(page, '/?template=type-typewriter&frozen=3000');
    await page.locator('[data-phone-toolbar="main"]').getByRole('button', { name: 'Photos', exact: true }).click();
    await expect(page.locator('[data-add-photo-layer]')).toBeVisible();
    await page.getByLabel('Add a photo on top of the design').setInputFiles(await jpeg(page, '#ff2d55'));
    await expect(page.locator('[data-toast]')).toContainText('Photo added on top.');
    // With no spots to fill, every photo of the project waits here, to go on top again.
    const waiting = page.locator('[data-section="Extra photos"] [data-your-photos]');
    await expect(waiting).toContainText('Your photos — tap one to place it on top of the design.');
  });
});

test.describe('switching to Video (D-165)', () => {
  test('+ Video mode opens no picker; a tip points at Add, once per device', async ({ page }) => {
    await open(page, LIFESTYLE);
    const button = page.locator('[data-continue-video]');
    await expect(button).toHaveText('+ Video mode');
    await expect(button).toHaveAttribute('aria-label', 'Switch to Video mode: this image becomes scene 1');
    await shot(page, 'd165-phone-video-mode');
    await button.click();

    await expect(page.getByRole('dialog', { name: 'Add a scene' })).toHaveCount(0);
    const tip = page.locator('[data-scene-tip]');
    await expect(tip).toHaveText('Your design is scene 1. Tap Add, then + Scene, to add more scenes.');
    // Just above the toolbar's Add, which it names.
    const add = await page.locator('[data-phone-toolbar="main"] [data-phone-tool="add"]').boundingBox();
    const box = await tip.boundingBox();
    expect(add !== null && box !== null && box.y + box.height <= add.y && add.y - (box.y + box.height) < 24).toBe(true);
    await shot(page, 'd165-phone-video-tip');
    await tip.getByRole('button', { name: 'Close tip' }).click();
    await expect(tip).toHaveCount(0);

    // Not again on this device, even on another switch.
    await page.reload();
    await page.waitForSelector('canvas');
    await page.evaluate(() => {
      (globalThis as unknown as { __motionStudio: { editor: { getState: () => { setMode: (m: string) => void } } } }).__motionStudio.editor.getState().setMode('showcase');
    });
    await page.locator('[data-continue-video]').click();
    await page.waitForTimeout(300);
    await expect(tip).toHaveCount(0);
  });

  test('the tip closes itself after ten seconds', async ({ page }) => {
    await page.clock.install();
    await open(page, LIFESTYLE);
    await page.locator('[data-continue-video]').click();
    await expect(page.locator('[data-scene-tip]')).toBeVisible();
    await page.clock.runFor(10_500);
    await expect(page.locator('[data-scene-tip]')).toHaveCount(0);
  });
});

test.describe('on a computer', () => {
  test.use({ viewport: { width: 1366, height: 768 }, hasTouch: false, isMobile: false });

  test('a mouse drags a photo to another spot straight away', async ({ page }) => {
    test.skip(process.env['PW_PROD'] === '1', DEV_ONLY);
    await open(page, LIFESTYLE);
    const before = await threePhotos(page);
    const from = await centre(page, 2);
    const to = await centre(page, 0);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 10, from.y, { steps: 2 });
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await expect(page.locator('[data-spot="0"][data-spot-target]')).toHaveCount(1);
    await shot(page, 'd165-desktop-drag');
    await page.mouse.up();

    expect(await shown(page)).toEqual([before[2], before[0], before[1], ...before.slice(3)]);
    expect(await selectedPhoto(page)).toBe(0);
    await page.locator('[data-spot-move]').scrollIntoViewIfNeeded();
    await shot(page, 'd165-desktop-move-buttons');

    await page.getByRole('button', { name: 'Take your photo out of spot 2' }).click();
    await expect(page.locator('[data-design-photos] [data-your-photos]')).toBeVisible();
    await shot(page, 'd165-desktop-waiting');
  });

  test('+ Video mode points at + Scene in the bar', async ({ page }) => {
    await open(page, LIFESTYLE);
    await expect(page.locator('[data-continue-video]')).toHaveText('+ Video mode');
    await shot(page, 'd165-desktop-video-mode');
    await page.locator('[data-continue-video]').click();
    await expect(page.getByRole('dialog', { name: 'Add a scene' })).toHaveCount(0);
    const tip = page.locator('[data-scene-tip]');
    await expect(tip).toHaveText('Your design is scene 1. Use + Scene to add more scenes.');
    const scene = page.locator('[data-add-bar] [data-add="scene"]');
    await expect(scene).toBeInViewport();
    const at = await scene.boundingBox();
    const box = await tip.boundingBox();
    expect(at !== null && box !== null && box.y + box.height <= at.y && box.x < at.x + at.width && box.x + box.width > at.x).toBe(true);
    // The clip item is named apart from the mode (D-165).
    await expect(page.locator('[data-add-bar] [data-add="video"]')).toContainText('+ Video clip');
    await shot(page, 'd165-desktop-video-tip');
  });
});
