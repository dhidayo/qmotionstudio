import { expect, test, type Page } from '@playwright/test';

/**
 * D-166 — scenes on a phone and a computer: the scene's own pictures on the
 * strip and the clips, a tap that goes to the moment tapped, and a new scene
 * that starts on samples with the person's photos one tap away.
 *
 * "While the pictures of the design changed, the timeline still shows the
 * sample pictures and that is not good too." "A new scene added should not
 * inherit the pictures of previous scene, however, when I click on Picture to
 * modify the scene pictures, the uploaded pictures should be available."
 */

const DEV_ONLY = 'Reads the dev-only editor handle, which the production build rightly omits.';
const AD = '/?template=quick-pitch&aspect=9:16&frozen=2000';

type Editor = { getState: () => { playheadMs: number; selectedScene: number; project: { scenes: { inputs: { photos: { mediaId: string }[] } }[] } } };
const editor = (page: Page): Promise<{ playheadMs: number; selectedScene: number; photos: string[][] }> => page.evaluate(() => {
  const s = (globalThis as unknown as { __motionStudio: { editor: Editor } }).__motionStudio.editor.getState();
  return { playheadMs: s.playheadMs, selectedScene: s.selectedScene, photos: s.project.scenes.map((scene) => scene.inputs.photos.map((p) => p.mediaId)) };
});

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

/** A JPEG of one colour, unlike any sample. */
async function jpeg(page: Page, colour: string): Promise<{ name: string; mimeType: string; buffer: Buffer }> {
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
  return { name: `IMG_${colour.slice(1)}.jpg`, mimeType: 'image/jpeg', buffer: Buffer.from(base64, 'base64') };
}

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the strip shows each scene as it is, and a new scene starts on samples with yours waiting', async ({ page }) => {
    test.skip(process.env['PW_PROD'] === '1', DEV_ONLY);
    test.slow();
    await open(page, AD);
    const first = page.locator('[data-phone-scene="0"]');
    // The design's poster only until the scene's own picture is drawn.
    await expect(first).toHaveAttribute('data-still', 'own', { timeout: 15_000 });
    await expect(page.locator('[data-phone-scene][data-still="own"]')).toHaveCount(5, { timeout: 15_000 });
    const before = await first.evaluate((el) => (el as HTMLElement).style.backgroundImage);
    expect(before).toContain('blob:');

    // Scene 1's photos replaced: its picture on the strip follows.
    const main = page.locator('[data-phone-toolbar="main"]');
    await main.getByRole('button', { name: 'Photos', exact: true }).tap();
    const chooser = page.waitForEvent('filechooser');
    await page.locator('[data-add-photo]').click();
    await (await chooser).setFiles([await jpeg(page, '#ff2d55'), await jpeg(page, '#2dd4ff')]);
    await expect(page.locator('[data-toast]')).toContainText('replaced');
    await page.keyboard.press('Escape');
    await expect.poll(() => first.evaluate((el) => (el as HTMLElement).style.backgroundImage), { timeout: 15_000 }).not.toBe(before);
    await expect(first).toHaveAttribute('data-still', 'own');
    // Only scene 1 changed: the others keep their pictures.
    await page.locator('[data-phone-scene="1"]').tap();
    await expect(page.getByRole('toolbar', { name: 'Scene 2 actions' })).toBeVisible();
    await shot(page, 'd166-phone-scene-row');

    // A new scene after scene 2, from Add → + Scene: its spots are samples.
    await main.getByRole('button', { name: 'Add', exact: true }).tap();
    await page.getByRole('group', { name: 'Add' }).locator('[data-add="scene"]').tap();
    const picker = page.getByRole('dialog', { name: 'Add a scene' });
    await expect(picker).toContainText('It starts with sample photos; yours are one tap away in Photos.');
    await picker.getByRole('button', { name: /^Statement/ }).first().tap();
    await expect(page.locator('[data-toast]')).toContainText('with sample photos. Yours are in Photos, one tap each.');
    const state = await editor(page);
    expect(state.selectedScene).toBe(2);
    const added = state.photos[2] ?? [];
    expect(added.length).toBeGreaterThan(0);
    expect(added.every((id) => id.startsWith('sample:')), 'the new scene does not take scene 1’s photos').toBe(true);

    // Photos, for that scene: the person's photos wait under Photo spots, one tap each.
    await main.getByRole('button', { name: 'Photos', exact: true }).tap();
    const sheet = page.getByRole('dialog', { name: 'Photos · Scene 3' });
    await expect(sheet).toBeVisible();
    const waiting = sheet.locator('[data-your-photos]');
    await expect(waiting).toContainText('Not in this');
    await expect(waiting.locator('[data-library-photo]')).toHaveCount(2);
    await shot(page, 'd166-phone-new-scene-waiting');
    await waiting.locator('[data-library-photo] button').first().tap();
    await expect.poll(async () => (await editor(page)).photos[2]?.some((id) => id.startsWith('upload:'))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-phone-scene][data-still="own"]')).toHaveCount(6, { timeout: 15_000 });
    await shot(page, 'd166-phone-strip');
  });
});

test.describe('on a computer', () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  test('each clip shows its scene, and a click goes to the moment clicked (D-166)', async ({ page }) => {
    test.skip(process.env['PW_PROD'] === '1', DEV_ONLY);
    await open(page, AD);
    await expect(page.locator('[data-scene-still="own"]')).toHaveCount(5, { timeout: 15_000 });
    const clip = page.locator('[data-scene-clip="2"]');
    const box = await clip.boundingBox();
    if (!box) throw new Error('no clip');
    await clip.click({ position: { x: box.width * 0.25, y: box.height / 2 } });
    const early = await editor(page);
    await clip.click({ position: { x: box.width * 0.75, y: box.height / 2 } });
    const late = await editor(page);
    expect(early.selectedScene).toBe(2);
    expect(late.selectedScene).toBe(2);
    expect(late.playheadMs - early.playheadMs, 'half a scene further on').toBeGreaterThan(500);
    await shot(page, 'd166-desktop-clips');
  });
});
