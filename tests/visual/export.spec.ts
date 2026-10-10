import { expect, test, type Page } from '@playwright/test';
import { addClip, BAND, DROPPED_AT_MS, nearestBand } from '../support/customMedia';
import { addMusic, EXPECTED, RMS_SOURCE } from '../support/audio';

/**
 * M4 — export.
 *
 * The milestone's exit criterion is "a 10s 1080p MP4 exports and matches the
 * preview frame-for-frame". That cannot be asserted literally: the preview
 * samples arbitrary wall-clock times while the export samples t = n/fps, and a
 * lossy codec never returns the bytes it was given. The operational form, per
 * D-017, is: **the same globalTimeMs rendered through both paths differs by
 * under a perceptual threshold.**
 *
 * `?frozen=<ms>` parks the preview at an exact time and `?thumb=1080` pins its
 * backing store to the export resolution, so the two frames are directly
 * comparable without a resample in between.
 */

test.use({ viewport: { width: 1500, height: 940 } });

/**
 * Exports are CPU-bound, and this file runs its tests in parallel — several
 * 1080p encodes competing for the same cores comfortably exceed the 30s
 * default even though each finishes in about 15s alone. The work is real, so
 * the budget is raised rather than the parallelism reduced.
 */
const EXPORT_TIMEOUT_MS = 240_000;

/** Stops the download reaching the filesystem and captures the blob instead. */
async function captureDownloads(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const store = globalThis as unknown as { __exported?: { blob: Blob; name: string } };
    HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement) {
      if (!this.download) return;
      const href = this.href;
      const name = this.download;
      // Read the bytes before the app's revoke timer fires.
      void fetch(href)
        .then((r) => r.blob())
        .then((blob) => { store.__exported = { blob, name }; });
    };
  });
}

async function runExport(page: Page, format: 'mp4' | 'webm'): Promise<void> {
  await page.getByTitle('Export (⌘E)').click();
  await page.getByRole('button', { name: format === 'mp4' ? 'MP4 · H.264' : 'WebM · VP9' }).click();
  await page.getByRole('button', { name: /^Export( again)?$/ }).last().click();
}

/*
 * Three minutes, and the reason is the dev server rather than the encoder. The
 * first export of a run makes Vite compile the export worker on demand, so that
 * test carries a cold compile on top of a full 1080p encode, on a machine busy
 * with the rest of the suite — it has timed out at ninety seconds while taking
 * under twenty alone. Against the production build (`npm run e2e:prod`) the
 * worker is prebuilt and the same test finishes in about thirty.
 */
async function waitForExport(page: Page, timeout = 180_000): Promise<void> {
  await page.waitForFunction(
    () => (globalThis as unknown as { __exported?: unknown }).__exported !== undefined,
    undefined,
    { timeout },
  );
}

