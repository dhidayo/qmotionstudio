import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * D-011 — HEIC decode.
 *
 * iPhone photos are HEIC by default, so this is the common upload, not an edge
 * case. The fixture is a real HEIC (ftypheic) converted from one of the
 * synthesised samples, so no personal photography is involved.
 *
 * Playwright's Chromium on macOS may decode HEIC natively via the system codec,
 * or may fall through to the WASM path. The test deliberately does not care
 * which — it asserts the *outcome*, because which stage handles it varies by
 * platform and that is exactly what the two-stage design exists to absorb.
 */
const FIXTURE = resolve(process.cwd(), 'tests/fixtures/sample.heic');

test.use({ viewport: { width: 1500, height: 940 } });

test('a HEIC upload decodes and lands in the photo list', async ({ page }) => {
  const failures: string[] = [];
  page.on('pageerror', (error) => { failures.push(error.message); });

  await page.goto('/?frozen=4000');
  await page.waitForSelector('canvas');
  await page.waitForTimeout(800);

  const countBefore = await page.getByText(/^Your photos \(\d+\)$/).textContent();

  await page.getByLabel('Add photos to this scene').setInputFiles(FIXTURE);

  // The WASM path loads ~2MB and then decodes, so this needs real headroom.
  await expect(page.getByText(/^Your photos \(\d+\)$/)).not.toHaveText(countBefore ?? '', { timeout: 30_000 });

  // No error surfaced to the user.
  await expect(page.getByText(/HEIC|could not|Could not/)).toBeHidden();
  expect(failures, failures.join('; ')).toHaveLength(0);
});

test('falls back to WASM when the browser cannot decode HEIC', async ({ page }) => {
  /*
   * The previous test passes on macOS because Chromium hands HEIC to the
   * system codec, so it never reaches the WASM path — which is precisely the
   * path that matters, since the browsers needing it are Firefox and Chrome on
   * Windows and Linux.
   *
   * Simulating that here by making the native decode refuse HEIC specifically.
   * The WASM stage emits a PNG, which passes straight through the stub.
   */
  await page.addInitScript(() => {
    const native = globalThis.createImageBitmap.bind(globalThis);
    Object.defineProperty(globalThis, 'createImageBitmap', {
      configurable: true,
      value: async (source: ImageBitmapSource, ...rest: unknown[]) => {
        if (source instanceof Blob && source.type === 'image/heic') {
          throw new DOMException('simulated: no native HEIC support', 'InvalidStateError');
        }
        return native(source, ...(rest as []));
      },
    });
  });

  const failures: string[] = [];
  page.on('pageerror', (error) => { failures.push(error.message); });

  // Watching for the module fetch is the only way to know the WASM stage ran
  // rather than the native one quietly succeeding.
  let loadedWasm = false;
  page.on('request', (request) => {
    if (request.url().includes('libheif')) loadedWasm = true;
  });

  await page.goto('/?frozen=4000');
  await page.waitForSelector('canvas');
  await page.waitForTimeout(800);

  const before = await page.getByText(/^Your photos \(\d+\)$/).textContent();

  await page.getByLabel('Add photos to this scene').setInputFiles({
    name: 'sample.heic',
    mimeType: 'image/heic',
    buffer: readFileSync(FIXTURE),
  });

  // Loading ~2MB of WASM and decoding a 1400×1050 image needs real headroom.
  await expect(page.getByText(/^Your photos \(\d+\)$/)).not.toHaveText(before ?? '', { timeout: 60_000 });
  await expect(page.getByText(/Could not decode|could not be read/)).toBeHidden();
  expect(failures, failures.join('; ')).toHaveLength(0);
  expect(loadedWasm, 'the WASM decoder should have been fetched').toBe(true);
});

test('a corrupt file reports clearly instead of failing silently', async ({ page }) => {
  await page.goto('/?frozen=4000');
  await page.waitForSelector('canvas');
  await page.waitForTimeout(800);

  // §16: never swallow a decode error.
  await page.getByLabel('Add photos to this scene').setInputFiles({
    name: 'broken.png',
    mimeType: 'image/png',
    buffer: Buffer.from('this is definitely not a png'),
  });

  await expect(page.getByText(/Could not decode/)).toBeVisible({ timeout: 15_000 });
});
