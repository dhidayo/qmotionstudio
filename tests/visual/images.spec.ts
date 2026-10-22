import { expect, test, type Page } from '@playwright/test';

/**
 * Image saves pictures; Video saves video only (D-155).
 *
 * "Allow the Design to be exportable as high definition images, which can
 * serve as … picture posting, thumbnail pictures for youtube videos or
 * blogposts … user can be allowed to export as videos as well … On Video,
 * only video can be exported." So an image's Export opens on Image, with
 * sizes named for what they are for in its own frame shape, PNG or JPG, of
 * the frame on screen; a video's has nothing to choose. This replaces D-135's
 * carousel of a video's scenes.
 */

const DEV_ONLY = 'Reads the dev-only editor handle, which the production build rightly omits.';

test.use({ viewport: { width: 1440, height: 960 } });

/**
 * Downloads are caught in the page and kept there: only names, sizes and the
 * few bytes a test looks at leave the page.
 */
async function captureDownloads(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const store = globalThis as unknown as { __downloads?: { name: string; buffer: ArrayBuffer; type: string }[] };
    store.__downloads = [];
    HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement) {
      if (!this.download) return;
      const name = this.download;
      void fetch(this.href).then((r) => r.blob()).then(async (blob) => {
        store.__downloads?.push({ name, buffer: await blob.arrayBuffer(), type: blob.type });
      });
    };
  });
}

const downloads = (page: Page) => page.evaluate(() =>
  (globalThis as unknown as { __downloads: { name: string; buffer: ArrayBuffer; type: string }[] }).__downloads
    .map((d) => ({ name: d.name, size: d.buffer.byteLength, type: d.type })));

/** Bytes `start` to `end` of download `index`. */
const bytesOf = (page: Page, index: number, start: number, end: number) => page.evaluate(([at, from, to]) =>
  [...new Uint8Array((globalThis as unknown as { __downloads: { buffer: ArrayBuffer }[] }).__downloads[at]?.buffer ?? new ArrayBuffer(0), from, Math.max(0, to - from))], [index, start, end] as const);

/** The width and height download `index` decodes to. */
const decodedSize = (page: Page, index: number) => page.evaluate(async (at) => {
  const entry = (globalThis as unknown as { __downloads: { buffer: ArrayBuffer; type: string }[] }).__downloads[at];
  if (!entry) throw new Error('nothing downloaded');
  const bitmap = await createImageBitmap(new Blob([entry.buffer], { type: entry.type }));
  return [bitmap.width, bitmap.height];
}, index);

const exportDialog = (page: Page) => page.getByRole('dialog', { name: 'Export' });

async function openExport(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.waitForSelector('canvas');
  await page.waitForTimeout(1_500);
  await page.getByTitle(/^Export \(/).click();
  await expect(exportDialog(page)).toBeVisible();
}

test('a video saves as a video only: no pictures to choose', async ({ page }) => {
  await openExport(page, '/?template=story-big-news&aspect=4:5');
  const dialog = exportDialog(page);
  await expect(dialog.getByRole('group', { name: 'Resolution' })).toBeVisible();
  await expect(dialog.getByRole('group', { name: 'Save as' })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: /^Export image/ })).toHaveCount(0);
  await expect(dialog.getByText(/carousel|PDF/)).toHaveCount(0);
});