test.describe('offline export', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(EXPORT_TIMEOUT_MS);
    await captureDownloads(page);
  });

  test('a 10s 1080p MP4 exports and decodes to the right shape', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('canvas');
    await page.waitForTimeout(1200);

    await runExport(page, 'mp4');
    await waitForExport(page);

    const info = await page.evaluate(async () => {
      const { blob, name } = (globalThis as unknown as { __exported: { blob: Blob; name: string } }).__exported;
      const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
      const ascii = [...head].map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.')).join('');

      const url = URL.createObjectURL(blob);
      const video = document.createElement('video');
      video.src = url;
      video.muted = true;
      const meta = await new Promise<{ w: number; h: number; duration: number }>((resolve, reject) => {
        video.onloadedmetadata = () => {
          resolve({ w: video.videoWidth, h: video.videoHeight, duration: video.duration });
        };
        video.onerror = () => { reject(new Error('the exported file would not decode')); };
      });
      URL.revokeObjectURL(url);
      return { name, size: blob.size, type: blob.type, ascii, ...meta };
    });

    expect(info.name).toMatch(/\.mp4$/);
    expect(info.type).toBe('video/mp4');
    // A real MP4 container with an AVC brand, not just bytes.
    expect(info.ascii).toContain('ftyp');
    expect(info.w).toBe(1080);
    expect(info.h).toBe(1920);
    expect(info.duration).toBeCloseTo(10, 1);
    expect(info.size).toBeGreaterThan(200_000);
  });

  test('effects are in the export, exactly as in the preview (D-100)', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('canvas');
    await page.waitForTimeout(1200);

    // Black and white over the whole scene, added the way a person would.
    await page.getByRole('tab', { name: 'Motion' }).click();
    await page.getByRole('button', { name: '+ Add effect' }).last().click();
    const library = page.getByRole('dialog', { name: 'Effects' });
    await library.getByRole('tab', { name: 'Stylize' }).click();
    await library.locator('[data-effect="black-white"]').click();

    await runExport(page, 'mp4');
    await waitForExport(page);

    // A frame from the file itself: a black-and-white picture has no colour.
    const colourfulness = await page.evaluate(async () => {
      const { blob } = (globalThis as unknown as { __exported: { blob: Blob } }).__exported;
      const url = URL.createObjectURL(blob);
      const video = document.createElement('video');
      video.src = url;
      video.muted = true;
      await new Promise<void>((resolve, reject) => {
        video.onloadeddata = () => { resolve(); };
        video.onerror = () => { reject(new Error('the exported file would not decode')); };
      });
      video.currentTime = 4;
      await new Promise<void>((resolve) => { video.onseeked = () => { resolve(); }; });
      const canvas = document.createElement('canvas');
      canvas.width = 108;
      canvas.height = 192;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no 2d');
      ctx.drawImage(video, 0, 0, 108, 192);
      const data = ctx.getImageData(0, 0, 108, 192).data;
      URL.revokeObjectURL(url);
      let spread = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i] ?? 0, g = data[i + 1] ?? 0, b = data[i + 2] ?? 0;
        spread += Math.max(r, g, b) - Math.min(r, g, b);
      }
      return spread / (data.length / 4);
    });
    // Video compression leaves a trace of chroma; a colour photograph is far above this.
    expect(colourfulness).toBeLessThan(6);
  });

  test('WebM exports a valid EBML container', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('canvas');
    await page.waitForTimeout(1200);

    await runExport(page, 'webm');
    await waitForExport(page);

    const info = await page.evaluate(async () => {
      const { blob, name } = (globalThis as unknown as { __exported: { blob: Blob; name: string } }).__exported;
      const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
      const url = URL.createObjectURL(blob);
      const video = document.createElement('video');
      video.src = url;
      video.muted = true;
      const meta = await new Promise<{ w: number; h: number }>((resolve, reject) => {
        video.onloadedmetadata = () => { resolve({ w: video.videoWidth, h: video.videoHeight }); };
        video.onerror = () => { reject(new Error('the exported webm would not decode')); };
      });
      URL.revokeObjectURL(url);
      return { name, magic: [...head], ...meta };
    });

    expect(info.name).toMatch(/\.webm$/);
    // EBML magic.
    expect(info.magic).toEqual([0x1a, 0x45, 0xdf, 0xa3]);
    expect(info.w).toBe(1080);
    expect(info.h).toBe(1920);
  });

  test('the export matches the preview at the same instant', async ({ page }) => {
    const AT_MS = 4_000;

    // thumb=1080 renders the preview at export resolution, so the two frames
    // compare without an intervening resample.
    await page.goto(`/?frozen=${AT_MS}&thumb=1080`);
    await page.waitForSelector('canvas');
    await page.waitForTimeout(1500);

    await runExport(page, 'mp4');
    await waitForExport(page);

    const comparison = await page.evaluate(async (atMs) => {
      const SAMPLE_W = 180;
      const SAMPLE_H = 320;

      const sample = (source: CanvasImageSource): Uint8ClampedArray => {
        const c = document.createElement('canvas');
        c.width = SAMPLE_W;
        c.height = SAMPLE_H;
        const cx = c.getContext('2d', { alpha: false });
        if (!cx) throw new Error('no context');
        cx.drawImage(source, 0, 0, SAMPLE_W, SAMPLE_H);
        return cx.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data;
      };

      const artboard = document.querySelector('canvas');
      if (!artboard) throw new Error('no artboard');
      const preview = sample(artboard);

      const { blob } = (globalThis as unknown as { __exported: { blob: Blob } }).__exported;
      const url = URL.createObjectURL(blob);
      const video = document.createElement('video');
      video.src = url;
      video.muted = true;
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => { resolve(); };
        video.onerror = () => { reject(new Error('decode failed')); };
      });

      const meanAbsError = (a: Uint8ClampedArray, b: Uint8ClampedArray): number => {
        let total = 0;
        let counted = 0;
        for (let i = 0; i < a.length; i += 4) {
          total += Math.abs((a[i] ?? 0) - (b[i] ?? 0));
          total += Math.abs((a[i + 1] ?? 0) - (b[i + 1] ?? 0));
          total += Math.abs((a[i + 2] ?? 0) - (b[i + 2] ?? 0));
          counted += 3;
        }
        return total / counted;
      };

      /*
       * Seeking snaps to a frame boundary, and which side it lands on is not
       * guaranteed. Checking the neighbouring frames too accounts for that
       * without weakening the assertion — the point is that *a* frame at this
       * instant matches, not that the seek rounds a particular way.
       */
      const fps = 30;
      const offsets = [0, -1 / fps, 1 / fps];
      let best = Infinity;
      let bestOffset = 0;

      for (const offset of offsets) {
        const target = Math.max(0, atMs / 1000 + offset);
        await new Promise<void>((resolve) => {
          // Guarded: a seek that snaps to the frame already displayed may not
          // fire `seeked` at all, and a silent hang here would read as a
          // renderer failure rather than a test one.
          const done = setTimeout(resolve, 3_000);
          video.onseeked = () => { clearTimeout(done); resolve(); };
          video.currentTime = target;
        });
        const error = meanAbsError(preview, sample(video));
        if (error < best) {
          best = error;
          bestOffset = offset;
        }
      }

      URL.revokeObjectURL(url);
      return { meanAbsError: best, bestOffsetMs: Math.round(bestOffset * 1000) };
    }, AT_MS);

    /*
     * Threshold in 0–255 units per channel. A lossy codec at these bitrates
     * plus the downscale costs a few units; anything under ~10 means the two
     * paths drew the same picture. A renderer divergence — a missing layer, a
     * fallback font, a wrong palette — lands far above this.
     */
    expect(
      comparison.meanAbsError,
      `mean abs error ${comparison.meanAbsError.toFixed(2)}/255 at offset ${comparison.bestOffsetMs}ms`,
    ).toBeLessThan(10);
  });

  test('cancel stops the export and leaves nothing behind', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('canvas');
    await page.waitForTimeout(1200);

    await page.getByTitle('Export (⌘E)').click();
    // The window loads on demand (D-112): its own button, not the top bar's.
    await page.getByRole('dialog', { name: 'Export' }).getByRole('button', { name: /^Export( again)?$/ }).click();

    // Let it get properly under way before pulling the plug.
    await expect(page.getByText(/Encoding frame/)).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Cancel' }).click();

    // Back to an idle dialog, with no file produced.
    await expect(page.getByRole('button', { name: /^Export( again)?$/ })).toBeVisible();
    await expect(page.getByText(/Encoding frame/)).toBeHidden();

    const produced = await page.evaluate(
      () => (globalThis as unknown as { __exported?: unknown }).__exported !== undefined,
    );
    expect(produced, 'a cancelled export must not produce a file').toBe(false);
  });

  test('exporting does not disturb the live preview (D-001)', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('canvas');
    await page.waitForTimeout(1200);

    await page.getByTitle('Export (⌘E)').click();
    // The window loads on demand (D-112): its own button, not the top bar's.
    await page.getByRole('dialog', { name: 'Export' }).getByRole('button', { name: /^Export( again)?$/ }).click();
    await expect(page.getByText(/Encoding frame/)).toBeVisible({ timeout: 20_000 });

    /*
     * The reason D-001 puts the buffers and caches in a rig rather than at
     * module scope: preview and export run at the same time, and sharing
     * scratch surfaces would tear frames. Here the preview must keep drawing
     * real content while the worker encodes.
     */
    const preview = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) throw new Error('no artboard');
      const cx = canvas.getContext('2d');
      if (!cx) throw new Error('no context');
      const { width, height } = canvas;
      const data = cx.getImageData(0, 0, width, height).data;
      let lit = 0;
      for (let i = 0; i < data.length; i += 4) {
        if ((data[i] ?? 0) + (data[i + 1] ?? 0) + (data[i + 2] ?? 0) > 40) lit++;
      }
      return { litPct: (lit / (data.length / 4)) * 100 };
    });

    expect(preview.litPct, 'the preview went blank during export').toBeGreaterThan(20);
    await page.getByRole('button', { name: 'Cancel' }).click();
  });
});

