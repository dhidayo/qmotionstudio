import { expect, test, type Page } from '@playwright/test';

/**
 * M5 — Motion Ads.
 *
 * The milestone's exit criterion is "a 30s multi-scene ad plays and exports
 * correctly". Playing is asserted here; the export half lives in export.spec.ts
 * because encoding is CPU-bound and has to run serially (D-042).
 *
 * Almost everything here samples the *canvas*, not the DOM. A scene compositor
 * that draws the wrong thing still produces a perfectly well-formed timeline,
 * so a test that only reads React output would pass while the product was
 * broken.
 */

test.use({ viewport: { width: 1500, height: 940 } });

/** The eight beats of launch-story, with D-004's overlaps taken out. */
const LAUNCH_STORY_MS = 30_000;

/** Absolute times, derived in the ad template's own comments. */
const BEAT = {
  one: 1_800,
  crossFadeMid: 3_700,     // beats 1→2, 600ms fade centred on 3700
  pushMid: 7_550,          // beats 2→3, 500ms push
  flashPeak: 10_500,       // beats 3→4, 400ms white flash, peaks at the midpoint
  seven: 23_800,           // no transition running
} as const;

async function openAd(page: Page, id: string, frozenMs?: number): Promise<void> {
  const query = frozenMs === undefined ? '' : `&frozen=${frozenMs}`;
  await page.goto(`/?template=${id}&aspect=9:16${query}`);
  await page.waitForSelector('canvas');
  // The ad expands and then fetches one module per beat (D-029), and the
  // sample photos land separately.
  await page.waitForTimeout(2_000);
}

/** Mean luminance of the artboard, sampled sparsely. Enough to tell frames apart. */
async function luminance(page: Page): Promise<number> {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) throw new Error('no artboard');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no context');
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let total = 0;
    let counted = 0;
    for (let i = 0; i < data.length; i += 4 * 97) {
      total += ((data[i] ?? 0) + (data[i + 1] ?? 0) + (data[i + 2] ?? 0)) / 3;
      counted += 1;
    }
    return total / counted;
  });
}

/** A small downsample of the artboard, for comparing two instants. */
async function fingerprint(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) throw new Error('no artboard');
    const small = document.createElement('canvas');
    small.width = 24;
    small.height = 42;
    const cx = small.getContext('2d', { alpha: false });
    if (!cx) throw new Error('no context');
    cx.drawImage(canvas, 0, 0, 24, 42);
    return [...cx.getImageData(0, 0, 24, 42).data];
  });
}

/** quick-pitch, with D-004's overlaps taken out. */
const QUICK_PITCH_MS = 15_000;

/** Neutralises an overlay's entrance and exit, so it is fully drawn throughout. */
async function setPresets(page: Page, preset: string): Promise<void> {
  await page.getByRole('group', { name: 'Entrance' }).getByRole('button', { name: preset }).click();
  await page.getByRole('group', { name: 'Exit' }).getByRole('button', { name: preset }).click();
  await page.waitForTimeout(400);
}

/** Drives the timeline ruler the way a pointer would, rather than the clock directly. */
async function scrubTo(page: Page, ms: number, durationMs: number): Promise<void> {
  const ruler = page.getByLabel('Scrub');
  const box = await ruler.boundingBox();
  if (!box) throw new Error('no ruler');
  await ruler.click({ position: { x: box.width * (ms / durationMs), y: 2 } });
  await page.waitForTimeout(400);
}

function difference(a: number[], b: number[]): number {
  let total = 0;
  for (let i = 0; i < a.length; i++) total += Math.abs((a[i] ?? 0) - (b[i] ?? 0));
  return total / a.length;
}

