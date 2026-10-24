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