test.describe('realtime fallback (§11.9)', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(EXPORT_TIMEOUT_MS);
    await captureDownloads(page);
    /*
     * Forced, not waited for. Chromium has WebCodecs, so the fallback would
     * never run here otherwise — and an untested fallback is exactly the code
     * that fails when a Firefox-for-Android user finally reaches it.
     */
    await page.addInitScript(() => {
      Reflect.deleteProperty(globalThis, 'VideoEncoder');
    });
  });

  test('records in real time and produces a playable WebM', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('canvas');
    await page.waitForTimeout(1200);

    await page.getByTitle('Export (⌘E)').click();

    // §11.9: the user is told plainly why, rather than silently getting
    // something different from what the dialog offered.
    await expect(page.getByText(/no WebCodecs support/)).toBeVisible();

    await page.getByRole('button', { name: /^Export( again)?$/ }).last().click();
    await waitForExport(page, 90_000);

    const info = await page.evaluate(async () => {
      const { blob, name } = (globalThis as unknown as { __exported: { blob: Blob; name: string } }).__exported;
      const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
      const url = URL.createObjectURL(blob);
      const video = document.createElement('video');
      video.src = url;
      video.muted = true;
      const meta = await new Promise<{ w: number; h: number }>((resolve, reject) => {
        video.onloadedmetadata = () => { resolve({ w: video.videoWidth, h: video.videoHeight }); };
        video.onerror = () => { reject(new Error('the recorded file would not decode')); };
      });
      URL.revokeObjectURL(url);
      return { name, size: blob.size, magic: [...head], ...meta };
    });

    // WebM only, whatever the dialog was set to (§11.9).
    expect(info.name).toMatch(/\.webm$/);
    expect(info.magic).toEqual([0x1a, 0x45, 0xdf, 0xa3]);
    expect(info.size).toBeGreaterThan(50_000);
    expect(info.w).toBeGreaterThan(0);
  });
});

