import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';

/**
 * `npm run brand` — every icon the app ships, cut from the owner's own mark.
 *
 * The source is the Q artwork supplied for the product (brand/q-source-dark.webp):
 * a Q on a flat navy field, with the company's wordmark underneath. Only the
 * Q is used. It is cut from the source at its measured bounds and set on the
 * same navy, so every size is the same mark rather than a redrawing of it.
 *
 *   icon-192.png, icon-512.png   rounded tile on transparency — what browsers
 *                                show in install prompts and tab strips
 *   icon-maskable-512.png        full-bleed tile, the Q inside the 80% safe
 *                                circle Android masks icons to
 *   apple-touch-icon.png         full-bleed 180px; iOS rounds the corners itself
 *   favicon-48.png, favicon-32.png
 *   brand-q.png                  the top bar's mark, 96px for sharpness at 2–3×
 *
 * Run in Chromium because it decodes WebP and draws with the same canvas the
 * app uses, and it is already here for the visual suite.
 */

const SOURCE = 'brand/q-source-dark.webp';
/** Where the Q sits in the source, measured from its pixels (with a hair of margin). */
const Q = { x: 370, y: 266, w: 448, h: 364 } as const;
/** The source's own field colour, sampled — so the cut has no visible seam. */
const FIELD = '#010315';

type Output = {
  readonly file: string;
  readonly size: number;
  /** How much of the tile's width the Q takes. */
  readonly fill: number;
  /** Corner radius as a fraction of the tile; 0 is full-bleed. */
  readonly radius: number;
};

const OUTPUTS: readonly Output[] = [
  { file: 'public/icon-512.png', size: 512, fill: 0.74, radius: 0.22 },
  { file: 'public/icon-192.png', size: 192, fill: 0.74, radius: 0.22 },
  { file: 'public/icon-maskable-512.png', size: 512, fill: 0.6, radius: 0 },
  { file: 'public/apple-touch-icon.png', size: 180, fill: 0.7, radius: 0 },
  { file: 'public/favicon-48.png', size: 48, fill: 0.84, radius: 0.22 },
  { file: 'public/favicon-32.png', size: 32, fill: 0.86, radius: 0.2 },
  { file: 'public/brand-q.png', size: 96, fill: 0.8, radius: 0.24 },
];

async function main(): Promise<void> {
  const base64 = readFileSync(SOURCE).toString('base64');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    for (const output of OUTPUTS) {
      const png = await page.evaluate(async ({ base64, q, field, output }) => {
        const image = new Image();
        image.src = `data:image/webp;base64,${base64}`;
        await image.decode();

        const canvas = document.createElement('canvas');
        canvas.width = output.size;
        canvas.height = output.size;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('no 2d context');
        ctx.imageSmoothingQuality = 'high';

        const s = output.size;
        const r = s * output.radius;
        ctx.beginPath();
        ctx.roundRect(0, 0, s, s, r);
        ctx.fillStyle = field;
        ctx.fill();
        ctx.clip();

        const w = s * output.fill;
        const h = w * (q.h / q.w);
        ctx.drawImage(image, q.x, q.y, q.w, q.h, (s - w) / 2, (s - h) / 2, w, h);
        return canvas.toDataURL('image/png').split(',')[1] ?? '';
      }, { base64, q: Q, field: FIELD, output });

      writeFileSync(output.file, Buffer.from(png, 'base64'));
      console.log(`${output.file}  ${output.size}px`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
  console.error('brand icons failed:', error);
  process.exitCode = 1;
});