test.describe('scene sequencing', () => {
  test('an ad template expands into its own beats', async ({ page }) => {
    await openAd(page, 'launch-story', BEAT.one);

    await expect(page.getByLabel('Timeline')).toBeVisible();
    await expect(page.getByText('8 scenes · 0 overlays')).toBeVisible();
    await expect(page.getByText('Scene 1 of 8')).toBeVisible();

    // The advertised length is the rendered length (D-004 from both sides).
    const total = await page.getByLabel('Scrub').getAttribute('aria-valuemax');
    expect(Number(total)).toBe(LAUNCH_STORY_MS);
  });

  test('different beats draw different frames', async ({ page }) => {
    await openAd(page, 'launch-story', BEAT.one);
    const first = await fingerprint(page);

    await openAd(page, 'launch-story', BEAT.seven);
    const seventh = await fingerprint(page);

    // Not a subtle difference: these are different templates with different
    // photos. A compositor stuck on scene one would score near zero.
    expect(difference(first, seventh)).toBeGreaterThan(8);
  });

  test('the playhead advances through the whole ad', async ({ page }) => {
    await openAd(page, 'launch-story');

    const readAt = async (): Promise<number> =>
      Number(await page.getByLabel('Scrub').getAttribute('aria-valuenow'));

    const before = await readAt();
    await page.waitForTimeout(1_500);
    const after = await readAt();

    expect(after).toBeGreaterThan(before);
  });

  test('Showcase keeps its slider and Motion Ads gets the track timeline (§1.1, §1.2)', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('canvas');
    await expect(page.getByLabel('Timeline')).toBeHidden();

    await page.getByRole('button', { name: 'Motion Ads' }).click();
    await expect(page.getByLabel('Timeline')).toBeVisible();
    await expect(page.getByText('Music arrives at M6')).toBeVisible();
  });
});

test.describe('transitions (§6.4)', () => {
  test('a white flash blows the frame out at its midpoint', async ({ page }) => {
    await openAd(page, 'launch-story', BEAT.flashPeak);
    // The ramp is squared in and rooted out, so the peak is full white.
    expect(await luminance(page)).toBeGreaterThan(250);
  });

  test('a flash is over by the time the next beat has settled', async ({ page }) => {
    await openAd(page, 'launch-story', BEAT.flashPeak + 900);
    expect(await luminance(page)).toBeLessThan(200);
  });

  test('a crossfade shows neither neighbour on its own', async ({ page }) => {
    await openAd(page, 'launch-story', BEAT.crossFadeMid - 900);
    const before = await fingerprint(page);

    await openAd(page, 'launch-story', BEAT.crossFadeMid + 900);
    const after = await fingerprint(page);

    await openAd(page, 'launch-story', BEAT.crossFadeMid);
    const during = await fingerprint(page);

    // The composite is a blend, so it differs from both ends — which a
    // renderer that simply switched scenes at the boundary could not do.
    expect(difference(during, before)).toBeGreaterThan(2);
    expect(difference(during, after)).toBeGreaterThan(2);
  });

  test('a push seams the two scenes together at the midpoint', async ({ page }) => {
    await openAd(page, 'launch-story', BEAT.pushMid);

    /*
     * A push slides both scenes as one strip, so at the halfway point — and
     * `inOutCubic(0.5)` is exactly 0.5 — the boundary between them sits on the
     * frame's vertical centre line. That hard discontinuity is the property
     * that makes a push a push: a crossfade blends and has no seam anywhere.
     *
     * Measured as a ratio against the frame's own median column-to-column
     * difference, so the assertion holds whatever the photographs happen to
     * look like. An earlier version compared the mean brightness of the left
     * and right edges, which passed only because the synthesised sample set
     * happened to make those two beats differ; real photography brought them
     * within a unit of each other and the test failed while the renderer was
     * perfectly correct.
     */
    const seam = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) throw new Error('no artboard');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no context');
      const { width, height } = canvas;

      const columnMean = (x: number): number => {
        const data = ctx.getImageData(x, 0, 1, height).data;
        let total = 0;
        for (let i = 0; i < data.length; i += 4) {
          total += ((data[i] ?? 0) + (data[i + 1] ?? 0) + (data[i + 2] ?? 0)) / 3;
        }
        return total / (data.length / 4);
      };

      const means: number[] = [];
      for (let x = 0; x < width; x++) means.push(columnMean(x));

      const diffs: number[] = [];
      for (let x = 1; x < width; x++) diffs.push(Math.abs((means[x] ?? 0) - (means[x - 1] ?? 0)));

      const sorted = [...diffs].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)] ?? 0;

      let peak = 0;
      let peakX = 0;
      for (let i = 0; i < diffs.length; i++) {
        const value = diffs[i] ?? 0;
        if (value > peak) { peak = value; peakX = i + 1; }
      }

      return { width, median, peak, peakX };
    });

    // The strongest edge in the frame is the seam, and it lands on the centre.
    expect(
      Math.abs(seam.peakX - seam.width / 2),
      `strongest edge at x=${seam.peakX}, centre is ${seam.width / 2}`,
    ).toBeLessThanOrEqual(2);

    // …and it stands far out of the frame's own texture. Measures about 44×.
    expect(
      seam.peak / Math.max(seam.median, 0.01),
      `seam ${seam.peak.toFixed(2)} against median ${seam.median.toFixed(3)}`,
    ).toBeGreaterThan(6);
  });

  test('changing a transition changes what the frame shows', async ({ page }) => {
    await openAd(page, 'launch-story', BEAT.flashPeak);
    const flashed = await luminance(page);
    expect(flashed).toBeGreaterThan(250);

    // Scene 4 is the one the flash belongs to.
    await page.getByRole('button', { name: /^4\./ }).click();
    await page.getByLabel('Transition', { exact: true }).selectOption('crossFade');
    await page.waitForTimeout(400);

    // A crossfade at the same instant is nothing like a blown-out frame.
    expect(await luminance(page)).toBeLessThan(200);
  });
});