/**
 * M5's exit criterion, export half: "a 30s multi-scene ad plays and exports
 * correctly". Playing is asserted in motionAds.spec.ts; exporting is here,
 * where D-042's serial project keeps a 30-second encode from competing with
 * the rest of the suite for cores.
 */
test.describe('a multi-scene ad exports (M5)', () => {
  test.beforeEach(async ({ page }) => {
    // Three times the frames of the 10s tests, plus eight template modules to
    // fetch inside the worker before the first one is drawn.
    test.setTimeout(EXPORT_TIMEOUT_MS + 90_000);
    await captureDownloads(page);
  });

  test('a 30s eight-scene ad exports at full length with every beat in it', async ({ page }) => {
    await page.goto('/?template=launch-story&aspect=9:16');
    await page.waitForSelector('canvas');
    // The ad expands and fetches one module per beat (D-029). The export
    // worker loads them again in its own realm, but the main thread has to
    // have the document before the dialog can size the job.
    await page.waitForTimeout(2_500);

    await expect(page.getByText('8 scenes · 0 overlays')).toBeVisible();

    await runExport(page, 'mp4');
    await waitForExport(page, 140_000);

    const info = await page.evaluate(async () => {
      const { blob, name } = (globalThis as unknown as { __exported: { blob: Blob; name: string } }).__exported;
      const url = URL.createObjectURL(blob);
      const video = document.createElement('video');
      video.src = url;
      video.muted = true;

      const meta = await new Promise<{ w: number; h: number; duration: number }>((resolve, reject) => {
        video.onloadedmetadata = () => {
          resolve({ w: video.videoWidth, h: video.videoHeight, duration: video.duration });
        };
        video.onerror = () => { reject(new Error('the exported ad would not decode')); };
      });

      /*
       * Sample the decoded file at three instants and compare them to each
       * other. An export that loaded only the first scene's template — which is
       * exactly what the worker used to do — still produces a well-formed
       * thirty-second MP4; it is just the same beat eight times over. Only
       * reading the pixels back catches that.
       */
      const frameAt = async (seconds: number): Promise<number[]> => {
        await new Promise<void>((resolve) => {
          const done = setTimeout(resolve, 3_000);
          video.onseeked = () => { clearTimeout(done); resolve(); };
          video.currentTime = seconds;
        });
        const c = document.createElement('canvas');
        c.width = 24;
        c.height = 42;
        const cx = c.getContext('2d', { alpha: false });
        if (!cx) throw new Error('no context');
        cx.drawImage(video, 0, 0, 24, 42);
        return [...cx.getImageData(0, 0, 24, 42).data];
      };

      const spread = (a: number[], b: number[]): number => {
        let total = 0;
        for (let i = 0; i < a.length; i++) total += Math.abs((a[i] ?? 0) - (b[i] ?? 0));
        return total / a.length;
      };

      // Beats one, five and seven — three different sub-templates.
      const beatOne = await frameAt(1.8);
      const beatFive = await frameAt(16.5);
      const beatSeven = await frameAt(23.8);

      URL.revokeObjectURL(url);
      return {
        name,
        size: blob.size,
        ...meta,
        oneToFive: spread(beatOne, beatFive),
        oneToSeven: spread(beatOne, beatSeven),
      };
    });

    expect(info.name).toMatch(/\.mp4$/);
    expect(info.w).toBe(1080);
    expect(info.h).toBe(1920);
    // D-004: eight beats summing to 31,000ms minus 1,000ms of overlap.
    expect(info.duration).toBeCloseTo(30, 0);
    expect(info.size).toBeGreaterThan(500_000);

    // Different templates with different photos; a single-beat export would
    // score near zero on both.
    expect(info.oneToFive, 'beats one and five look the same in the export').toBeGreaterThan(8);
    expect(info.oneToSeven, 'beats one and seven look the same in the export').toBeGreaterThan(8);
  });
});


