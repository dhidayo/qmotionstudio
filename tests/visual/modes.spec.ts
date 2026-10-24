import { expect, test, type Page } from '@playwright/test';

/**
 * Image and Video, named for what each makes (D-155).
 *
 * "For Design, I do not want the animation to keep playing on repeat. Play
 * once and stop is enough." An image plays its design once and rests on its
 * picture moment — the template's own best still — with Replay; a video
 * still loops. And "when I am on video and I am choosing a design, I see it
 * is different from scene … you should have Add a scene, and add your photos
 * to differentiate these" — so Video's row of actions starts Templates ·
 * + Photos, with + Scene in the same row, and Image's Choose a design ·
 * + Photos, each action once (D-162).
 */

const DEV_ONLY = 'Reads the dev-only editor handle, which the production build rightly omits.';
/** A 10s design whose picture moment is 2.4s (D-033's posterAtMs). */
const IMAGE = '/?template=tn-youtube-bold&aspect=16:9';
const VIDEO = '/?template=quick-pitch&aspect=9:16';

test.use({ viewport: { width: 1440, height: 900 } });

type Handle = {
  clock: { timeMs: () => number; playing: () => boolean; seek: (ms: number) => void };
  editor: { getState: () => { project: { scenes: unknown[]; overlays: unknown[] }; setTemplate: (id: string) => void } };
};
const clockTime = (page: Page) => page.evaluate(() => (globalThis as unknown as { __motionStudio: Handle }).__motionStudio.clock.timeMs());
const clockPlaying = (page: Page) => page.evaluate(() => (globalThis as unknown as { __motionStudio: Handle }).__motionStudio.clock.playing());
const seek = (page: Page, ms: number) => page.evaluate((at) => { (globalThis as unknown as { __motionStudio: Handle }).__motionStudio.clock.seek(at); }, ms);

async function open(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.waitForSelector('canvas');
  await page.waitForTimeout(1_500);
}

/** Plays the last second of the image, so it ends without a ten-second wait. */
async function playToTheEnd(page: Page): Promise<void> {
  await seek(page, 9_000);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => clockPlaying(page), { timeout: 10_000 }).toBe(false);
}

test.describe('an image plays once', () => {
  test.skip(process.env['PW_PROD'] === '1', DEV_ONLY);

  test('plays by itself, then rests on its picture moment and offers Replay', async ({ page }) => {
    await open(page, IMAGE);
    expect(await clockPlaying(page), 'it plays by itself when it opens').toBe(true);

    await playToTheEnd(page);
    expect(await clockTime(page)).toBe(2_400);
    const replay = page.getByRole('button', { name: 'Replay', exact: true });
    await expect(replay).toBeVisible();
    // And it stays there: nothing loops.
    await page.waitForTimeout(600);
    expect(await clockTime(page)).toBe(2_400);
    await expect(page.getByText('2.40s / 10.00s')).toBeVisible();

    // Replay is from the start, not from the picture moment.
    await replay.click();
    await expect.poll(() => clockPlaying(page)).toBe(true);
    expect(await clockTime(page)).toBeLessThan(1_500);
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  });

  test('a new design plays again from the start', async ({ page }) => {
    await open(page, IMAGE);
    await playToTheEnd(page);
    await page.evaluate(() => { (globalThis as unknown as { __motionStudio: Handle }).__motionStudio.editor.getState().setTemplate('type-typewriter'); });
    await expect.poll(() => clockPlaying(page), { timeout: 10_000 }).toBe(true);
    expect(await clockTime(page)).toBeLessThan(2_000);
  });

  test('the picture moment is marked on the slider, and goes there when pressed', async ({ page }) => {
    await open(page, IMAGE);
    const mark = page.locator('[data-picture-mark]');
    await expect(mark).toHaveAccessibleName('Go to the picture moment, 2.40s');
    await mark.click();
    expect(await clockPlaying(page)).toBe(false);
    expect(await clockTime(page)).toBe(2_400);
  });

  test('?frozen= stays where it is put, for the visual suite', async ({ page }) => {
    await open(page, `${IMAGE}&frozen=1000`);
    await page.waitForTimeout(1_000);
    expect(await clockPlaying(page)).toBe(false);
    expect(await clockTime(page)).toBe(1_000);
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  });

  test('a short cross-fade softens the cut back to the picture moment, then gets out of the way', async ({ page }) => {
    await open(page, IMAGE);
    const veil = page.locator('[data-rest-fade]');
    await expect(veil).toHaveCSS('visibility', 'hidden');
    // Watched rather than caught: a quarter of a second is too short to poll for on a busy machine.
    await veil.evaluate((el) => {
      new MutationObserver(() => {
        if ((el as HTMLElement).style.visibility === 'visible') el.setAttribute('data-was-shown', '');
      }).observe(el, { attributes: true, attributeFilter: ['style'] });
    });
    await playToTheEnd(page);
    // This design rests at 2.4s, well before its end, so the cut is softened.
    await expect(veil).toHaveAttribute('data-was-shown', '');
    // About a quarter of a second, then hidden again; never in the way of a click.
    await expect(veil).toHaveCSS('visibility', 'hidden', { timeout: 3_000 });
    await expect(veil).toHaveCSS('pointer-events', 'none');
  });
});