test('an image opens on Image, and can still be saved as a video', async ({ page }) => {
  await openExport(page, '/?template=type-typewriter&aspect=1:1');
  const saveAs = exportDialog(page).getByRole('group', { name: 'Save as' });
  await expect(saveAs.getByRole('button', { name: 'Image', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(exportDialog(page).locator('[data-export-image]')).toBeVisible();
  await saveAs.getByRole('button', { name: 'Video', exact: true }).click();
  await expect(exportDialog(page).getByRole('group', { name: 'Resolution' })).toBeVisible();
  await expect(exportDialog(page).locator('[data-export-image]')).toHaveCount(0);
});

test('a 16:9 image as a YouTube thumbnail: a JPG at 1280×720, under 2 MB', async ({ page }) => {
  await captureDownloads(page);
  await openExport(page, '/?template=tn-youtube-bold&aspect=16:9');
  const dialog = exportDialog(page);
  // The first size offered is the thumbnail, which decides its own format.
  await expect(dialog.getByRole('radio', { name: /^1280 × 720, YouTube thumbnail/ })).toHaveAttribute('aria-checked', 'true');
  await expect(dialog.locator('[data-format-note]')).toContainText('JPG under 2 MB');
  await expect(dialog.locator('[data-still-preview]')).toBeVisible();

  await dialog.getByRole('button', { name: 'Export image' }).click();
  await expect.poll(async () => (await downloads(page)).length, { timeout: 30_000 }).toBe(1);
  const [jpg] = await downloads(page);
  expect(jpg?.name).toMatch(/-1280x720\.jpg$/);
  expect(jpg?.size).toBeLessThan(2_000_000);
  expect(await bytesOf(page, 0, 0, 3)).toEqual([0xff, 0xd8, 0xff]);
  expect(await decodedSize(page, 0)).toEqual([1280, 720]);
  await expect(dialog.locator('[data-image-done]')).toContainText('-1280x720.jpg');
});

test('a 4:5 image as an Instagram post: a PNG at 1080×1350', async ({ page }) => {
  await captureDownloads(page);
  await openExport(page, '/?template=type-typewriter&aspect=4:5');
  const dialog = exportDialog(page);
  await expect(dialog.getByRole('radio', { name: /^1080 × 1350, Instagram post/ })).toHaveAttribute('aria-checked', 'true');
  await expect(dialog.getByRole('group', { name: 'Format' }).getByRole('button', { name: /^PNG/ })).toHaveAttribute('aria-pressed', 'true');

  await dialog.getByRole('button', { name: 'Export image' }).click();
  await expect.poll(async () => (await downloads(page)).length, { timeout: 30_000 }).toBe(1);
  const [png] = await downloads(page);
  expect(png?.name).toMatch(/-1080x1350\.png$/);
  expect(await bytesOf(page, 0, 1, 4)).toEqual([0x50, 0x4e, 0x47]);
  expect(await decodedSize(page, 0)).toEqual([1080, 1350]);
});

test('4K is Pro: offered and marked, and not saved on the free plan', async ({ page }) => {
  await openExport(page, '/?template=tn-youtube-bold&aspect=16:9');
  const dialog = exportDialog(page);
  const fourK = dialog.getByRole('radio', { name: /^3840 × 2160, .*Pro$/ });
  await expect(fourK).toBeVisible();
  await fourK.click();
  await expect(dialog.locator('[data-image-pro]')).toContainText('Pro');
  await expect(dialog.getByRole('button', { name: 'Export image' })).toBeDisabled();
  // Back to a size the plan saves.
  await dialog.getByRole('radio', { name: /^1920 × 1080/ }).click();
  await expect(dialog.getByRole('button', { name: 'Export image' })).toBeEnabled();
});

test('the picture is the frame on screen: the one paused on, or the picture moment', async ({ page }) => {
  test.skip(process.env['PW_PROD'] === '1', DEV_ONLY);
  await captureDownloads(page);
  await page.goto('/?template=tn-youtube-bold&aspect=16:9');
  await page.waitForSelector('canvas');
  await page.waitForTimeout(1_500);
  // Paused on a frame of the person's own: early, while the design is still arriving.
  await page.evaluate(() => { (globalThis as unknown as { __motionStudio: { clock: { seek: (ms: number) => void } } }).__motionStudio.clock.seek(400); });
  await page.waitForTimeout(400);
  const onScreen = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) throw new Error('no artboard');
    const small = document.createElement('canvas');
    small.width = 32;
    small.height = 18;
    const cx = small.getContext('2d');
    cx?.drawImage(canvas, 0, 0, 32, 18);
    return [...(cx?.getImageData(0, 0, 32, 18).data ?? [])];
  });

  await page.getByTitle(/^Export \(/).click();
  const dialog = exportDialog(page);
  await expect(dialog.locator('[data-picture-moment="paused"]')).toContainText('The frame you paused on · 0.40s');
  await dialog.getByRole('radio', { name: /^1920 × 1080/ }).click();
  await dialog.getByRole('group', { name: 'Format' }).getByRole('button', { name: /^PNG/ }).click();
  await dialog.getByRole('button', { name: 'Export image' }).click();
  await expect.poll(async () => (await downloads(page)).length, { timeout: 30_000 }).toBe(1);

  // Then the design's own picture moment, from the dialog.
  await dialog.getByRole('button', { name: 'Use the picture moment' }).click();
  await expect(dialog.locator('[data-picture-moment="rest"]')).toContainText('Picture moment · 2.40s');
  await dialog.getByRole('button', { name: 'Export again' }).click();
  await expect.poll(async () => (await downloads(page)).length, { timeout: 30_000 }).toBe(2);

  // Each file against the frame that was on screen at 0.4s, at the same small size.
  const errors = await page.evaluate(async (screen) => {
    const store = (globalThis as unknown as { __downloads: { buffer: ArrayBuffer; type: string }[] }).__downloads;
    const out: number[] = [];
    for (const entry of store) {
      const bitmap = await createImageBitmap(new Blob([entry.buffer], { type: entry.type }));
      const small = new OffscreenCanvas(32, 18);
      const cx = small.getContext('2d');
      cx?.drawImage(bitmap, 0, 0, 32, 18);
      const px = cx?.getImageData(0, 0, 32, 18).data ?? new Uint8ClampedArray();
      let sum = 0;
      for (let i = 0; i < px.length; i += 4) {
        for (let c = 0; c < 3; c++) sum += Math.abs((px[i + c] ?? 0) - (screen[i + c] ?? 0));
      }
      out.push(sum / ((px.length / 4) * 3));
    }
    return out;
  }, onScreen);
  expect(errors[0], 'the paused frame is the picture saved').toBeLessThan(8);
  expect(errors[1], 'the picture moment is another frame').toBeGreaterThan((errors[0] ?? 0) + 4);
});

test('on a phone, the picture goes to Photos through the share sheet', async ({ page }) => {
  await captureDownloads(page);
  await page.addInitScript(() => {
    const real = window.matchMedia.bind(window);
    window.matchMedia = (query: string): MediaQueryList => (query === '(pointer: coarse)'
      ? { matches: true, media: query, onchange: null, addListener: () => undefined, removeListener: () => undefined, addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => false }
      : real(query));
    const store = globalThis as unknown as { __shared?: string[] };
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: (data?: ShareData) => (data?.files?.length ?? 0) > 0 });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: (data: ShareData) => { store.__shared = (data.files ?? []).map((f) => `${f.name}:${f.type}`); return Promise.resolve(); },
    });
  });
  await openExport(page, '/?template=type-typewriter&aspect=1:1');
  await exportDialog(page).getByRole('button', { name: 'Export image' }).click();
  const offer = page.locator('[data-save-to-photos]');
  await expect(offer).toBeVisible({ timeout: 30_000 });
  expect(await downloads(page)).toEqual([]);
  await offer.getByRole('button', { name: /^(Save to Photos|Save or share)$/ }).click();
  const shared = await page.evaluate(() => (globalThis as unknown as { __shared?: string[] }).__shared);
  expect(shared).toHaveLength(1);
  expect(shared?.[0]).toMatch(/-1080x1080\.png:image\/png$/);
  await expect(offer.locator('[data-saved]')).toBeVisible();
});