test.describe('overlays (§3C)', () => {
  test('a text overlay draws inside its own time range and nowhere else', async ({ page }) => {
    await openAd(page, 'quick-pitch', 2_000);
    const sceneOnly = await fingerprint(page);

    // Dropped at the playhead, three seconds long. Its entrance is neutralised
    // first: a clip is at zero opacity on its own first frame, so a test that
    // sampled there would compare two identical frames and pass for the wrong
    // reason.
    await page.getByRole('button', { name: '+ Text' }).click();
    await expect(page.getByLabel('Overlay inspector')).toBeVisible();
    await setPresets(page, 'None');

    // Enlarged, so the assertion is about whether the overlay drew at all
    // rather than about how much of a 24×42 thumbnail a small caption moves.
    await page.getByLabel('Size', { exact: true }).fill('280');
    await page.waitForTimeout(400);

    /*
     * The frame is frozen, so a frame that did not change differs by exactly
     * zero — the companion assertion below measures that. The threshold is
     * therefore only guarding against rounding: an enlarged caption over a
     * 24×42 thumbnail of a 1080×1920 frame measures about 1.6 mean units per
     * channel, which is a small number for a large, unmistakable change.
     */
    const withOverlay = await fingerprint(page);
    expect(difference(sceneOnly, withOverlay)).toBeGreaterThan(0.5);

    // Past its end, the same overlay must contribute nothing at all — which is
    // only true if removing it changes the frame not one bit.
    await scrubTo(page, 8_000, QUICK_PITCH_MS);
    const outsideWith = await fingerprint(page);

    await page.getByRole('button', { name: 'Remove overlay' }).click();
    await page.waitForTimeout(400);
    const outsideWithout = await fingerprint(page);

    expect(difference(outsideWith, outsideWithout)).toBe(0);
  });

  test('an overlay survives a scene change, because it is not a scene layer', async ({ page }) => {
    await openAd(page, 'quick-pitch', 1_000);

    await page.getByRole('button', { name: '+ Text' }).click();
    await page.waitForTimeout(300);

    // Editing the scene under it must not disturb it.
    await page.getByRole('button', { name: '← Scene' }).click();
    await page.getByRole('button', { name: /^1\./ }).click();
    await page.getByRole('button', { name: 'Duplicate this scene' }).click();
    await page.waitForTimeout(300);

    await expect(page.getByText(/1 overlays|· 1 overlay/)).toBeVisible();
  });

  test('the editor offers the entrance and exit presets of §5', async ({ page }) => {
    await openAd(page, 'quick-pitch', 1_000);
    await page.getByRole('button', { name: '+ Text' }).click();

    for (const preset of ['None', 'Fade', 'Rise', 'Pop', 'Slide', 'Wipe']) {
      await expect(page.getByRole('group', { name: 'Entrance' }).getByRole('button', { name: preset })).toBeVisible();
    }
  });

  test('editing overlay text redraws the frame', async ({ page }) => {
    await openAd(page, 'quick-pitch', 2_000);
    await page.getByRole('button', { name: '+ Text' }).click();
    await setPresets(page, 'None');

    const before = await fingerprint(page);
    await page.getByLabel('Overlay text').fill('COMPLETELY DIFFERENT WORDS HERE');
    await page.waitForTimeout(500);
    const after = await fingerprint(page);

    expect(difference(before, after)).toBeGreaterThan(0.5);
  });

  test('removing an overlay returns the inspector to the scene', async ({ page }) => {
    await openAd(page, 'quick-pitch', 1_000);
    await page.getByRole('button', { name: '+ Text' }).click();
    await page.getByRole('button', { name: 'Remove overlay' }).click();

    await expect(page.getByLabel('Overlay inspector')).toBeHidden();
    await expect(page.getByText('5 scenes · 0 overlays')).toBeVisible();
  });
});

