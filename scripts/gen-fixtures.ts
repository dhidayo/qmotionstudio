import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/**
 * `npm run fixtures` — builds the test media for §9 and §10.
 *
 * A real encoded file, not a stub: the point of the custom-media tests is that
 * a container is demuxed and a codec decoded, and a fake would prove neither.
 *
 * The clip is four one-second bands of flat, maximally distinct colour. That
 * shape is what lets a test assert the *right* frame is on screen at a given
 * instant rather than merely that something drew — a ring buffer handing back
 * a stale frame after a seek passes the weaker assertion and fails this one.
 *
 * Encoded with MediaRecorder for the same reason `npm run thumbs` is (D-007):
 * §16 forbids captureStream as the primary *export* path, and a build-time
 * fixture is not that.
 *
 * The page code is injected as source because esbuild's `keepNames` rewrites
 * named functions to call a helper that does not exist in the page (D-031).
 */

const OUT_DIR = resolve(process.cwd(), 'tests/fixtures');

const SIZE = 240;
const FPS = 15;
const BAND_MS = 1_000;

/** Flat, far apart in RGB, and none of them close to the editor's palettes. */
const BANDS = [
  { name: 'red', css: '#e02020' },
  { name: 'green', css: '#20c040' },
  { name: 'blue', css: '#2040e0' },
  { name: 'yellow', css: '#e0d020' },
] as const;

const PAGE_SOURCE = `
window.__recordBands = function (options) {
  const canvas = document.createElement('canvas');
  canvas.width = options.size;
  canvas.height = options.size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');

  const stream = canvas.captureStream(options.fps);
  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : 'video/webm';
  const recorder = new MediaRecorder(stream, { mimeType: mimeType, videoBitsPerSecond: 1200000 });
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
      reader.onerror = function () { rejectPromise(new Error('could not read the recording')); };
      reader.readAsDataURL(blob);
    };

    // Paint the first band before recording starts, so frame zero is already
    // the colour the test expects rather than a blank canvas.
    ctx.fillStyle = options.bands[0].css;
    ctx.fillRect(0, 0, options.size, options.size);

    recorder.start();
    const began = performance.now();

    const paint = function () {
      const elapsed = performance.now() - began;
      const total = options.bands.length * options.bandMs;
      if (elapsed >= total) {
        recorder.stop();
        return;
      }
      const index = Math.min(options.bands.length - 1, Math.floor(elapsed / options.bandMs));
      ctx.fillStyle = options.bands[index].css;
      ctx.fillRect(0, 0, options.size, options.size);
      requestAnimationFrame(paint);
    };
    requestAnimationFrame(paint);
  });
};
`;

/**
 * A WAV of alternating one-second bursts and silences (§10).
 *
 * Amplitude rather than pitch, so a test can prove synchronisation with an RMS
 * window and no FFT: if the export's audio is aligned, 0.5s is loud, 1.5s is
 * silent, 2.5s is loud. Shift the track by even a quarter second and the
 * pattern inverts, which is the whole point.
 *
 * Written by hand as 16-bit PCM — no browser, no encoder, and a container that
 * every decoder agrees about.
 */
const AUDIO_SECONDS = 12;
const AUDIO_RATE = 48_000;
const AUDIO_TONE_HZ = 440;

function buildWav(): Buffer {
  const frames = AUDIO_SECONDS * AUDIO_RATE;
  const samples = Buffer.alloc(frames * 2);

  for (let i = 0; i < frames; i++) {
    const second = Math.floor(i / AUDIO_RATE);
    const loud = second % 2 === 0;
    // A short raised-cosine at each edge, so the bursts do not click — a
    // discontinuity would spread energy across the spectrum and muddy any
    // later analysis.
    const intoSecond = (i % AUDIO_RATE) / AUDIO_RATE;
    const edge = Math.min(1, Math.min(intoSecond, 1 - intoSecond) / 0.01);
    const amplitude = loud ? 0.7 * edge : 0;
    const value = Math.sin((2 * Math.PI * AUDIO_TONE_HZ * i) / AUDIO_RATE) * amplitude;
    samples.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(value * 32767))), i * 2);
  }

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + samples.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);          // PCM chunk size
  header.writeUInt16LE(1, 20);           // format: PCM
  header.writeUInt16LE(1, 22);           // channels: mono
  header.writeUInt32LE(AUDIO_RATE, 24);
  header.writeUInt32LE(AUDIO_RATE * 2, 28); // byte rate
  header.writeUInt16LE(2, 32);           // block align
  header.writeUInt16LE(16, 34);          // bits per sample
  header.write('data', 36);
  header.writeUInt32LE(samples.length, 40);

  return Buffer.concat([header, samples]);
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });

  const wav = buildWav();
  await writeFile(resolve(OUT_DIR, 'beat-bands.wav'), wav);
  console.log(
    `Wrote tests/fixtures/beat-bands.wav — ${(wav.length / 1024).toFixed(0)} KB, ` +
    `${AUDIO_SECONDS}s of alternating ${AUDIO_TONE_HZ}Hz bursts and silence.`,
  );

  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  await page.setContent('<!doctype html><meta charset="utf-8"><body></body>');
  await page.addScriptTag({ content: PAGE_SOURCE });

  const dataUrl = await page.evaluate(
    (options: { size: number; fps: number; bandMs: number; bands: readonly { name: string; css: string }[] }) =>
      (globalThis as unknown as {
        __recordBands: (o: typeof options) => Promise<string>;
      }).__recordBands(options),
    { size: SIZE, fps: FPS, bandMs: BAND_MS, bands: BANDS },
  );

  await browser.close();

  const base64 = dataUrl.split(',')[1];
  if (!base64) throw new Error('the recording produced no data');
  const bytes = Buffer.from(base64, 'base64');

  const path = resolve(OUT_DIR, 'colour-bands.webm');
  await writeFile(path, bytes);

  console.log(
    `Wrote tests/fixtures/colour-bands.webm — ${(bytes.length / 1024).toFixed(0)} KB, ` +
    `${BANDS.length * BAND_MS}ms of ${BANDS.map((b) => b.name).join(', ')}.`,
  );
}

main().catch((error: unknown) => {
  console.error('gen-fixtures failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
