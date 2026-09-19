import { expect, test, type Page } from '@playwright/test';
import { addMusic } from '../support/audio';

/**
 * §10's audio, editor half — import, trim, gain, fades and the waveform.
 *
 * The export half (§15's M6 criterion, "a 30s export has in-sync audio in both
 * MP4 and WebM") lives in export.spec.ts, which runs serially because encoding
 * competes for cores (D-048).
 */

test.use({ viewport: { width: 1500, height: 940 } });

async function openAd(page: Page): Promise<void> {
  await page.goto('/?template=quick-pitch&aspect=9:16&frozen=1000');
  await page.waitForSelector('canvas');
  await page.waitForTimeout(2_000);
}

test.describe('music (§10)', () => {
  test('an imported track appears on the music row with a waveform', async ({ page }) => {
    await openAd(page);

    await expect(page.getByText('No music. Use “+ Music” above.')).toBeVisible();
    await addMusic(page);

    const clip = page.getByRole('button', { name: /^Music clip/ });
    await expect(clip).toBeVisible();

    /*
     * The waveform is drawn from the precomputed peaks; an undecoded track
     * shows "Decoding…" instead, so peaks are proof the decode landed.
     *
     * Asserted by counting and by measuring, not with toBeVisible: a vertical
     * <line> has a zero-width bounding box, which Playwright reports as hidden
     * even when it is on screen with correct coordinates.
     */
    await expect(clip.getByText('Decoding…')).toBeHidden();
    expect(await clip.locator('line').count()).toBeGreaterThan(50);

    // Some of them have height — a silent or undrawn track would be flat.
    const spread = await clip.locator('line').evaluateAll((nodes) =>
      nodes.reduce((max, node) => {
        const y1 = Number(node.getAttribute('y1') ?? 0);
        const y2 = Number(node.getAttribute('y2') ?? 0);
        return Math.max(max, Math.abs(y2 - y1));
      }, 0),
    );
    expect(spread, 'the waveform is flat').toBeGreaterThan(1);
  });

  test('the clip takes its length from the track', async ({ page }) => {
    await openAd(page);
    await addMusic(page);

    // The fixture is twelve seconds; quick-pitch is fifteen.
    await expect(page.getByRole('button', { name: /^Music clip, 12\.0 seconds/ })).toBeVisible();
  });

  test('gain and fades are editable and reflected on the track', async ({ page }) => {
    await openAd(page);
    await addMusic(page);

    await page.getByLabel('Volume').fill('-12');
    await expect(page.getByText('25%')).toBeVisible();

    const clip = page.getByRole('button', { name: /^Music clip/ });
    const before = await clip.locator('line').nth(4).getAttribute('y1');

    await page.getByLabel('Fade in').fill('4000');
    await page.waitForTimeout(300);

    // The waveform is drawn through the envelope, so a fade visibly flattens
    // the opening of the clip rather than only changing a number.
    const after = await clip.locator('line').nth(4).getAttribute('y1');
    expect(after).not.toBe(before);
  });

  test('overlapping fades are scaled rather than fought over', async ({ page }) => {
    await openAd(page);
    await addMusic(page);

    await page.getByLabel('Fade in').fill('8000');
    await page.getByLabel('Fade out').fill('8000');

    await expect(page.getByText(/scaled down in proportion/)).toBeVisible();
  });

  test('removing the track returns the inspector to the scene', async ({ page }) => {
    await openAd(page);
    await addMusic(page);

    await page.getByRole('button', { name: 'Remove music' }).click();

    await expect(page.getByLabel('Music inspector')).toBeHidden();
    await expect(page.getByText('No music. Use “+ Music” above.')).toBeVisible();
  });

  test('a file that will not decode is refused, not silently ignored', async ({ page }) => {
    await openAd(page);

    await page.getByLabel('Add a music track').setInputFiles({
      name: 'broken.wav',
      mimeType: 'audio/wav',
      buffer: Buffer.from('RIFFnope'),
    });

    // §16 again: the alternative is a music row that stays stubbornly empty.
    await expect(page.getByText(/Could not decode "broken\.wav"/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByLabel('Music inspector')).toBeHidden();
  });

  test('the audio clock masters the preview (§10)', async ({ page }) => {
    // ?frozen parks the transport, so Play is available to click — and a real
    // click is the user gesture an AudioContext needs before it will resume.
    await page.goto('/?template=quick-pitch&aspect=9:16&frozen=0');
    await page.waitForSelector('canvas');
    await page.waitForTimeout(2_000);
    await addMusic(page);

    await page.getByRole('button', { name: 'Play' }).click();
    await page.waitForTimeout(1_500);

    const read = async (): Promise<{ timeMs: number; mastered: boolean; playing: boolean }> =>
      page.evaluate(() => {
        const handle = (globalThis as unknown as {
          __motionStudio?: {
            clock: { timeMs: () => number; playing: () => boolean; audioMastered: () => boolean };
          };
        }).__motionStudio;
        if (!handle) throw new Error('no dev handle');
        return {
          timeMs: handle.clock.timeMs(),
          mastered: handle.clock.audioMastered(),
          playing: handle.clock.playing(),
        };
      });

    const first = await read();
    expect(first.playing, 'the transport is running').toBe(true);

    /*
     * §10 budgets under one frame of drift across a sixty-second preview. That
     * is met structurally rather than numerically (D-054): while audio is
     * sounding it *is* the clock, so there is nothing for the visual loop to
     * drift against. This asserts that the swap actually happened — a preview
     * still accumulating wall-clock deltas would report false here and meet
     * the budget only by luck.
     */
    expect(first.mastered, 'the audio clock is mastering the preview').toBe(true);

    // And that time is genuinely advancing on that clock, not frozen.
    await page.waitForTimeout(1_200);
    const second = await read();
    expect(second.timeMs).toBeGreaterThan(first.timeMs);

    // Real time, not a runaway: about a second of wall clock is about a second
    // of timeline. Loose bounds, because a loaded CI box is not a metronome.
    const advanced = second.timeMs - first.timeMs;
    expect(advanced, `advanced ${advanced.toFixed(0)}ms in ~1200ms`).toBeGreaterThan(600);
    expect(advanced).toBeLessThan(2_200);
  });

  test('⌘Z puts back a removed track', async ({ page }) => {
    await openAd(page);
    await addMusic(page);
    await page.getByRole('button', { name: 'Remove music' }).click();
    await expect(page.getByText('No music. Use “+ Music” above.')).toBeVisible();

    await page.keyboard.press('ControlOrMeta+z');
    await expect(page.getByRole('button', { name: /^Music clip/ })).toBeVisible();
  });
});
