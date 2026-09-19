import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/**
 * Generates the sample photo set used by `npm run thumbs` and by §8.1's
 * "Try sample photos".
 *
 * These are synthesised, not photographed (D-030). Stock photography would mean
 * a licence to track and attribute for something that only ever stands in for
 * the user's own pictures; abstract compositions carry no such baggage, are
 * deterministic, and make template thumbnails read as design rather than as
 * someone else's holiday.
 *
 * Drawn in a real browser because Node has no canvas, and encoded straight to
 * WebP via toDataURL — which avoids pulling in an image library to convert a
 * PNG, and keeps the dependency list to what §4 already allows.
 *
 * ── Why the drawing code is a string ───────────────────────────────────────
 * tsx compiles this file with esbuild, which has `keepNames` on and rewrites
 * named functions to call a `__name()` helper. Playwright serialises a function
 * passed to page.evaluate and runs it in the browser, where that helper does
 * not exist — so passing the drawing function directly fails with
 * "__name is not defined". Injecting it as source sidesteps the transform
 * entirely. It costs type-checking inside DRAW_SOURCE, which is an acceptable
 * trade for a build script that draws eight placeholder images.
 */

const OUT_DIR = resolve(process.cwd(), 'public/samples');

type Sample = {
  readonly name: string;
  readonly w: number;
  readonly h: number;
  readonly seed: number;
  readonly hues: readonly [number, number, number];
};

/** Deliberately mixed orientations, so cover-cropping is exercised by the set. */
const SAMPLES: readonly Sample[] = [
  { name: 'dune', w: 1120, h: 1400, seed: 11, hues: [28, 14, 40] },
  { name: 'tide', w: 1400, h: 1050, seed: 23, hues: [196, 172, 214] },
  { name: 'canopy', w: 1200, h: 1200, seed: 37, hues: [138, 96, 160] },
  { name: 'ember', w: 1120, h: 1400, seed: 51, hues: [12, 32, 348] },
  { name: 'slate', w: 1400, h: 980, seed: 67, hues: [220, 238, 206] },
  { name: 'bloom', w: 1100, h: 1320, seed: 83, hues: [320, 288, 342] },
  { name: 'dusk', w: 1400, h: 933, seed: 97, hues: [258, 228, 290] },
  { name: 'reef', w: 1200, h: 1200, seed: 113, hues: [168, 190, 148] },
];

