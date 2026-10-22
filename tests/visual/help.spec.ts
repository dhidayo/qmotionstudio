import { expect, test, type Page } from '@playwright/test';

/**
 * Help that fits the device (D-161).
 *
 * "The Help ? shows Macbook help, shortcuts, etc. This shouldn't be the case
 * on other devices … maybe hide it if you cannot replace it." Keys are
 * written per platform, and a touch screen with no keyboard gets its
 * gestures instead, with no "?" button pointing at a key it does not have.
 */

/** Makes the browser report a platform; the user agent alone does not change `navigator.platform`. */
async function pretend(page: Page, platform: 'Win32' | 'MacIntel'): Promise<void> {
  await page.addInitScript((value) => {
    Object.defineProperty(Navigator.prototype, 'platform', { get: () => value, configurable: true });
    Object.defineProperty(Navigator.prototype, 'userAgentData', { get: () => undefined, configurable: true });
  }, platform);
}

async function open(page: Page, url = '/?template=pop-float&aspect=1:1&frozen=3000'): Promise<void> {
  await page.goto(url);
  await page.waitForSelector('canvas');
  await page.waitForTimeout(1_000);
}

test.describe('with a keyboard', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('on Windows: Ctrl, Alt and Shift, never ⌘ ⌥ ⇧', async ({ page }) => {
    await pretend(page, 'Win32');
    await open(page);
    await expect(page.getByRole('button', { name: 'Keyboard shortcuts' })).toBeVisible();
    await expect(page.locator('[data-tour="export"]')).toHaveAttribute('title', 'Export (Ctrl+E)');

    await page.keyboard.press('?');
    const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Ctrl+D');
    await expect(dialog).toContainText('Ctrl+Shift+Z');
    await expect(dialog).toContainText('Alt while dragging');
    await expect(dialog).not.toContainText('⌘');
    await expect(dialog).not.toContainText('⌥');
    await expect(dialog).not.toContainText('⇧');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);

    // The menu says the same: "Keyboard shortcuts", with its key.
    await page.locator('[data-app-menu]').click();
    await expect(page.getByRole('menuitem', { name: /Keyboard shortcuts/ })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /Touch gestures/ })).toHaveCount(0);
  });

  test('on a Mac: ⌘ ⌥ ⇧, never Ctrl', async ({ page }) => {
    await pretend(page, 'MacIntel');
    await open(page);
    await expect(page.locator('[data-tour="export"]')).toHaveAttribute('title', 'Export (⌘E)');
    await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();
    const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
    await expect(dialog).toContainText('⌘D');
    await expect(dialog).toContainText('⌘⇧Z');
    await expect(dialog).not.toContainText('Ctrl');
  });

  test('a right-click menu writes its keys for the device', async ({ page }) => {
    await pretend(page, 'Win32');
    await page.goto('/?template=quick-pitch&aspect=9:16&frozen=1500');
    await page.waitForSelector('canvas');
    await page.waitForTimeout(1_500);
    await page.getByTitle('Add a text overlay').click();
    await page.locator('[data-overlay-clip]').first().click({ button: 'right' });
    const menu = page.locator('[data-context-menu]');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: /Duplicate/ })).toContainText('Ctrl+D');
    await expect(menu).not.toContainText('⌘');
  });
});

/* Chromium's touch emulation reports no mouse or trackpad, as an iPad or Android tablet on its own does. */
test.describe('a tablet used by touch alone', () => {
  test.use({ viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true });

  test('no "?" button; the menu offers the touch gestures instead', async ({ page }) => {
    await open(page);
    await expect(page.getByRole('button', { name: 'Keyboard shortcuts' })).toHaveCount(0);

    await page.locator('[data-app-menu]').click();
    await expect(page.getByRole('menuitem', { name: /Keyboard shortcuts/ })).toHaveCount(0);
    await page.getByRole('menuitem', { name: /Touch gestures/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Touch gestures' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Press and hold');
    await expect(dialog).toContainText('Pinch with two fingers');
    // A tablet's panels are windows, closed by a tap outside rather than a swipe (D-116).
    await expect(dialog).toContainText('Tap outside a panel');
    await expect(dialog).not.toContainText('Swipe');
    await expect(dialog).not.toContainText('Ctrl');
    await expect(dialog).not.toContainText('⌘');
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toHaveCount(0);
  });

  test('a keyboard attached later brings the "?" back', async ({ page }) => {
    await open(page);
    await expect(page.getByRole('button', { name: 'Keyboard shortcuts' })).toHaveCount(0);
    await page.keyboard.press('Shift');
    await expect(page.getByRole('button', { name: 'Keyboard shortcuts' })).toBeVisible();
  });
});

test.describe('a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the menu has the touch gestures, which fit the screen', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await page.getByRole('button', { name: 'Touch gestures' }).click();
    const dialog = page.getByRole('dialog', { name: 'Touch gestures' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Tap');
    await expect(dialog).toContainText('Swipe a panel down');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    // The window itself is fixed, so it adds no scroll: it must fit the screen on its own.
    const box = await dialog.locator('[data-help-window]').boundingBox();
    expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 999)).toBeLessThanOrEqual(390);
    await expect(dialog.getByRole('button', { name: 'Close' })).toBeInViewport({ ratio: 1 });
  });
});
