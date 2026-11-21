import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';

/**
 * `npm run brand` — every icon the app ships, from one drawing (D-175).
 *
 * The source is brand/q-mark.svg: the Q redrawn for Soft editorial · Clay, a
 * paper ring on an ink tile with its tail in clay, simple enough to read at
 * 16px. It replaces the mark cut from the owner's navy artwork
 * (brand/q-source-*.webp, kept as the record). The same file is the
 * browser's own icon (public/favicon.svg); these are the PNGs everything
 * else still asks for, under the names they always had.
 *
 *   icon-192.png, icon-512.png   rounded tile on transparency — what browsers
 *                                show in install prompts and tab strips
 *   icon-maskable-512.png        full-bleed tile, the Q inside the 80% safe
 *                                circle Android masks icons to
 *   apple-touch-icon.png         full-bleed 180px; iOS rounds the corners itself
 *   favicon-48.png, favicon-32.png
 *   brand-q.png                  the top bar's mark, 96px for sharpness at 2–3×
 *
 * Rasterised in Chromium, already here for the visual suite: no new tool.
 * `PW_CHROMIUM` names a browser to use where Playwright's own is not installed.
 */

const SOURCE = 'brand/q-mark.svg';
/** The tile's ink, as in the drawing. */
const FIELD = '#211d18';

type Output = {
  readonly file: string;
  readonly size: number;
  /** How much of the tile's width the mark's 64-unit box takes. */
  readonly fill: number;
  /** Corner radius as a fraction of the tile; 0 is full-bleed. */
  readonly radius: number;
};

const OUTPUTS: readonly Output[] = [
  { file: 'public/icon-512.png', size: 512, fill: 1, radius: 0.234 },
  { file: 'public/icon-192.png', size: 192, fill: 1, radius: 0.234 },
  { file: 'public/icon-maskable-512.png', size: 512, fill: 0.78, radius: 0 },
  { file: 'public/apple-touch-icon.png', size: 180, fill: 0.92, radius: 0 },
  { file: 'public/favicon-48.png', size: 48, fill: 1, radius: 0.234 },
  { file: 'public/favicon-32.png', size: 32, fill: 1, radius: 0.234 },
  { file: 'public/brand-q.png', size: 96, fill: 1, radius: 0.234 },
];

/** The drawing without its tile, title or notes: the ring and the tail, on a 64-unit box. */
function markOnly(svg: string): string {
  return svg
    .replace(/<rect[^>]*\/>/, '')
    .replace(/<title>[^<]*<\/title>/, '')
    .replace(/<!--[\s\S]*?-->/g, '');
}

/** The tile at `size`, then the mark scaled into it: one SVG per icon. */
function iconSvg(mark: string, output: Output): string {
  const s = output.size;
  const box = s * output.fill;
  const offset = (s - box) / 2;
  return mark
    .replace(
      /<svg[^>]*>/,
      `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">`
        + `<rect width="${s}" height="${s}" rx="${s * output.radius}" fill="${FIELD}"/>`
        + `<g transform="translate(${offset} ${offset}) scale(${box / 64})">`,
    )
    .replace('</svg>', '</g></svg>');
}

async function main(): Promise<void> {
  const mark = markOnly(readFileSync(SOURCE, 'utf8'));
  const executablePath = process.env['PW_CHROMIUM'];
  const browser = await chromium.launch(executablePath === undefined ? {} : { executablePath });
  try {
    const page = await browser.newPage();
    for (const output of OUTPUTS) {
      const png = await page.evaluate(async ({ svg, size }) => {
        const image = new Image();
        image.src = `data:image/svg+xml;base64,${btoa(svg)}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('no 2d context');
        ctx.drawImage(image, 0, 0, size, size);
        return canvas.toDataURL('image/png').split(',')[1] ?? '';
      }, { svg: iconSvg(mark, output), size: output.size });

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
