import { expect, test, type Page } from '@playwright/test';

/**
 * D-167 — Elements: one list of everything in the design, or in the selected
 * scene, to pick and change.
 *
 * "On Video mode, when I add a new scene and I select the scene, I should
 * have one of the menus saying customize design and I should be able to
 * select what to customize such as images, texts, etc. … I would prefer a way
 * to see all design elements and select them to update as I like."
 */

const DEV_ONLY = 'Reads the dev-only editor handle, which the production build rightly omits.';
const IMAGE = '/?template=tn-youtube-bold&aspect=16:9&frozen=2500';
const VIDEO = '/?template=quick-pitch&aspect=9:16&frozen=2000';

type State = {
  playheadMs: number;
  selectedScene: number;
  selectedSlot: string | null;
  selectedOverlay: string | null;
  setTheme: (theme: 'light' | 'dark') => void;
  project: { scenes: { durationMs: number }[] };
};
const editor = (page: Page): Promise<{ playheadMs: number; selectedScene: number; slot: string | null; overlay: string | null }> => page.evaluate(() => {
  const s = (globalThis as unknown as { __motionStudio: { editor: { getState: () => State } } }).__motionStudio.editor.getState();
  return { playheadMs: s.playheadMs, selectedScene: s.selectedScene, slot: s.selectedSlot, overlay: s.selectedOverlay };
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

const list = (page: Page) => page.locator('[data-elements-list]');
const row = (page: Page, id: string) => list(page).locator(`[data-element-row="${id}"]`);

test.describe('on a computer', () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  test('Elements is the inspector’s first tab, and a row picks what a tap on the picture would', async ({ page }) => {
    await open(page, IMAGE);
    const tabs = page.getByRole('tablist').getByRole('tab');
    await expect(tabs).toHaveText(['Elements', 'Photos', 'Text', 'Effects', 'Style']);
    await page.getByRole('tab', { name: 'Elements' }).click();

    // Grouped under real headings, each row named with its kind and state.
    await expect(list(page).getByRole('heading')).toHaveText(['Photos', 'Words', 'Shapes and parts']);
    await expect(row(page, 'photo:0')).toHaveAccessibleName('Photo 1, sample');
    await expect(row(page, 'shape:mark')).toHaveAccessibleName(/^Brand mark: \w, shape$/);

    // A photo: selected, and Photos opens.
    await row(page, 'photo:0').click();
    await expect(page.locator('[data-selection-box="photo:0"]')).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Photos' })).toHaveAttribute('aria-selected', 'true');

    // A word: Text opens.
    await page.getByRole('tab', { name: 'Elements' }).click();
    await expect(row(page, 'photo:0')).toHaveAttribute('aria-current', 'true');
    await row(page, 'text:headline').click();
    await expect(page.locator('[data-selection-box="text:headline"]')).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Text' })).toHaveAttribute('aria-selected', 'true');

    // A part: its settings in Style.
    await page.getByRole('tab', { name: 'Elements' }).click();
    await row(page, 'shape:mark').click();
    await expect(page.locator('[data-selection-box="shape:mark"]')).toBeVisible();
    await expect(page.locator('[data-part-settings="shape:mark"]')).toBeVisible();

    // Something added on top: its own inspector.
    await page.keyboard.press('Escape');
    await page.locator('[data-add-bar] [data-add="element"]').first().click();
    await page.getByRole('dialog', { name: 'Add an element' }).locator('[data-element-tile="sticker:check"]').click();
    await page.keyboard.press('Escape');
    await page.getByRole('tab', { name: 'Elements' }).click();
    const added = list(page).locator('[data-element-row^="overlay:"]').first();
    await expect(added).toHaveAccessibleName('Sticker: Check tick, added on top');
    await added.click();
    await expect(page.getByRole('complementary', { name: 'Overlay inspector' })).toBeVisible();
    await expect(page.locator('[data-selection-box]')).toHaveCount(1);
  });

  test('one stop on Tab, then the arrow keys, Home and End, and Enter to choose', async ({ page }) => {
    test.skip(process.env['PW_PROD'] === '1', DEV_ONLY);
    await open(page, IMAGE);
    await page.getByRole('tab', { name: 'Elements' }).click();
    const rows = list(page).locator('[data-element-row]');
    // A roving tab index: only one row is a Tab stop.
    await expect(list(page).locator('[data-element-row][tabindex="0"]')).toHaveCount(1);
    await rows.first().focus();
    await page.keyboard.press('ArrowDown');
    await expect(rows.nth(1)).toBeFocused();
    await page.keyboard.press('End');
    await expect(rows.last()).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(rows.nth(-2)).toBeFocused();
    await page.keyboard.press('Home');
    await expect(rows.first()).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    expect((await editor(page)).slot).toBe('text:headline');
    // Focus goes on to the settings that opened, not to the page.
    await expect(page.getByRole('tab', { name: 'Text' })).toBeFocused();

    // Selected on the picture, the list follows.
    await page.keyboard.press('Escape');
    await page.getByRole('tab', { name: 'Elements' }).click();
    await expect(list(page).locator('[aria-current="true"]')).toHaveCount(0);
  });

  test('a deleted part stays in the list, dimmed, and choosing it puts it back', async ({ page }) => {
    await open(page, IMAGE);
    await page.getByRole('tab', { name: 'Elements' }).click();
    await row(page, 'shape:mark').click();
    await page.locator('[data-selection-box="shape:mark"]').focus();
    await page.keyboard.press('Delete');
    await expect(page.locator('[data-selection-box="shape:mark"]')).toHaveCount(0);

    await page.getByRole('tab', { name: 'Elements' }).click();
    const mark = row(page, 'shape:mark');
    await expect(mark).toHaveAttribute('data-element-state', 'deleted');
    await expect(mark).toHaveAccessibleName(/^Brand mark: \w, shape, deleted — put back$/);
    await expect(mark).toContainText('Put back');
    await mark.click();
    await expect(page.locator('[data-selection-box="shape:mark"]')).toBeVisible();
    await page.getByRole('tab', { name: 'Elements' }).click();
    await expect(row(page, 'shape:mark')).not.toHaveAttribute('data-element-state', 'deleted');
    await expect(row(page, 'shape:mark')).toHaveAttribute('aria-current', 'true');
    await shot(page, 'elements-desktop-image');
  });

  test('in a video, the list is the selected scene’s', async ({ page }) => {
    test.skip(process.env['PW_PROD'] === '1', DEV_ONLY);
    await open(page, VIDEO);
    await page.evaluate(() => {
      (globalThis as unknown as { __motionStudio: { editor: { getState: () => { selectScene: (i: number) => void; setTheme: (t: string) => void } } } })
        .__motionStudio.editor.getState().selectScene(1);
    });
    await page.getByRole('tab', { name: 'Elements' }).click();
    await expect(list(page)).toContainText('Everything in scene 2.');
    // The picture goes to scene 2, so the list can name its parts.
    await expect.poll(async () => {
      const s = await editor(page);
      return s.playheadMs >= 4_000;
    }).toBe(true);
    const word = list(page).locator('[data-element-row^="text:"]').first();
    const key = await word.getAttribute('data-element-row');
    await word.click();
    const after = await editor(page);
    expect(after.selectedScene).toBe(1);
    expect(after.slot).toBe(key);
    await expect(page.locator(`[data-selection-box="${key}"]`)).toBeVisible();
    await page.getByRole('tab', { name: 'Elements' }).click();
    await page.evaluate(() => {
      (globalThis as unknown as { __motionStudio: { editor: { getState: () => { setTheme: (t: string) => void } } } })
        .__motionStudio.editor.getState().setTheme('dark');
    });
    await page.waitForTimeout(300);
    await shot(page, 'elements-desktop-video-dark');
  });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('an image’s Elements is beside play; a pick closes the list and shows the element’s tools', async ({ page }) => {
    await open(page, IMAGE);
    // The toolbar keeps its six tools (D-162).
    await expect(page.locator('[data-phone-toolbar="main"] button')).toHaveCount(6);
    await page.locator('[data-phone-elements]').tap();
    const sheet = page.getByRole('dialog', { name: 'Elements' });
    await expect(sheet).toBeVisible();
    // Rows big enough for a finger.
    const box = await row(page, 'photo:0').boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

    await row(page, 'text:headline').tap();
    await expect(sheet).toHaveCount(0);
    await expect(page.locator('[data-phone-toolbar="selection"]')).toBeVisible();
    await expect(page.locator('[data-selection-box="text:headline"]')).toBeVisible();

    // Opened again, the chosen one is marked; a part picks as well.
    await page.locator('[data-phone-toolbar="selection"]').getByRole('button', { name: 'Done' }).tap();
    await page.locator('[data-phone-elements]').tap();
    await row(page, 'shape:mark').tap();
    await expect(page.locator('[data-selection-box="shape:mark"]')).toBeVisible();
  });

  test('the list marks what is selected', async ({ page }) => {
    await open(page, IMAGE);
    await page.locator('[data-phone-elements]').tap();
    await row(page, 'shape:mark').tap();
    await expect(page.locator('[data-selection-box="shape:mark"]')).toBeVisible();
    // Elements stays beside play while an element's tools are up, and the list marks the one in hand.
    await page.locator('[data-phone-elements]').tap();
    await expect(row(page, 'shape:mark')).toHaveAttribute('aria-current', 'true');
    await shot(page, 'elements-phone-image');
    await page.getByRole('dialog', { name: 'Elements' }).getByRole('button', { name: /^Close/ }).tap();
    await page.locator('[data-phone-toolbar="selection"]').getByRole('button', { name: 'Done' }).tap();
    await page.locator('[data-phone-elements]').tap();
    await expect(list(page).locator('[aria-current="true"]')).toHaveCount(0);
  });

  test('a video scene’s row starts with Elements, and its list is that scene’s', async ({ page }) => {
    test.skip(process.env['PW_PROD'] === '1', DEV_ONLY);
    test.slow();
    await open(page, VIDEO);
    await page.locator('[data-phone-scene="1"]').tap();
    const sceneRow = page.locator('[data-phone-scene-row="1"]');
    await expect(sceneRow).toBeVisible();
    await expect(sceneRow.locator('[data-scene-action]').first()).toHaveText('Elements');
    await shot(page, 'elements-phone-scene-row');
    await sceneRow.locator('[data-scene-action="elements"]').tap();
    const sheet = page.getByRole('dialog', { name: 'Elements · Scene 2' });
    await expect(sheet).toBeVisible();
    await expect(list(page)).toContainText('Everything in scene 2.');
    await shot(page, 'elements-phone-video-scene2');

    const word = list(page).locator('[data-element-row^="text:"]').first();
    const key = await word.getAttribute('data-element-row');
    await word.tap();
    await expect(sheet).toHaveCount(0);
    const after = await editor(page);
    expect(after.selectedScene).toBe(1);
    expect(after.slot).toBe(key);
    await expect(page.locator(`[data-selection-box="${key}"]`)).toBeVisible();

    // For review: the list again with the word in hand, in dark.
    if (process.env['PW_SHOTS'] !== undefined) {
      await page.evaluate(() => {
        const handle = (globalThis as unknown as { __motionStudio: { editor: { getState: () => { setTheme: (t: string) => void } }; overlays: { getState: () => { openPhonePanel: (p: string) => void } } } }).__motionStudio;
        handle.editor.getState().setTheme('dark');
        handle.overlays.getState().openPhonePanel('elements');
      });
      await expect(row(page, key ?? '')).toHaveAttribute('aria-current', 'true');
      await shot(page, 'elements-phone-video-scene2-dark');
    }
  });
});
