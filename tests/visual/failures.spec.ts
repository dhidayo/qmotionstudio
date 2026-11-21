import { expect, test, type Page } from '@playwright/test';

/**
 * No silent failures (D-171).
 *
 * Each of these is a failure a person can meet on an ordinary day — a full
 * phone, a design opened offline before it was kept, a browser that cannot
 * make MP4, a bug — and each used to end in a blank, a hang or a line only
 * the console saw. Every one must now end in words that say what happened and
 * what to do. All but the last run against the production build too.
 */

test.use({ viewport: { width: 1500, height: 940 } });

const toast = (page: Page) => page.locator('[data-toast]');

async function openEditor(page: Page, url = '/'): Promise<void> {
  await page.goto(url);
  await page.waitForSelector('canvas');
  await page.waitForTimeout(1_500);
}

test('a full device says so when an autosave fails, and what to do', async ({ page }) => {
  /*
   * Every IndexedDB write fails as a full disk does, once switched on — after
   * the editor has opened, so it opens as it would on a phone that has just
   * filled up.
   */
  await page.addInitScript(() => {
    const put = Object.getOwnPropertyDescriptor(IDBObjectStore.prototype, 'put')?.value as IDBObjectStore['put'];
    IDBObjectStore.prototype.put = function quotaPut(this: IDBObjectStore, ...args: Parameters<IDBObjectStore['put']>) {
      if ((globalThis as unknown as { __full?: boolean }).__full === true) {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      }
      return Reflect.apply(put, this, args);
    };
  });
  await openEditor(page);
  await page.evaluate(() => { (globalThis as unknown as { __full: boolean }).__full = true; });

  await page.getByRole('button', { name: 'Video', exact: true }).click();
  await page.getByTitle('Add a text overlay').click();
  await page.getByRole('textbox', { name: 'Overlay text' }).fill('Kept, or said not to be');

  await expect(page.locator('[data-save-state]')).toHaveAttribute('data-save-state', 'failed', { timeout: 10_000 });
  await expect(toast(page)).toContainText('This device is out of storage, so your latest changes are not saved.');
  await expect(toast(page)).toHaveAttribute('role', 'alert');
  // It stays until it is dismissed: a failure that fades is a failure half the people never saw.
  await page.waitForTimeout(4_000);
  await expect(toast(page)).toBeVisible();

  // Room again: the next save works, the badge says so, and the notice can go.
  await page.evaluate(() => { (globalThis as unknown as { __full: boolean }).__full = false; });
  await page.getByRole('textbox', { name: 'Overlay text' }).fill('Kept after all');
  await expect(page.locator('[data-save-state]')).toHaveAttribute('data-save-state', 'saved', { timeout: 10_000 });
  await toast(page).getByRole('button', { name: 'Dismiss' }).click();
  await expect(toast(page)).toHaveCount(0);
});

test('a design that cannot be downloaded says so, and Reload fetches it', async ({ page }) => {
  /*
   * The marquee designs' code, in the dev server and in the build. Never
   * preloaded (deploy/openers.ts), so it is fetched only when asked for — as
   * it would be offline before the app had been kept.
   */
  const MARQUEE = /\/(src\/templates\/_families\/marquee\.ts|assets\/marquee-[^/]+\.js)(\?|$)/;
  let blocked = true;
  await page.route(MARQUEE, (route) => (blocked ? route.abort('internetdisconnected') : route.fallback()));

  await page.goto('/?template=mq-endless-ticker&aspect=16:9');
  await page.waitForSelector('canvas');
  await expect(toast(page)).toContainText(/That design (could not be downloaded|is not on this device yet)/, { timeout: 15_000 });
  await expect(toast(page)).toHaveAttribute('role', 'alert');

  // Connected again: the reload asks the network afresh, which a second import() in the page never would (src/ui/shell/reload.ts).
  blocked = false;
  await toast(page).getByRole('button', { name: 'Reload' }).click();
  await page.waitForSelector('canvas');
  await expect(page.locator('[data-canvas-loading]')).toHaveCount(0, { timeout: 15_000 });
  await expect(toast(page)).toHaveCount(0);
});

test('without H.264, Export says MP4 is not available and makes WebM', async ({ page }) => {
  // This browser cannot encode H.264, whatever the machine running the test can do.
  await page.addInitScript(() => {
    const probe = VideoEncoder.isConfigSupported.bind(VideoEncoder);
    VideoEncoder.isConfigSupported = async (config: VideoEncoderConfig) => (
      config.codec.startsWith('avc1') ? { supported: false, config } : probe(config)
    );
  });
  await openEditor(page);

  await page.getByTitle(/^Export \(/).click();
  const dialog = page.getByRole('dialog', { name: 'Export' });
  await expect(dialog).toBeVisible();
  const saveAs = dialog.getByRole('group', { name: 'Save as' });
  if (await saveAs.count() > 0) await saveAs.getByRole('button', { name: 'Video', exact: true }).click();

  await expect(dialog.locator('[data-export-mp4-fallback]')).toContainText('MP4 is not available in this browser — WebM will be used.');
  await expect(dialog.getByRole('button', { name: 'WebM · VP9' })).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.getByRole('button', { name: 'Export', exact: true })).toBeEnabled();

  // Choosing MP4 anyway says why it cannot, and does not offer to try.
  await dialog.getByRole('button', { name: 'MP4 · H.264' }).click();
  await expect(dialog.getByText('This browser cannot encode H.264.', { exact: false })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Export', exact: true })).toBeDisabled();
});

test('an error while drawing the editor says the work is saved, and Reload brings it back', async ({ page }) => {
  test.skip(process.env['PW_PROD'] === '1', 'Reads the dev-only editor handle, which the production build rightly omits.');
  await openEditor(page);
  await page.getByRole('button', { name: 'Video', exact: true }).click();
  await page.getByTitle('Add a text overlay').click();
  await page.getByRole('textbox', { name: 'Overlay text' }).fill('Still here after the crash');

  /*
   * A real render error, not a test-only switch: something the interface
   * cannot draw — here an object where the notice expects words — reaches
   * React, which throws while rendering. The document itself is untouched.
   */
  page.on('pageerror', () => undefined);
  await page.evaluate(() => {
    const handle = (globalThis as unknown as { __motionStudio: { editor: { setState: (s: unknown) => void } } }).__motionStudio;
    handle.editor.setState({ toast: { id: 1, message: { not: 'words' } } });
  });

  const crash = page.locator('[data-crash]');
  await expect(crash).toBeVisible();
  await expect(crash.getByRole('heading')).toHaveText('Something went wrong — your work is saved');
  await expect(crash).toContainText('Reload to carry on where you left off.');

  await crash.getByRole('button', { name: 'Reload' }).click();
  await page.waitForSelector('canvas');
  // The text typed just before the crash came back with the project.
  await expect(page.getByText('Still here after the crash').first()).toBeAttached({ timeout: 10_000 });
});
