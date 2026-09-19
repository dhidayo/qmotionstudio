import { chromium, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { TEMPLATE_MANIFEST, type TemplateSummary } from '../src/templates/manifest';

/**
 * `npm run thumbs` (§7).
 *
 * Loads every template in headless Chromium against the real app and writes:
 *   - a poster frame,  public/thumbs/<id>.webp
 *   - a 2s looping preview, public/thumbs/<id>.webm
 *
 * Never hand-authored, never screenshotted manually (§7).
 *
 * ── Why WebM and not MP4 (D-007) ──────────────────────────────────────────
 * §7 asks for MP4. Two reasons it is deferred to M8: the encoder does not exist
 * until M4, and Playwright's bundled Chromium ships without proprietary codecs,
 * so H.264 encoding fails there regardless. VP9 in WebM encodes natively in
 * headless Chromium today. MP4 thumbnails become an optional M8 step using
 * `channel: 'chrome'` against a real Chrome install.
 *
 * The loop is captured with MediaRecorder. §16 prohibits captureStream as the
 * *primary export path*; a build-time thumbnail is not that, and using it here
 * avoids pulling the M4 encoder forward for a 2-second preview clip.
 *
 * ── Why this doubles as §7's "every declared aspect actually renders" ──────
 * Each template is rendered at every aspect it claims to support and the frame
 * is checked for content. A template that declares 16:9 and comes back empty
 * fails the run — which the static linter cannot detect, because it needs a
 * renderer to find out.
 */

const OUT_DIR = resolve(process.cwd(), 'public/thumbs');
const BASE_URL = process.env['THUMBS_URL'] ?? 'http://127.0.0.1:5173';

/** Thumbnails are shown small; 9:16 at 540 on the short edge is ample. */
const THUMB_SHORT_EDGE = 540;
const DEFAULT_POSTER_AT_MS = 3_200;
const LOOP_MS = 2_000;
const LOOP_FPS = 24;

/**
 * Page-side helpers, injected as source.
 *
 * tsx compiles this file with esbuild, which has `keepNames` on and rewrites
 * functions to call a `__name()` helper. Playwright serialises a function
 * passed to page.evaluate and runs it in the browser, where that helper does
 * not exist — so anything non-trivial fails with "__name is not defined".
 * Injecting the source sidesteps the transform. Same reasoning as
 * gen-samples.ts.
 */
const PAGE_HELPERS = `
window.__thumb = {
  // Fraction of sampled pixels that differ from the frame's corner colour.
  coverage: function () {
    const canvas = document.querySelector('canvas');
    if (!canvas) return 0;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 0;

    const width = canvas.width, height = canvas.height;
    const data = ctx.getImageData(0, 0, width, height).data;
    const px = function (x, y) {
      const i = (y * width + x) * 4;
      return [data[i], data[i + 1], data[i + 2]];
    };

    const base = px(2, 2);
    let differing = 0, sampled = 0;
    const step = Math.max(1, Math.floor(Math.min(width, height) / 64));

    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const c = px(x, y);
        if (Math.abs(c[0] - base[0]) + Math.abs(c[1] - base[1]) + Math.abs(c[2] - base[2]) > 24) differing++;
        sampled++;
      }
    }
    return sampled === 0 ? 0 : differing / sampled;
  },

  poster: function (quality) {
    const canvas = document.querySelector('canvas');
    if (!canvas) throw new Error('no canvas');
    return canvas.toDataURL('image/webp', quality);
  },

  record: function (ms, fps, bitrate) {
    const canvas = document.querySelector('canvas');
    if (!canvas) throw new Error('no canvas');

    const stream = canvas.captureStream(fps);
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';

    const recorder = new MediaRecorder(stream, { mimeType: mimeType, videoBitsPerSecond: bitrate });
    const chunks = [];

    return new Promise(function (resolvePromise, rejectPromise) {
      recorder.ondataavailable = function (event) {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onerror = function () { rejectPromise(new Error('MediaRecorder failed')); };
      recorder.onstop = function () {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const reader = new FileReader();
        reader.onloadend = function () { resolvePromise(String(reader.result)); };
        reader.onerror = function () { rejectPromise(new Error('could not read the recorded blob')); };
        reader.readAsDataURL(blob);
      };

      recorder.start();
      setTimeout(function () { recorder.stop(); }, ms);
    });
  }
};
`;

type Result = { id: string; posterKB: number; loopKB: number; aspectsChecked: number };

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({
    args: ['--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  page.on('pageerror', (error) => {
    console.error(`  page error: ${error.message}`);
  });

  // Re-injected after every navigation, since each load clears the page.
  await page.addInitScript({ content: PAGE_HELPERS });

  const results: Result[] = [];
  const failures: string[] = [];

  for (const summary of TEMPLATE_MANIFEST) {
    try {
      const result = await renderTemplate(page, summary);
      results.push(result);
      console.log(
        `  ${summary.id.padEnd(20)} poster ${String(result.posterKB).padStart(4)} KB` +
        `   loop ${String(result.loopKB).padStart(5)} KB` +
        `   ${result.aspectsChecked} aspects ok`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${summary.id}: ${message}`);
      console.error(`  ${summary.id.padEnd(20)} FAILED — ${message}`);
    }
  }

  await browser.close();

  console.log(`\n${results.length} of ${TEMPLATE_MANIFEST.length} templates rendered.`);
  if (failures.length > 0) {
    console.error(`\n${failures.length} failure${failures.length === 1 ? '' : 's'}:`);
    for (const failure of failures) console.error(`  ${failure}`);
    process.exitCode = 1;
  }
}

async function renderTemplate(page: Page, summary: TemplateSummary): Promise<Result> {
  // §7: verify every declared aspect actually renders, not just the poster one.
  const posterAt = summary.posterAtMs ?? DEFAULT_POSTER_AT_MS;

  let aspectsChecked = 0;
  for (const aspect of summary.supportedAspects) {
    await openTemplate(page, summary.id, aspect, posterAt);
    const coverage = await frameCoverage(page);
    if (coverage < 0.02) {
      throw new Error(`renders blank at ${aspect} (coverage ${(coverage * 100).toFixed(1)}%)`);
    }
    aspectsChecked++;
  }

  // Poster is taken at the template's own first supported aspect, which is the
  // shape it was designed against.
  const posterAspect = summary.supportedAspects[0] ?? '9:16';
  await openTemplate(page, summary.id, posterAspect, posterAt);

  const posterData = await page.evaluate(
    (q: number) => (globalThis as unknown as { __thumb: { poster: (n: number) => string } }).__thumb.poster(q),
    0.86,
  );
  const posterBytes = decodeDataUrl(posterData);
  await writeFile(resolve(OUT_DIR, `${summary.id}.webp`), posterBytes);

  // Loop: play from the start and record the canvas stream.
  await openTemplate(page, summary.id, posterAspect, null);
  const loopData = await page.evaluate(
    (o: { ms: number; fps: number; bitrate: number }) =>
      (globalThis as unknown as {
        __thumb: { record: (ms: number, fps: number, bitrate: number) => Promise<string> };
      }).__thumb.record(o.ms, o.fps, o.bitrate),
    { ms: LOOP_MS, fps: LOOP_FPS, bitrate: 900_000 },
  );
  const loopBytes = decodeDataUrl(loopData);
  await writeFile(resolve(OUT_DIR, `${summary.id}.webm`), loopBytes);

  return {
    id: summary.id,
    posterKB: Math.round(posterBytes.length / 1024),
    loopKB: Math.round(loopBytes.length / 1024),
    aspectsChecked,
  };
}

async function openTemplate(
  page: Page,
  id: string,
  aspect: string,
  frozenMs: number | null,
): Promise<void> {
  const params = new URLSearchParams({ template: id, aspect, thumb: String(THUMB_SHORT_EDGE) });
  if (frozenMs !== null) params.set('frozen', String(frozenMs));

  await page.goto(`${BASE_URL}/?${params.toString()}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('canvas');
  // Templates load lazily (D-029) and sample photos are fetched; give both a
  // moment to land before judging the frame.
  await page.waitForTimeout(700);
}

/** Delegates to the injected page helper; see PAGE_HELPERS. */
async function frameCoverage(page: Page): Promise<number> {
  return page.evaluate(
    () => (globalThis as unknown as { __thumb: { coverage: () => number } }).__thumb.coverage(),
  );
}

function decodeDataUrl(dataUrl: string): Buffer {
  const base64 = dataUrl.split(',')[1];
  if (!base64) throw new Error('empty data URL');
  return Buffer.from(base64, 'base64');
}

main().catch((error: unknown) => {
  console.error('thumbs failed:', error);
  process.exitCode = 1;
});