/**
 * §9's custom media, export half.
 *
 * Here rather than in customMedia.spec.ts because this one encodes, and
 * encoding belongs in the serial project (D-048). The preview path fills its
 * frame ring opportunistically; this path awaits it (D-051), and the
 * difference is exactly what this test exists to hold.
 */
test.describe('custom media exports (§9)', () => {
  test('the exported file contains the decoded clip', async ({ page }) => {
    test.skip(process.env['PW_PROD'] === '1', 'Reaches Pro through the development switch, which the public build does not have (D-093).');
    test.setTimeout(180_000);

    await page.addInitScript(() => {
      localStorage.setItem('ms.tier', 'pro');
      const store = globalThis as unknown as { __exported?: { blob: Blob } };
      HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement) {
        if (!this.download) return;
        void fetch(this.href).then((r) => r.blob()).then((blob) => { store.__exported = { blob }; });
      };
    });

    await page.goto(`/?template=quick-pitch&aspect=9:16&frozen=${DROPPED_AT_MS}`);
    await page.waitForSelector('canvas');
    await page.waitForTimeout(2_000);
    await addClip(page);

    await page.getByTitle('Export (⌘E)').click();
    await page.getByRole('button', { name: 'WebM · VP9' }).click();
    await page.getByRole('button', { name: /^Export( again)?$/ }).last().click();
    await page.waitForFunction(
      () => (globalThis as unknown as { __exported?: unknown }).__exported !== undefined,
      undefined,
      { timeout: 140_000 },
    );

    /*
     * Decode the export and sample the same centre patch at a time the overlay
     * is on screen. The export path awaits its prefetch where the preview does
     * not (D-051), so a frame missing here would mean the offline path had
     * quietly baked in a placeholder.
     */
    const sampled = await page.evaluate(async (atMs: number) => {
      const { blob } = (globalThis as unknown as { __exported: { blob: Blob } }).__exported;
      const url = URL.createObjectURL(blob);
      const video = document.createElement('video');
      video.src = url;
      video.muted = true;

      await new Promise<void>((resolvePromise, reject) => {
        video.onloadedmetadata = () => { resolvePromise(); };
        video.onerror = () => { reject(new Error('the export would not decode')); };
      });

      await new Promise<void>((resolvePromise) => {
        const done = setTimeout(resolvePromise, 3_000);
        video.onseeked = () => { clearTimeout(done); resolvePromise(); };
        video.currentTime = atMs / 1000;
      });

      const size = Math.round(Math.min(video.videoWidth, video.videoHeight) * 0.12);
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      const cx = c.getContext('2d', { alpha: false });
      if (!cx) throw new Error('no context');
      cx.drawImage(
        video,
        Math.round(video.videoWidth / 2 - size / 2),
        Math.round(video.videoHeight / 2 - size / 2),
        size, size, 0, 0, size, size,
      );

      const data = cx.getImageData(0, 0, size, size).data;
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < data.length; i += 4) {
        r += data[i] ?? 0;
        g += data[i + 1] ?? 0;
        b += data[i + 2] ?? 0;
      }
      const n = data.length / 4;
      URL.revokeObjectURL(url);
      return { r: r / n, g: g / n, b: b / n };
    }, DROPPED_AT_MS + BAND.green);

    expect(nearestBand(sampled)).toBe('green');
  });});

