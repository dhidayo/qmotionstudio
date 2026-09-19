import { expect, type Page } from '@playwright/test';
import { resolve } from 'node:path';

/**
 * Shared plumbing for §9's custom-media tests.
 *
 * Lives here because the preview half runs in the parallel `app` project and
 * the export half has to run in the serial one (D-048) — two files, one
 * fixture, one set of expectations about it.
 */

export const FIXTURE = resolve(process.cwd(), 'tests/fixtures/colour-bands.webm');

/** Where each band sits inside the four-second clip, sampled mid-band. */
export const BAND = { red: 500, green: 1_500, blue: 2_500, yellow: 3_500 } as const;

/** The overlay is dropped at the frozen playhead and runs three seconds. */
export const DROPPED_AT_MS = 2_000;
export const QUICK_PITCH_MS = 15_000;

export type Rgb = { r: number; g: number; b: number };

/** Which of the fixture's bands a sampled colour is closest to. */
export function nearestBand(rgb: Rgb): string {
  const targets: Record<string, Rgb> = {
    red: { r: 224, g: 32, b: 32 },
    green: { r: 32, g: 192, b: 64 },
    blue: { r: 32, g: 64, b: 224 },
    yellow: { r: 224, g: 208, b: 32 },
  };

  let best = 'none';
  let bestDistance = Infinity;
  for (const [name, target] of Object.entries(targets)) {
    const distance = Math.hypot(rgb.r - target.r, rgb.g - target.g, rgb.b - target.b);
    if (distance < bestDistance) { bestDistance = distance; best = name; }
  }
  // Far from every band means the overlay is not drawing at all.
  return bestDistance > 110 ? 'none' : best;
}

/** Mean colour of the middle of the artboard, where a centred overlay sits. */
export async function centreColour(page: Page): Promise<Rgb> {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) throw new Error('no artboard');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no context');

    const size = Math.round(Math.min(canvas.width, canvas.height) * 0.12);
    const data = ctx.getImageData(
      Math.round(canvas.width / 2 - size / 2),
      Math.round(canvas.height / 2 - size / 2),
      size, size,
    ).data;

    let r = 0, g = 0, b = 0;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i] ?? 0;
      g += data[i + 1] ?? 0;
      b += data[i + 2] ?? 0;
    }
    const n = data.length / 4;
    return { r: r / n, g: g / n, b: b / n };
  });
}

/** §12's tier lives in localStorage behind the dev toggle; custom media is Pro. */
export async function openProAd(page: Page, frozenMs: number): Promise<void> {
  await page.addInitScript(() => { localStorage.setItem('ms.tier', 'pro'); });
  await page.goto(`/?template=quick-pitch&aspect=9:16&frozen=${frozenMs}`);
  await page.waitForSelector('canvas');
  await page.waitForTimeout(2_000);
}

/** Uploads the fixture and neutralises the overlay's entrance and exit. */
export async function addClip(page: Page): Promise<void> {
  await page.getByLabel('Add a video overlay').setInputFiles(FIXTURE);
  await expect(page.getByLabel('Overlay inspector')).toBeVisible({ timeout: 15_000 });

  for (const group of ['Entrance', 'Exit']) {
    await page.getByRole('group', { name: group }).getByRole('button', { name: 'None' }).click();
  }
  // Big enough that the centre sample is comfortably inside the clip.
  await page.getByLabel('Size', { exact: true }).fill('200');
  await page.waitForTimeout(600);
}

export async function scrubTo(page: Page, ms: number): Promise<void> {
  const ruler = page.getByLabel('Scrub');
  const box = await ruler.boundingBox();
  if (!box) throw new Error('no ruler');
  await ruler.click({ position: { x: box.width * (ms / QUICK_PITCH_MS), y: 2 } });
  await page.waitForTimeout(500);
}
