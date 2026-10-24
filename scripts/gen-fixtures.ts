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
  /*
   * With sound (D-163): a 440Hz tone through the red and blue bands, silence
   * through green and yellow — the same loud-quiet shape as beat-bands.wav, so
   * a test can tell whether a video's sound is in the mix, and in step with
   * its picture, from an RMS window.
   */
  let audio = null;
  let level = null;
  if (options.sound) {
    audio = new AudioContext({ sampleRate: 48000 });
    const tone = audio.createOscillator();
    tone.frequency.value = 440;
    level = audio.createGain();
    level.gain.value = 0;
    const out = audio.createMediaStreamDestination();
    tone.connect(level);
    level.connect(out);
    tone.start();
    out.stream.getAudioTracks().forEach(function (track) { stream.addTrack(track); });
  }
  const codecs = options.sound ? 'vp9,opus' : 'vp9';
  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=' + codecs)
    ? 'video/webm;codecs=' + codecs
    : 'video/webm';
  const recorder = new MediaRecorder(stream, { mimeType: mimeType, videoBitsPerSecond: 1200000 });
  const chunks = [];

  return new Promise(function (resolvePromise, rejectPromise) {
    recorder.ondataavailable = function (event) {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onerror = function () { rejectPromise(new Error('MediaRecorder failed')); };
    recorder.onstop = function () {
      if (audio) void audio.close();
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
    let lastBand = -1;

    const paint = function () {
      const elapsed = performance.now() - began;
      const total = options.bands.length * options.bandMs;
      if (elapsed >= total) {
        recorder.stop();
        return;
      }
      const index = Math.min(options.bands.length - 1, Math.floor(elapsed / options.bandMs));
      if (audio && index !== lastBand) {
        // Switched with the picture, on the same frame, so the two stay in step.
        level.gain.setValueAtTime(index % 2 === 0 ? 0.5 : 0, audio.currentTime);
      }
      lastBand = index;
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

/**
 * A second, longer track (§10).
 *
 * Real music is longer than the piece it scores, and that is the case the
 * timeline used to handle worst — a clip running past the end of the video had
 * its far edge off the lane entirely. Forty seconds against a fifteen-second
 * ad reproduces it. 16kHz mono keeps a fixture that only has to carry a test
 * tone down to about a megabyte.
 */
const LONG_SECONDS = 40;
const LONG_RATE = 16_000;

function buildWav(seconds = AUDIO_SECONDS, rate = AUDIO_RATE): Buffer {
  const frames = seconds * rate;
  const samples = Buffer.alloc(frames * 2);

  for (let i = 0; i < frames; i++) {
    const second = Math.floor(i / rate);
    const loud = second % 2 === 0;
    // A short raised-cosine at each edge, so the bursts do not click — a
    // discontinuity would spread energy across the spectrum and muddy any
    // later analysis.
    const intoSecond = (i % rate) / rate;
    const edge = Math.min(1, Math.min(intoSecond, 1 - intoSecond) / 0.01);
    const amplitude = loud ? 0.7 * edge : 0;
    const value = Math.sin((2 * Math.PI * AUDIO_TONE_HZ * i) / rate) * amplitude;
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
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28); // byte rate
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

  const long = buildWav(LONG_SECONDS, LONG_RATE);
  await writeFile(resolve(OUT_DIR, 'long-bands.wav'), long);
  console.log(
    `Wrote tests/fixtures/long-bands.wav — ${(long.length / 1024).toFixed(0)} KB, ` +
    `${LONG_SECONDS}s at ${LONG_RATE}Hz, for the overhang case.`,
  );

  // PW_CHROMIUM points at a browser of your own, where Playwright's is not installed.
  const executablePath = process.env['PW_CHROMIUM'];
  const browser = await chromium.launch({
    args: ['--autoplay-policy=no-user-gesture-required'],
    ...(executablePath ? { executablePath } : {}),
  });
  const page = await browser.newPage();
  await page.setContent('<!doctype html><meta charset="utf-8"><body></body>');
  await page.addScriptTag({ content: PAGE_SOURCE });

  const record = (sound: boolean): Promise<string> => page.evaluate(
    (options: { size: number; fps: number; bandMs: number; sound: boolean; bands: readonly { name: string; css: string }[] }) =>
      (globalThis as unknown as {
        __recordBands: (o: typeof options) => Promise<string>;
      }).__recordBands(options),
    { size: SIZE, fps: FPS, bandMs: BAND_MS, sound, bands: BANDS },
  );
  const silent = await record(false);
  const withSound = await record(true);

  await browser.close();

  for (const [file, dataUrl, what] of [
    ['colour-bands.webm', silent, 'no sound'],
    ['colour-bands-sound.webm', withSound, 'a 440Hz tone through red and blue, silence through green and yellow'],
  ] as const) {
    const base64 = dataUrl.split(',')[1];
    if (!base64) throw new Error('the recording produced no data');
    const bytes = Buffer.from(base64, 'base64');
    await writeFile(resolve(OUT_DIR, file), bytes);
    console.log(
      `Wrote tests/fixtures/${file} — ${(bytes.length / 1024).toFixed(0)} KB, ` +
      `${BANDS.length * BAND_MS}ms of ${BANDS.map((b) => b.name).join(', ')}; ${what}.`,
    );
  }
}

main().catch((error: unknown) => {
  console.error('gen-fixtures failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
