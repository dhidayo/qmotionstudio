import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/**
 * PWA icons, generated from `public/favicon.svg` (§13).
 *
 * Generated rather than hand-authored, for the same reason §7 forbids
 * hand-made thumbnails: two files that are supposed to be the same picture
 * will drift the moment one of them is edited. The SVG is the source; these
 * are photographs of it.
 *
 *   npm run icons
 */

const SIZES = [192, 512] as const;
const ROOT = process.cwd();

async function main(): Promise<void> {
  const svg = await readFile(resolve(ROOT, 'public/favicon.svg'), 'utf8');
  const browser = await chromium.launch();

  try {
    for (const size of SIZES) {
      const page = await browser.newPage({
        viewport: { width: size, height: size },
        deviceScaleFactor: 1,
      });
      // No margin, no background: the mark's own rounded rect is the icon, and
      // a maskable icon is cropped by the platform rather than by us.
      await page.setContent(
        `<style>html,body{margin:0;padding:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
      );
      const shot = await page.screenshot({ omitBackground: true });
      await writeFile(resolve(ROOT, `public/icon-${size}.png`), shot);
      await page.close();
      console.log(`icon-${size}.png`);
    }
  } finally {
    await browser.close();
  }
}

await main();
