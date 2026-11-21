import { expect, test, type Page } from '@playwright/test';

/**
 * The landing page and signing in on this device (D-175).
 *
 * "On the landing page, I should be able to click on Open Studio … and if
 * logged in, redirect to the designer view until signed out to come back to
 * landing page." `/` is the landing page, `/studio` the editor, and a
 * signed-in visit to `/` goes straight on. These start signed out, with
 * nothing stored, as a first visit does; the rest of the suite is seeded as
 * signed in (tests/support/storage.ts).
 */

const SIGNED_OUT = { cookies: [], origins: [] };

async function session(page: Page): Promise<string | null> {
  return page.evaluate(() => localStorage.getItem('ms.session'));
}

async function studioOpen(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/studio/);
  await page.waitForSelector('canvas', { timeout: 20_000 });
}

test.describe('signed out', () => {
  test.use({ storageState: SIGNED_OUT });

  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    test(`the landing page draws at ${viewport.width} wide, with nowhere to scroll sideways`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/');
      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your photos, moving in minutes.');
      const header = page.getByRole('navigation', { name: 'Main' });
      await expect(header.getByRole('button', { name: 'Sign in' })).toBeVisible();
      await expect(header.getByRole('button', { name: 'Open Studio' })).toBeVisible();
      for (const id of ['how', 'designs', 'pricing']) await expect(page.locator(`#${id}`)).toBeAttached();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      // The editor is not drawn, and no editor canvas is on the page.
      await expect(page.locator('[data-app-menu], [data-phone-menu]')).toHaveCount(0);
    });
  }

  test('Open Studio signs in on this device and opens the studio', async ({ page }) => {
    await page.goto('/');
    expect(await session(page)).toBeNull();
    // The landing page keeps Clay: no studio surface (D-176) on it.
    await expect(page.locator('html')).not.toHaveAttribute('data-surface', /.*/);
    await page.locator('.lp-hero').getByRole('button', { name: 'Open Studio' }).click();
    await studioOpen(page);
    await expect(page.locator('.lp-hero')).toHaveCount(0);
    await expect(page.locator('html')).toHaveAttribute('data-surface', 'studio');
    expect(await session(page)).not.toBeNull();
  });

  test('Sign in in the header does the same, on this device for now', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Sign in' }).click();
    await studioOpen(page);
    expect(await session(page)).not.toBeNull();
  });

  test('a deep link still opens the studio, at / and at /studio, without signing in', async ({ page }) => {
    await page.goto('/?template=pop-float&aspect=1:1&frozen=1500');
    await studioOpen(page);
    await expect(page).toHaveURL(/\/studio\?template=pop-float&aspect=1:1&frozen=1500$/);
    expect(await session(page)).toBeNull();
    await page.goto('/studio?template=quick-pitch&aspect=9:16');
    await studioOpen(page);
    expect(await session(page)).toBeNull();
  });

  test('a card in the showcase opens that design in the studio', async ({ page }) => {
    await page.goto('/');
    await page.locator('#designs').scrollIntoViewIfNeeded();
    await page.locator('.lp-filters').getByRole('button', { name: 'Products and sales' }).click();
    const card = page.locator('[data-design-link]').first();
    const id = await card.getAttribute('data-design-link');
    expect(id).not.toBeNull();
    await card.click();
    await studioOpen(page);
    await expect(page).toHaveURL(new RegExp(`template=${id ?? ''}`));
    if (process.env['PW_PROD'] !== '1') {
      const opened = await page.evaluate(() => (globalThis as unknown as {
        __motionStudio: { editor: { getState: () => { project: { scenes: { templateId: string }[] } } } };
      }).__motionStudio.editor.getState().project.scenes[0]?.templateId);
      expect(opened).toBe(id);
    }
  });

  test('a keyboard alone reaches Open Studio and opens the studio', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.lp-hero');
    // The first stop is the way past the header.
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
    let reached = false;
    for (let i = 0; i < 20 && !reached; i++) {
      await page.keyboard.press('Tab');
      reached = await page.evaluate(() => document.activeElement?.closest('.lp-hero')?.querySelector('[data-open-studio]') === document.activeElement);
    }
    expect(reached).toBe(true);
    const ring = await page.evaluate(() => getComputedStyle(document.activeElement as Element).outlineStyle);
    expect(ring).not.toBe('none');
    await page.keyboard.press('Enter');
    await studioOpen(page);
  });

  test('the hero plays the app’s own designs, and Pause stops them', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-hero-canvas].is-drawn')).toHaveCount(2, { timeout: 20_000 });
    await expect(page.locator('[data-hero]')).toHaveAttribute('data-hero-playing', 'true');
    // Pause, for anyone who wants it still (WCAG 2.2.2).
    await page.locator('[data-hero-pause]').click();
    await expect(page.locator('[data-hero]')).toHaveAttribute('data-hero-playing', 'false');
  });

  test('reduced motion: the designs are drawn and stay on their picture', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.locator('[data-hero-canvas].is-drawn')).toHaveCount(2, { timeout: 20_000 });
    await page.waitForTimeout(500);
    await expect(page.locator('[data-hero]')).toHaveAttribute('data-hero-playing', 'false');
    // Nothing on the page itself keeps moving either.
    const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && Number(a.effect?.getComputedTiming().duration ?? 0) > 1).length);
    expect(running).toBe(0);
  });
});