const DRAW_SOURCE = `
window.__drawSample = function (sample) {
  const canvas = document.createElement('canvas');
  canvas.width = sample.w;
  canvas.height = sample.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');

  // Deterministic PRNG, so a seed always yields the same picture.
  let state = (sample.seed * 2654435761) >>> 0;
  const random = function () {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const pick = function (a, b) { return a + random() * (b - a); };

  const W = sample.w, H = sample.h;
  const D = Math.max(W, H);
  const h1 = sample.hues[0], h2 = sample.hues[1], h3 = sample.hues[2];

  // ── Ground: a two-tone split, which gives the eye a horizon to read ──────
  const horizon = H * pick(0.42, 0.68);
  const sky = ctx.createLinearGradient(0, 0, W * 0.3, horizon);
  sky.addColorStop(0, 'hsl(' + h1 + ' 55% ' + pick(34, 48) + '%)');
  sky.addColorStop(1, 'hsl(' + h2 + ' 48% ' + pick(20, 30) + '%)');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, horizon);

  const ground = ctx.createLinearGradient(0, horizon, W * 0.4, H);
  ground.addColorStop(0, 'hsl(' + h3 + ' 44% ' + pick(16, 24) + '%)');
  ground.addColorStop(1, 'hsl(' + h2 + ' 40% ' + pick(7, 13) + '%)');
  ctx.fillStyle = ground;
  ctx.fillRect(0, horizon - 1, W, H - horizon + 1);

  // ── Hard-edged geometry: the structure a gradient alone cannot provide ───
  const shapes = 5 + Math.floor(random() * 3);
  for (let i = 0; i < shapes; i++) {
    const hue = [h1, h2, h3][i % 3];
    const alpha = pick(0.14, 0.42);
    ctx.save();
    ctx.translate(pick(-0.1, 1.1) * W, pick(-0.05, 1.05) * H);
    ctx.rotate(pick(-0.8, 0.8));
    ctx.fillStyle = 'hsl(' + (hue + pick(-20, 20)) + ' ' + pick(45, 75) + '% ' + pick(30, 68) + '% / ' + alpha + ')';

    const kind = i % 3;
    if (kind === 0) {
      const r = pick(0.1, 0.34) * D;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
    } else if (kind === 1) {
      const w = pick(0.16, 0.6) * D, h = pick(0.05, 0.2) * D;
      ctx.fillRect(-w / 2, -h / 2, w, h);
    } else {
      const r = pick(0.12, 0.3) * D;
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r * 0.92, r * 0.6);
      ctx.lineTo(-r * 0.92, r * 0.6);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // ── A bright source, to give the frame a focal point ─────────────────────
  const gx = pick(0.2, 0.8) * W, gy = pick(0.15, 0.55) * H;
  const glow = ctx.createRadialGradient(gx, gy, 0, gx, gy, pick(0.28, 0.5) * D);
  glow.addColorStop(0, 'hsl(' + h1 + ' 80% 72% / 0.55)');
  glow.addColorStop(0.45, 'hsl(' + h1 + ' 66% 52% / 0.18)');
  glow.addColorStop(1, 'hsl(' + h1 + ' 60% 40% / 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // ── Fine lines, for high-frequency detail ────────────────────────────────
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < 3; i++) {
    ctx.strokeStyle = 'hsl(' + h3 + ' 60% 80% / ' + pick(0.06, 0.16) + ')';
    ctx.lineWidth = Math.max(1, pick(0.0015, 0.005) * D);
    ctx.beginPath();
    ctx.moveTo(pick(-0.1, 0.4) * W, pick(0, 1) * H);
    ctx.lineTo(pick(0.6, 1.1) * W, pick(0, 1) * H);
    ctx.stroke();
  }
  ctx.restore();

  // ── Vignette ─────────────────────────────────────────────────────────────
  const vignette = ctx.createRadialGradient(
    W / 2, H / 2, Math.min(W, H) * 0.28,
    W / 2, H / 2, D * 0.74
  );
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);

  // ── Grain. Without it these read as vector art rather than as images. ────
  const image = ctx.getImageData(0, 0, W, H);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const noise = (random() - 0.5) * 14;
    data[i] = Math.max(0, Math.min(255, data[i] + noise));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
  }
  ctx.putImageData(image, 0, 0);

  return canvas.toDataURL('image/webp', 0.8);
};
`;

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });

  console.log('Launching headless Chromium…');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent('<!doctype html><meta charset="utf-8"><body></body>');
  await page.addScriptTag({ content: DRAW_SOURCE });

  let written = 0;
  for (const sample of SAMPLES) {
    const dataUrl = await page.evaluate(
      (s: Sample) =>
        (globalThis as unknown as { __drawSample: (s: Sample) => string }).__drawSample(s),
      sample,
    );

    const base64 = dataUrl.split(',')[1];
    if (!base64) throw new Error(`Sample "${sample.name}" produced no image data.`);

    const bytes = Buffer.from(base64, 'base64');
    await writeFile(resolve(OUT_DIR, `${sample.name}.webp`), bytes);
    console.log(`  ${sample.name.padEnd(8)} ${sample.w}×${sample.h}  ${(bytes.length / 1024).toFixed(0)} KB`);
    written++;
  }

  await browser.close();
  console.log(`\nWrote ${written} samples to public/samples.`);
}

main().catch((error: unknown) => {
  console.error('gen-samples failed:', error);
  process.exitCode = 1;
});
