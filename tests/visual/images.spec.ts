import { expect, test, type Page } from '@playwright/test';

/**
 * A video's scenes as pictures (D-135): a carousel of PNGs, a LinkedIn PDF,
 * or straight to Photos on a phone.
 */

test.use({ viewport: { width: 1440, height: 960 } });

async function captureDownloads(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const store = globalThis as unknown as { __downloads?: { name: string; bytes: number[] }[] };
    store.__downloads = [];
    HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement) {
      if (!this.download) return;
      const name = this.download;
      void fetch(this.href).then((r) => r.arrayBuffer()).then((buffer) => { store.__downloads?.push({ name, bytes: [...new Uint8Array(buffer)] }); });
    };
  });
}

const downloads = (page: Page) => page.evaluate(() => (globalThis as unknown as { __downloads: { name: string; bytes: number[] }[] }).__downloads);

async function openImages(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.waitForSelector('canvas');
  await page.waitForTimeout(2_000);
  await page.getByTitle('Export (⌘E)').click();
  await page.getByRole('button', { name: /^Images? / }).or(page.getByRole('button', { name: 'Image', exact: true })).click();
  await page.getByRole('button', { name: '720p' }).click();
}

test('a four-scene video becomes four slides, in order, in one ZIP', async ({ page }) => {
  await captureDownloads(page);
  await openImages(page, '/?template=story-big-news&aspect=4:5');
  await page.getByRole('button', { name: 'Export 4 pictures' }).click();
  await expect.poll(async () => (await downloads(page)).length, { timeout: 30_000 }).toBe(1);
  const [zip] = await downloads(page);
  expect(zip?.name).toMatch(/-slides\.zip$/);

  // Read the archive back in the page: four PNGs, each the frame's size, each different.
  const report = await page.evaluate(async (bytes) => {
    const data = new Uint8Array(bytes);
    const view = new DataView(data.buffer);
    const end = data.length - 22;
    const count = view.getUint16(end + 10, true);
    let at = view.getUint32(end + 16, true);
    const slides: { name: string; w: number; h: number; sample: number }[] = [];
    for (let i = 0; i < count; i++) {
      const nameLength = view.getUint16(at + 28, true);
      const size = view.getUint32(at + 20, true);
      const local = view.getUint32(at + 42, true);
      const name = new TextDecoder().decode(data.slice(at + 46, at + 46 + nameLength));
      const start = local + 30 + view.getUint16(local + 26, true);
      const bitmap = await createImageBitmap(new Blob([data.slice(start, start + size)], { type: 'image/png' }));
      const canvas = new OffscreenCanvas(8, 8);
      const cx = canvas.getContext('2d');
      cx?.drawImage(bitmap, 0, 0, 8, 8);
      const px = cx?.getImageData(0, 0, 8, 8).data ?? new Uint8ClampedArray();
      let sum = 0;
      for (let k = 0; k < px.length; k += 1) sum += (px[k] ?? 0) * ((k % 7) + 1);
      slides.push({ name, w: bitmap.width, h: bitmap.height, sample: sum });
      at += 46 + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
    }
    return slides;
  }, zip?.bytes ?? []);

  expect(report.map((slide) => slide.name.slice(-7))).toEqual(['-01.png', '-02.png', '-03.png', '-04.png']);
  for (const slide of report) expect([slide.w, slide.h]).toEqual([720, 900]);
  expect(new Set(report.map((slide) => slide.sample)).size).toBe(4);
});

test('as a PDF, one page per scene', async ({ page }) => {
  await captureDownloads(page);
  await openImages(page, '/?template=story-big-news&aspect=4:5');
  await page.getByRole('button', { name: 'PDF · LinkedIn' }).click();
  await page.getByRole('button', { name: 'Export 4 pictures' }).click();
  await expect.poll(async () => (await downloads(page)).length, { timeout: 30_000 }).toBe(1);
  const [pdf] = await downloads(page);
  expect(pdf?.name).toMatch(/\.pdf$/);
  const text = String.fromCharCode(...(pdf?.bytes.slice(0, 9) ?? []));
  expect(text).toBe('%PDF-1.4\n');
  const head = (pdf?.bytes ?? []).slice(0, 4000).map((b) => String.fromCharCode(b)).join('');
  expect(head).toContain('/Count 4');
});

test('one design becomes one picture', async ({ page }) => {
  await captureDownloads(page);
  await openImages(page, '/?template=type-typewriter&aspect=1:1');
  await page.getByRole('button', { name: 'Export picture' }).click();
  await expect.poll(async () => (await downloads(page)).length, { timeout: 30_000 }).toBe(1);
  const [png] = await downloads(page);
  expect(png?.name).toMatch(/\.png$/);
  expect(png?.bytes.slice(1, 4)).toEqual([0x50, 0x4e, 0x47]);
});

test('on a phone, the slides go to Photos through the share sheet', async ({ page }) => {
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
  await openImages(page, '/?template=story-big-news&aspect=4:5');
  await page.getByRole('button', { name: 'Export 4 pictures' }).click();
  const offer = page.locator('[data-save-to-photos]');
  await expect(offer).toBeVisible({ timeout: 30_000 });
  expect(await downloads(page)).toEqual([]);
  await offer.getByRole('button', { name: /^(Save to Photos|Save or share)$/ }).click();
  const shared = await page.evaluate(() => (globalThis as unknown as { __shared?: string[] }).__shared);
  expect(shared?.length).toBe(4);
  for (const entry of shared ?? []) expect(entry).toMatch(/\.png:image\/png$/);
});