/**
 * "Let the animation stop on a specific image so that it can be the basis
 * for export to JPG" (D-163). Paused on a frame, "Use this frame" makes it
 * the picture: the design plays once and rests there, Export → Image saves
 * it, and Reset goes back to the design's own moment. The mark on the slider
 * drags to choose one too.
 */
test.describe('choosing the picture (D-163)', () => {
  test.skip(process.env['PW_PROD'] === '1', DEV_ONLY);

  const chosenAt = (page: Page) => page.evaluate(() =>
    (globalThis as unknown as { __motionStudio: { editor: { getState: () => { project: { pictureAtMs?: number } } } } })
      .__motionStudio.editor.getState().project.pictureAtMs ?? null);

  /** The artboard, or a decoded download, at 32×18: enough to tell one frame of a design from another. */
  const smallFrame = (page: Page) => page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) throw new Error('no artboard');
    const small = document.createElement('canvas');
    small.width = 32;
    small.height = 18;
    const cx = small.getContext('2d');
    cx?.drawImage(canvas, 0, 0, 32, 18);
    return [...(cx?.getImageData(0, 0, 32, 18).data ?? [])];
  });

  test('Use this frame: it rests there, saves there as a JPG, and Reset goes back', async ({ page }) => {
    await page.addInitScript(() => {
      const store = globalThis as unknown as { __downloads?: { buffer: ArrayBuffer; type: string }[] };
      store.__downloads = [];
      HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement) {
        if (!this.download) return;
        void fetch(this.href).then((r) => r.blob()).then(async (blob) => {
          store.__downloads?.push({ buffer: await blob.arrayBuffer(), type: blob.type });
        });
      };
    });
    await open(page, IMAGE);
    const use = page.locator('[data-use-frame]');
    const mark = page.locator('[data-picture-mark]');
    await expect(mark).toHaveAttribute('data-picture-mark', 'design');

    // Offered once paused on another frame, and not on the picture itself.
    await seek(page, 6_000);
    await expect(use).toBeVisible();
    await use.click();
    expect(await chosenAt(page)).toBe(6_000);
    await expect(use).toHaveCount(0);
    await expect(mark).toHaveAttribute('data-picture-mark', 'chosen');
    await expect(mark).toHaveAccessibleName('Go to the picture moment, 6.00s, the frame you chose');

    // Undoable in one step, and back again.
    await page.keyboard.press('Control+z');
    expect(await chosenAt(page)).toBeNull();
    await page.keyboard.press('Control+Shift+z');
    expect(await chosenAt(page)).toBe(6_000);

    // Played once, it rests on the chosen frame.
    await playToTheEnd(page);
    expect(await clockTime(page)).toBe(6_000);
    await expect(page.getByText('6.00s / 10.00s')).toBeVisible();
    const onScreen = await smallFrame(page);

    // Export → Image names it and saves it, as a JPG.
    await page.getByTitle(/^Export \(/).click();
    const dialog = page.getByRole('dialog', { name: 'Export' });
    await expect(dialog.locator('[data-picture-moment="chosen"]')).toContainText('Your chosen frame · 6.00s');
    await dialog.getByRole('radio', { name: /^1920 × 1080/ }).click();
    await dialog.getByRole('group', { name: 'Format' }).getByRole('button', { name: /^JPG/ }).click();
    await dialog.getByRole('button', { name: 'Export image' }).click();
    await expect.poll(() => page.evaluate(() => (globalThis as unknown as { __downloads: unknown[] }).__downloads.length), { timeout: 30_000 }).toBe(1);
    const saved = await page.evaluate(async (screen) => {
      const entry = (globalThis as unknown as { __downloads: { buffer: ArrayBuffer; type: string }[] }).__downloads[0];
      if (!entry) throw new Error('nothing downloaded');
      const bitmap = await createImageBitmap(new Blob([entry.buffer], { type: entry.type }));
      const small = new OffscreenCanvas(32, 18);
      const cx = small.getContext('2d');
      cx?.drawImage(bitmap, 0, 0, 32, 18);
      const px = cx?.getImageData(0, 0, 32, 18).data ?? new Uint8ClampedArray();
      let sum = 0;
      for (let i = 0; i < px.length; i += 4) {
        for (let c = 0; c < 3; c++) sum += Math.abs((px[i + c] ?? 0) - (screen[i + c] ?? 0));
      }
      return { type: entry.type, error: sum / ((px.length / 4) * 3) };
    }, onScreen);
    expect(saved.type).toBe('image/jpeg');
    expect(saved.error, 'the JPG is the chosen frame').toBeLessThan(8);
    await dialog.getByRole('button', { name: 'Close' }).first().click();

    // Reset: the design's own moment again.
    await page.locator('[data-reset-frame]').click();
    expect(await chosenAt(page)).toBeNull();
    await expect(mark).toHaveAttribute('data-picture-mark', 'design');
    await expect(mark).toHaveAccessibleName('Go to the picture moment, 2.40s');
    await expect(page.locator('[data-reset-frame]')).toHaveCount(0);
  });

  test('the mark on the slider drags to a new moment, showing each frame on the way', async ({ page }) => {
    await open(page, IMAGE);
    const mark = page.locator('[data-picture-mark]');
    const lane = page.locator('[data-lane]').first();
    const box = await lane.boundingBox();
    const from = await mark.boundingBox();
    if (!box || !from) throw new Error('no slider');
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    // Halfway along the track: 5s of the 10s design.
    const half = box.x + 8 + (box.width - 16) / 2;
    await page.mouse.move(half, from.y + from.height / 2, { steps: 6 });
    expect(await clockPlaying(page)).toBe(false);
    expect(Math.abs((await clockTime(page)) - 5_000)).toBeLessThan(150);
    await page.mouse.up();
    const chosen = await chosenAt(page);
    expect(Math.abs((chosen ?? 0) - 5_000)).toBeLessThan(150);
    await expect(mark).toHaveAttribute('data-picture-mark', 'chosen');
    // The drop chose; it did not jump back to the old moment.
    expect(Math.abs((await clockTime(page)) - (chosen ?? 0))).toBeLessThan(1);
  });
});