/**
 * §15's M6 criterion: "a 30s export has in-sync audio in both MP4 and WebM".
 *
 * The fixture alternates one-second bursts of tone with one-second silences,
 * so synchronisation is testable with an RMS window and no FFT: aligned audio
 * is loud at 0.5s, silent at 1.5s, loud at 2.5s. A track that drifts by a
 * quarter second smears the pattern; one that drifts by a second inverts it.
 *
 * Both containers, because they take completely different encoders — Opus
 * natively through WebCodecs, AAC through D-010's polyfill where the browser
 * lacks it.
 */
test.describe('audio export (§10, M6)', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(EXPORT_TIMEOUT_MS + 90_000);
    await captureDownloads(page);
    await page.addInitScript({ content: RMS_SOURCE });
  });

  for (const format of ['mp4', 'webm'] as const) {
    test(`${format.toUpperCase()} carries the music, in sync`, async ({ page }) => {
      await page.goto('/?template=quick-pitch&aspect=9:16');
      await page.waitForSelector('canvas');
      await page.waitForTimeout(2_000);

      await addMusic(page);
      await runExport(page, format);
      await waitForExport(page, 140_000);

      const analysis = await page.evaluate(async (points: number[]) => {
        const { blob } = (globalThis as unknown as { __exported: { blob: Blob } }).__exported;
        const rms = (globalThis as unknown as {
          __rmsAt: (b: Blob, p: number[], w: number) => Promise<{
            durationS: number; channels: number; sampleRate: number; levels: number[];
          }>;
        }).__rmsAt;
        // A 300ms window, comfortably inside a one-second band even allowing
        // for the encoder's own priming delay.
        return rms(blob, points, 0.3);
      }, EXPECTED.map((e) => e.atS));

      // The file genuinely has an audio track, not just a video one.
      expect(analysis.channels).toBeGreaterThan(0);
      expect(analysis.sampleRate).toBeGreaterThan(0);

      // §10: the mix is cut to the video's length, so both tracks agree.
      expect(analysis.durationS).toBeGreaterThan(14);
      expect(analysis.durationS).toBeLessThan(16);

      /*
       * The alignment itself. Loud windows have to be far above the silent
       * ones — not merely different, because a lossy codec leaks a little
       * energy into silence and ringing would otherwise pass as signal.
       */
      const levels = analysis.levels;

      for (const [index, expected] of EXPECTED.entries()) {
        const level = levels[index] ?? 0;
        if (expected.loud) {
          expect(level, `${expected.atS}s should be a burst`).toBeGreaterThan(0.05);
        } else {
          expect(level, `${expected.atS}s should be silent`).toBeLessThan(0.02);
        }
      }
    });
  }
});