test.describe('the sequence is editable', () => {
  test('the inspector edits the selected scene, not the first (D-045)', async ({ page }) => {
    await openAd(page, 'quick-pitch', 300);
    const firstBeat = await fingerprint(page);

    // Change the look of beat *three* and confirm beat one is untouched.
    await page.getByRole('button', { name: /^3\./ }).click();
    await page.getByRole('tab', { name: 'Look' }).click();
    await page.getByLabel('Grain').fill('1');
    await page.waitForTimeout(400);

    expect(difference(firstBeat, await fingerprint(page))).toBeLessThan(1.5);
  });

  test('scenes can be added and removed, and the total follows', async ({ page }) => {
    await openAd(page, 'quick-pitch');

    const total = async (): Promise<number> =>
      Number(await page.getByLabel('Scrub').getAttribute('aria-valuemax'));

    const before = await total();
    await page.getByRole('button', { name: 'Add a scene after this one' }).click();
    await page.waitForTimeout(300);
    expect(await total()).toBeGreaterThan(before);

    await page.getByRole('button', { name: 'Remove this scene' }).click();
    await page.waitForTimeout(300);
    expect(await total()).toBe(before);
  });

  test('⌘Z puts back a scene that was removed', async ({ page }) => {
    await openAd(page, 'quick-pitch');
    await expect(page.getByText('5 scenes · 0 overlays')).toBeVisible();

    await page.getByRole('button', { name: 'Remove this scene' }).click();
    await expect(page.getByText('4 scenes · 0 overlays')).toBeVisible();

    await page.keyboard.press('ControlOrMeta+z');
    await expect(page.getByText('5 scenes · 0 overlays')).toBeVisible();
  });

  test('the library lists ads in Motion Ads and scene templates in Showcase (D-013)', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('canvas');

    await expect(page.getByRole('button', { name: 'Parallax Depth', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Launch Story/ })).toBeHidden();

    await page.getByRole('button', { name: 'Motion Ads' }).click();
    await expect(page.getByRole('button', { name: /^Launch Story/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Parallax Depth', exact: true })).toBeHidden();
  });
});
