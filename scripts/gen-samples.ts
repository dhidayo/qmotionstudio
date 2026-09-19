import { chromium } from '@playwright/test';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { SAMPLE_NAMES } from '../src/media/samples';

/**
 * Optimises the sample photographs for §8.1's "Try sample photos".
 *
 * Sources live in `assets/samples/<name>.jpg` — outside `public/`, because
 * anything under public is both served in dev and copied into the production
 * bundle, and shipping three megabytes of originals that nothing fetches would
 * be a straight tax on §14's cold-load budget. This writes the derived WebP
 * into `public/samples/`, and that is what the app requests.
 *
 * These are real photographs now (D-049, superseding D-030). Provenance is
 * recorded in assets/samples/PROVENANCE.md.
 *
 * ── Why Chromium and not an image library ─────────────────────────────────
 * §4 fixes the dependency list, and adding `sharp` to resize eight files once
 * is not a trade worth making. Playwright is already a devDependency and its
 * Chromium decodes JPEG, resamples and encodes WebP natively — the same reason
 * `npm run thumbs` drives a real browser rather than reimplementing the
 * renderer (D-012).
 *
 * ── Why the page code is a string ─────────────────────────────────────────
 * tsx compiles this file with esbuild, which has `keepNames` on and rewrites
 * named functions to call a `__name()` helper that does not exist in the page.
 * Injecting the source sidesteps the transform entirely (D-031).
 */

const SOURCE_DIR = resolve(process.cwd(), 'assets/samples');
const OUT_DIR = resolve(process.cwd(), 'public/samples');

/**
 * Longest edge of the encoded file.
 *
 * The largest demand any template makes is `kinetic-statement`, which draws its
 * photo full-bleed at 1.22× for the Ken Burns move — on a 1080×1920 export that
 * wants about 2,340px. The delivered sources are 2,000px, so there is nothing
 * to be gained by resampling: this is a ceiling for future sources, not a
 * target, and it never upscales.
 */
const MAX_LONG_EDGE = 2_400;

/**
 * WebP quality.
 *
 * Checked against the two images in the set that break first: `dune`, whose
 * smooth sky gradient shows banding before anything else does, and `slate`,
 * which is fine fracture detail edge to edge. 0.82 costs 1.6MB across the set
 * and 0.75 costs 1.16MB with no visible difference on either, so 0.75 it is.
 *
 * `slate` is the one image WebP barely beats its own JPEG on — busy texture
 * with no flat regions to exploit. That is the nature of the picture, not a
 * setting worth chasing.
 */
const QUALITY = 0.75;

const PAGE_SOURCE = `
window.__encode = function (dataUrl, maxLongEdge, quality) {
  return new Promise(function (resolvePromise, rejectPromise) {
    const image = new Image();
    image.onerror = function () { rejectPromise(new Error('the source would not decode')); };
    image.onload = function () {
      const srcW = image.naturalWidth;
      const srcH = image.naturalHeight;
      if (srcW === 0 || srcH === 0) { rejectPromise(new Error('the source decoded to nothing')); return; }

      // Downscale only. Upscaling a source to hit a target invents detail and
      // costs bytes for it.
      const scale = Math.min(1, maxLongEdge / Math.max(srcW, srcH));
      const w = Math.round(srcW * scale);
      const h = Math.round(srcH * scale);

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { rejectPromise(new Error('no 2d context')); return; }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(image, 0, 0, w, h);

      resolvePromise({ dataUrl: canvas.toDataURL('image/webp', quality), w: w, h: h, srcW: srcW, srcH: srcH });
    };
    image.src = dataUrl;
  });
};
`;

type Encoded = { dataUrl: string; w: number; h: number; srcW: number; srcH: number };

/** Every source on disk, by the sample name its filename declares. */
async function sources(): Promise<Map<string, string>> {
  const entries = await readdir(SOURCE_DIR, { withFileTypes: true });
  const found = new Map<string, string>();

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const match = /^(.+)\.(jpe?g|png|webp)$/i.exec(entry.name);
    if (!match?.[1]) continue;
    found.set(match[1].toLowerCase(), resolve(SOURCE_DIR, entry.name));
  }
  return found;
}

function mimeFor(path: string): string {
  if (/\.png$/i.test(path)) return 'image/png';
  if (/\.webp$/i.test(path)) return 'image/webp';
  return 'image/jpeg';
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });

  const found = await sources();

  /*
   * The set and the code have to agree. A missing source means the app fetches
   * a 404 and loadSamples throws (§16: never swallow); an extra one is a file
   * nobody will ever see, which is the kind of thing that sits in a repository
   * for a year. Both fail the run rather than being reported and ignored.
   */
  const missing = SAMPLE_NAMES.filter((name) => !found.has(name));
  if (missing.length > 0) {
    throw new Error(
      `No source photograph for: ${missing.join(', ')}.\n` +
      `Expected assets/samples/<name>.jpg for each of: ${SAMPLE_NAMES.join(', ')}`,
    );
  }

  const extra = [...found.keys()].filter((name) => !(SAMPLE_NAMES as readonly string[]).includes(name));
  if (extra.length > 0) {
    throw new Error(
      `assets/samples holds files no sample name claims: ${extra.join(', ')}.\n` +
      `Add them to SAMPLE_NAMES in src/media/samples.ts or remove them.`,
    );
  }

  console.log('Launching headless Chromium…');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent('<!doctype html><meta charset="utf-8"><body></body>');
  await page.addScriptTag({ content: PAGE_SOURCE });

  let totalKB = 0;

  for (const name of SAMPLE_NAMES) {
    const path = found.get(name);
    if (!path) throw new Error(`unreachable: "${name}" passed the check but has no path`);

    const sourceBytes = await readFile(path);
    const sourceUrl = `data:${mimeFor(path)};base64,${sourceBytes.toString('base64')}`;

    const result = await page.evaluate(
      (input: { url: string; max: number; quality: number }) =>
        (globalThis as unknown as {
          __encode: (u: string, m: number, q: number) => Promise<Encoded>;
        }).__encode(input.url, input.max, input.quality),
      { url: sourceUrl, max: MAX_LONG_EDGE, quality: QUALITY },
    );

    const base64 = result.dataUrl.split(',')[1];
    if (!base64) throw new Error(`Sample "${name}" produced no image data.`);

    const bytes = Buffer.from(base64, 'base64');
    await writeFile(resolve(OUT_DIR, `${name}.webp`), bytes);

    const kb = bytes.length / 1024;
    totalKB += kb;
    const resized = result.w !== result.srcW ? ` (from ${result.srcW}×${result.srcH})` : '';
    console.log(
      `  ${name.padEnd(8)} ${String(result.w).padStart(4)}×${String(result.h).padEnd(4)}` +
      `  ${kb.toFixed(0).padStart(4)} KB` +
      `  ${((1 - bytes.length / sourceBytes.length) * 100).toFixed(0)}% smaller than source${resized}`,
    );
  }

  await browser.close();
  console.log(`\nWrote ${SAMPLE_NAMES.length} samples to public/samples — ${totalKB.toFixed(0)} KB total.`);
}

main().catch((error: unknown) => {
  console.error('gen-samples failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
