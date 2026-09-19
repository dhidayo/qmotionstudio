import { expect, test } from '@playwright/test';
import {
  addClip, BAND, centreColour, DROPPED_AT_MS, nearestBand, openProAd, scrubTo,
} from '../support/customMedia';

/**
 * §9's custom media — the last piece of §15's M5 row ("add photo/text/custom
 * media"), finished after the rest of M5 had shipped.
 *
 * The fixture is four one-second bands of flat colour, so these assertions can
 * be about *which* frame is on screen rather than merely that something drew.
 * That distinction matters: a ring buffer that hands back whatever it happens
 * to be holding passes the weak version of this test and fails the real one.
 *
 * Built by `npm run fixtures`. The export half lives in export.spec.ts, which
 * runs serially (D-048) because encoding competes for cores.
 */

test.use({ viewport: { width: 1500, height: 940 } });

test.describe('custom media (§9)', () => {
  test('the button is Pro-gated', async ({ page }) => {
    await page.addInitScript(() => { localStorage.setItem('ms.tier', 'free'); });
    await page.goto('/?template=quick-pitch&aspect=9:16');
    await page.waitForSelector('canvas');
    await page.waitForTimeout(1_500);

    await expect(page.getByRole('button', { name: '+ Media' })).toBeDisabled();

    // §12's dev toggle is the supported way in, and it works without a reload.
    await page.getByRole('button', { name: /^Tier: free/ }).click();
    await expect(page.getByRole('button', { name: '+ Media' })).toBeEnabled();
  });

  test('an uploaded clip decodes and draws', async ({ page }) => {
    await openProAd(page, DROPPED_AT_MS);
    await addClip(page);

    // Dropped at the playhead, so the clip is at its own first band here.
    expect(nearestBand(await centreColour(page))).toBe('red');
  });

  test('the frame follows the playhead through the clip', async ({ page }) => {
    await openProAd(page, DROPPED_AT_MS);
    await addClip(page);

    /*
     * The real assertion. Each scrub lands in a different second of the clip,
     * and the overlay has to show that second's colour — which is only true if
     * the ring buffer is being filled for the requested timestamp rather than
     * serving whatever it decoded first.
     */
    for (const [band, offset] of [['red', BAND.red], ['green', BAND.green], ['blue', BAND.blue]] as const) {
      await scrubTo(page, DROPPED_AT_MS + offset);
      expect(nearestBand(await centreColour(page)), `at clip time ${offset}ms`).toBe(band);
    }
  });

  test('a file with no video track is refused, not silently ignored', async ({ page }) => {
    await openProAd(page, DROPPED_AT_MS);

    await page.getByLabel('Add a video overlay').setInputFiles({
      name: 'broken.webm',
      mimeType: 'video/webm',
      buffer: Buffer.from('this is not a video'),
    });

    // §16: it says so rather than leaving an overlay that never appears.
    await expect(page.getByText(/Could not read "broken\.webm"/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByLabel('Overlay inspector')).toBeHidden();
  });
});