/*
 * The production build (D-171's run): the host serves the page at /studio,
 * the installed app opens there, and the service worker serves it offline.
 */
test.describe('the production build', () => {
  test.skip(process.env['PW_PROD'] !== '1', 'The service worker and the manifest exist only in the production build.');

  test('the installed app opens the studio, and /studio opens offline', async ({ page, context, request }) => {
    test.setTimeout(120_000);
    const manifest = await (await request.get('/manifest.webmanifest')).json() as { start_url: string };
    expect(manifest.start_url).toBe('/studio');
    expect((await request.get('/studio')).status()).toBe(200);

    await page.goto('/studio');
    await studioOpen(page);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise<void>((resolve) => {
          navigator.serviceWorker.addEventListener('controllerchange', () => { resolve(); }, { once: true });
        });
      }
    });
    await context.setOffline(true);
    await page.goto('/studio');
    await studioOpen(page);
    // Signed in, `/` is the studio offline too.
    await page.goto('/');
    await studioOpen(page);
    // And signed out, the landing page, from the same cache.
    await page.evaluate(() => { localStorage.removeItem('ms.session'); });
    await page.goto('/');
    await expect(page.locator('.lp-hero')).toBeVisible();
  });
});

test.describe('signed in', () => {
  test('a visit to / goes straight to the studio, without drawing the landing page', async ({ page }) => {
    await page.addInitScript(() => {
      new MutationObserver(() => {
        if (document.querySelector('.lp-hero')) (globalThis as unknown as { __landingSeen: boolean }).__landingSeen = true;
      }).observe(document, { childList: true, subtree: true });
    });
    await page.goto('/');
    await studioOpen(page);
    expect(await page.evaluate(() => (globalThis as unknown as { __landingSeen?: boolean }).__landingSeen === true)).toBe(false);
  });

  test('Sign out, confirmed, returns to the landing page and keeps the designs', async ({ page }) => {
    await page.goto('/');
    await studioOpen(page);
    await page.getByRole('button', { name: 'Account' }).click();
    const menu = page.getByRole('dialog', { name: 'Account' });
    await menu.locator('[data-sign-out]').click();
    await expect(menu).toContainText('Your designs stay on this device.');
    await menu.locator('[data-sign-out-confirm]').click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('.lp-hero')).toBeVisible();
    await expect(page.locator('html')).not.toHaveAttribute('data-surface', /.*/);
    expect(await session(page)).toBeNull();
    // Back goes to the studio's address, and the studio comes back calm; Forward returns here in Clay.
    await page.goBack();
    await studioOpen(page);
    await expect(page.locator('html')).toHaveAttribute('data-surface', 'studio');
    await page.evaluate(() => { localStorage.removeItem('ms.session'); });
    await page.goForward();
    await expect(page.locator('.lp-hero')).toBeVisible();
    await expect(page.locator('html')).not.toHaveAttribute('data-surface', /.*/);
    // The project is still there for the next time.
    await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Open Studio' }).click();
    await studioOpen(page);
  });

  test('the account menu: plan, theme, help, and Escape closes it where it opened', async ({ page }) => {
    await page.goto('/?template=pop-float&aspect=1:1&frozen=1500');
    await studioOpen(page);
    const button = page.getByRole('button', { name: 'Account' });
    await button.click();
    const menu = page.getByRole('dialog', { name: 'Account' });
    await expect(menu).toBeVisible();
    await expect(menu).toContainText('Accounts are coming');
    await expect(menu.getByRole('group', { name: 'Theme' })).toBeVisible();
    await menu.getByRole('button', { name: 'Dark', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await menu.getByRole('button', { name: 'Light', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(button).toBeFocused();
    await button.click();
    await page.getByRole('dialog', { name: 'Account' }).getByRole('button', { name: /Help and shortcuts/ }).click();
    await expect(page.getByRole('dialog', { name: /Keyboard shortcuts|Touch gestures/ })).toBeVisible();
  });

  test('on a phone, the same menu from the phone’s top bar', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?template=pop-float&aspect=1:1&frozen=1500');
    await studioOpen(page);
    const button = page.getByRole('button', { name: 'Account' });
    const box = await button.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    await button.click();
    await expect(page.getByRole('dialog', { name: 'Account' }).locator('[data-sign-out]')).toBeVisible();
  });
});