test.describe('a video still loops', () => {
  test.skip(process.env['PW_PROD'] === '1', DEV_ONLY);

  test('past its end and on from the start', async ({ page }) => {
    await open(page, VIDEO);
    // Parked on the very end: seek clamps to the length.
    await seek(page, 10_000_000);
    const end = await clockTime(page);
    expect(end).toBeGreaterThan(5_000);
    await seek(page, end - 300);
    await page.getByRole('button', { name: 'Play', exact: true }).first().click();
    await expect.poll(async () => (await clockTime(page)) < 2_000, { timeout: 10_000 }).toBe(true);
    expect(await clockPlaying(page)).toBe(true);
    await expect(page.getByRole('button', { name: 'Replay' })).toHaveCount(0);
  });
});

test.describe('the row of actions says what each mode makes (D-162)', () => {
  test('an image: Choose a design · + Photos … Make a video', async ({ page }) => {
    await open(page, IMAGE);
    const bar = page.locator('[data-add-bar]');
    await expect(bar.locator('[data-choose-design]')).toHaveAttribute('data-choose-design', 'showcase');
    const labels = await bar.getByRole('button').evaluateAll((all) => all.map((b) => b.textContent.trim()));
    expect(labels.slice(0, 2)).toEqual(['Choose a design', '+ Photos']);
    expect(labels[labels.length - 1]).toBe('Make a video');
    // An image is one scene: no + Scene.
    await expect(bar.locator('[data-add="scene"]')).toHaveCount(0);
  });

  test('a video: Templates · + Photos … + Scene', async ({ page }) => {
    await open(page, VIDEO);
    const bar = page.locator('[data-add-bar]');
    await expect(bar.locator('[data-choose-design]')).toHaveAttribute('data-choose-design', 'motionAd');
    const labels = await bar.getByRole('button').evaluateAll((all) => all.map((b) => b.textContent.trim()));
    expect(labels.slice(0, 2)).toEqual(['Templates', '+ Photos']);
    expect(labels).toContain('+ Scene');
    expect(labels).not.toContain('Make a video');

    // + Scene opens the scene picker, with a new scene or one of your images.
    await bar.locator('[data-add="scene"]').click();
    const picker = page.getByRole('dialog', { name: 'Add a scene' });
    await expect(picker).toBeVisible();
    await expect(picker.getByRole('tab')).toHaveText(['New scene', 'Your images']);
    await picker.getByRole('button', { name: 'Cancel' }).click();
    await expect(picker).toHaveCount(0);

    // Templates opens the library under its full name.
    await bar.getByRole('button', { name: 'Templates' }).click();
    await expect(page.getByRole('dialog', { name: 'Choose a video template' })).toBeVisible();
  });
});