test.describe('saving to Photos on a phone (D-125)', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(EXPORT_TIMEOUT_MS);
    await captureDownloads(page);
    // A touch screen that can share files, as an iPhone's Safari is. The
    // sheet itself belongs to the phone; what is checked is that the finished
    // video goes to it, whole, from the tap — and not to a download first.
    await page.addInitScript(() => {
      const real = window.matchMedia.bind(window);
      window.matchMedia = (query: string): MediaQueryList => (query === '(pointer: coarse)'
        ? { matches: true, media: query, onchange: null, addListener: () => undefined, removeListener: () => undefined, addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => false }
        : real(query));
      const store = globalThis as unknown as { __shared?: { name: string; size: number; type: string } };
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: (data?: ShareData) => (data?.files?.length ?? 0) > 0 });
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: (data: ShareData) => {
          const file = data.files?.[0];
          if (file) store.__shared = { name: file.name, size: file.size, type: file.type };
          return Promise.resolve();
        },
      });
    });
  });

  test('the finished video is offered to Photos, not dropped in Files', async ({ page }) => {
    await page.goto('/?template=type-typewriter&aspect=1:1');
    await page.waitForSelector('canvas');
    await page.waitForTimeout(1_500);
    await page.getByTitle('Export (⌘E)').click();
    await page.getByRole('button', { name: '720p' }).click();
    await page.getByRole('button', { name: /^Export$/ }).last().click();

    const offer = page.locator('[data-save-to-photos]');
    await expect(offer).toBeVisible({ timeout: 180_000 });
    // No download behind the person's back.
    expect(await page.evaluate(() => (globalThis as unknown as { __exported?: unknown }).__exported)).toBeUndefined();

    await offer.getByRole('button', { name: /^(Save to Photos|Save or share)$/ }).click();
    const shared = await page.evaluate(() => (globalThis as unknown as { __shared?: { name: string; size: number; type: string } }).__shared);
    expect(shared?.name).toMatch(/\.mp4$/);
    expect(shared?.type).toBe('video/mp4');
    expect(shared?.size ?? 0).toBeGreaterThan(10_000);

    // Files is still there for whoever wants it.
    await offer.getByRole('button', { name: 'Save to Files instead' }).click();
    await waitForExport(page, 10_000);
  });
});