test.describe('switching modes', () => {
  test.skip(process.env['PW_PROD'] === '1', DEV_ONLY);

  test('to Image keeps the selected scene and the layers over it, says so, and undoes in one step', async ({ page }) => {
    await open(page, `${VIDEO}&frozen=1000`);
    await page.getByTitle('Add a text overlay').click();
    const modes = page.getByRole('group', { name: 'Mode' });
    await modes.getByRole('button', { name: 'Image', exact: true }).click();
    await expect(page.locator('[data-toast]')).toContainText('Image keeps scene 1 and the layers over it');
    const counts = () => page.evaluate(() => {
      const { project } = (globalThis as unknown as { __motionStudio: Handle }).__motionStudio.editor.getState();
      return [project.scenes.length, project.overlays.length];
    });
    expect(await counts()).toEqual([1, 1]);
    await expect(modes.getByRole('button', { name: 'Image', exact: true })).toHaveAttribute('aria-pressed', 'true');

    await page.keyboard.press('Control+z');
    await expect.poll(counts).toEqual([5, 1]);
  });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 760 }, hasTouch: true, isMobile: true });

  test('a video’s toolbar holds each action once, in one row, its icons above the words (D-162)', async ({ page }) => {
    await open(page, VIDEO);
    await expect(page.locator('[data-start-actions]')).toHaveCount(0);
    const buttons = page.locator('[data-phone-toolbar="main"]').getByRole('button');
    const boxes = await buttons.evaluateAll((els) => els.map((el) => {
      const r = el.getBoundingClientRect();
      const icon = el.querySelector('svg')?.getBoundingClientRect();
      const iconMiddle = icon ? (icon.top + icon.bottom) / 2 : Number.NaN;
      return { left: r.left, right: r.right, top: r.top, iconAbove: iconMiddle < (r.top + r.bottom) / 2, text: el.textContent.trim() };
    }));
    expect(boxes.map((b) => b.text)).toEqual(['Templates', 'Add', 'Photos', 'Text', 'Effects', 'Style']);
    for (const box of boxes) {
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(375);
      expect(box.iconAbove, `${box.text}: the icon above the words`).toBe(true);
    }
    expect(new Set(boxes.map((b) => Math.round(b.top))).size).toBe(1);
    // Add starts with + Scene; photos are the Photos tool's.
    await buttons.filter({ hasText: /^Add$/ }).tap();
    const ids = await page.getByRole('group', { name: 'Add' }).locator('[data-add]').evaluateAll((all) => all.map((tile) => tile.getAttribute('data-add')));
    expect(ids[0]).toBe('scene');
    expect(ids).not.toContain('photos');
  });

  test('an image offers + Video beside the transport, and Replay once it has played', async ({ page }) => {
    test.skip(process.env['PW_PROD'] === '1', DEV_ONLY);
    await open(page, IMAGE);
    await expect(page.locator('[data-continue-video]')).toHaveText('+ Video');
    await seek(page, 9_000);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Replay', exact: true })).toBeVisible({ timeout: 10_000 });
    expect(await clockTime(page)).toBe(2_400);
  });
});
