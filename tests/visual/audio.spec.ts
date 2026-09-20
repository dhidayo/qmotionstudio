import { expect, test, type Page } from '@playwright/test';
import { addMusic, LONG_AUDIO_FIXTURE } from '../support/audio';

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

    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.waitForTimeout(1_500);

    const read = async (): Promise<{
      timeMs: number; mastered: boolean; playing: boolean; wallMs: number;
    }> =>
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
          wallMs: performance.now(),
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

    await page.waitForTimeout(1_200);
    const second = await read();

    /*
     * Compared against *measured* wall time, not against the nominal 1200ms.
     * `waitForTimeout` only promises a lower bound, and on a loaded machine it
     * routinely overshoots by a second or more — which is exactly the sort of
     * thing that makes a timing test fail for reasons that have nothing to do
     * with the code under test.
     */
    const advanced = second.timeMs - first.timeMs;
    const elapsed = second.wallMs - first.wallMs;
    expect(advanced).toBeGreaterThan(0);

    const ratio = advanced / Math.max(1, elapsed);
    expect(ratio, `clock advanced ${advanced.toFixed(0)}ms over ${elapsed.toFixed(0)}ms of wall time`)
      .toBeGreaterThan(0.7);
    expect(ratio).toBeLessThan(1.4);
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

test.describe('a track longer than the video (§10)', () => {
  /**
   * The case that was unusable. The lane used to span the *video*, so a clip
   * running past the end drew as a full-width bar with its far edge pinned off
   * the end of the timeline — unreachable, so untrimmable.
   */

  /** Drags the music clip by a fraction of the lane, with optional modifiers. */
  async function dragClip(
    page: Page,
    fromFraction: number,
    toFraction: number,
    modifier?: 'Alt' | 'Shift',
  ): Promise<void> {
    const clip = page.getByRole('button', { name: /^Music clip/ });
    const box = await clip.boundingBox();
    if (!box) throw new Error('no clip');

    const y = box.y + box.height / 2;
    if (modifier) await page.keyboard.down(modifier);
    await page.mouse.move(box.x + box.width * fromFraction, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * toFraction, y, { steps: 12 });
    await page.mouse.up();
    if (modifier) await page.keyboard.up(modifier);
    await page.waitForTimeout(400);
  }

  const section = async (page: Page): Promise<string> =>
    (await page.getByLabel('Music inspector').innerText()).match(/\d:\d\d – \d:\d\d of \d:\d\d/)?.[0] ?? '';

  test('the lane grows to show audio past the end of the video', async ({ page }) => {
    await openAd(page);
    // Forty seconds against a fifteen-second ad: the overhang comes from the
    // track's own length, which is the ordinary case and the one that broke.
    await addMusic(page, LONG_AUDIO_FIXTURE);

    await expect(page.getByText(/music runs .* past the end/)).toBeVisible();
    await expect(page.getByText(/runs past the end of the video/)).toBeVisible();

    /*
     * The right edge has to stay inside the lane. That is the whole fix: a
     * clip whose end sits off the timeline cannot be trimmed, slipped or even
     * seen, which is precisely what a lane sized to the video produced.
     */
    const clip = await page.getByRole('button', { name: /^Music clip/ }).boundingBox();
    const lane = await page.locator('[data-lane]').first().boundingBox();
    if (!clip || !lane) throw new Error('no geometry');

    expect(clip.x + clip.width).toBeLessThanOrEqual(lane.x + lane.width + 1);
    // …and it is a real clip, not a sliver squeezed against the edge.
    expect(clip.width).toBeGreaterThan(lane.width * 0.5);
  });

  test('“Fit to video” trims the music to exactly the video', async ({ page }) => {
    await openAd(page);
    await addMusic(page, LONG_AUDIO_FIXTURE);
    await expect(page.getByRole('button', { name: /^Music clip, 40\.0 seconds/ })).toBeVisible();

    await page.getByRole('button', { name: 'Fit to video' }).click();
    await page.waitForTimeout(400);

    await expect(page.getByText(/runs past the end of the video/)).toBeHidden();
    await expect(page.getByRole('button', { name: /^Music clip, 15\.0 seconds/ })).toBeVisible();
  });

  test('⌥-drag slips the section without moving the clip', async ({ page }) => {
    await openAd(page);
    await addMusic(page, LONG_AUDIO_FIXTURE);

    // Slip needs somewhere to slip *to*, so take fifteen seconds of the forty.
    await page.getByRole('button', { name: 'Fit to video' }).click();
    await page.waitForTimeout(400);

    const clipBefore = await page.getByRole('button', { name: /^Music clip/ }).boundingBox();
    const before = await section(page);

    await dragClip(page, 0.6, 0.2, 'Alt');

    const after = await section(page);
    const clipAfter = await page.getByRole('button', { name: /^Music clip/ }).boundingBox();
    if (!clipBefore || !clipAfter) throw new Error('no geometry');

    // A different part of the track — which trimming cannot achieve without
    // also shortening the clip or moving it.
    expect(after, `section was ${before}`).not.toBe(before);

    // …and the clip itself has neither moved nor changed length.
    expect(Math.abs(clipAfter.x - clipBefore.x)).toBeLessThan(2);
    expect(Math.abs(clipAfter.width - clipBefore.width)).toBeLessThan(2);
  });

  test('trimming an edge is one undo step, not one per pointer move', async ({ page }) => {
    await openAd(page);
    await addMusic(page, LONG_AUDIO_FIXTURE);

    const before = await section(page);

    // Grab the left edge specifically — the handle is the leftmost 8px.
    const clip = page.getByRole('button', { name: /^Music clip/ });
    const box = await clip.boundingBox();
    if (!box) throw new Error('no clip');
    const y = box.y + box.height / 2;

    await page.mouse.move(box.x + 3, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.3, y, { steps: 15 });
    await page.mouse.up();
    await page.waitForTimeout(400);

    expect(await section(page)).not.toBe(before);

    /*
     * One ⌘Z has to undo the whole drag. The first version dispatched a trim
     * and a move with *different* coalesce keys, and coalescing only merges
     * with the entry immediately before it — so every pointermove pushed its
     * own undo entry, and a single drag could evict the real history off the
     * end of MAX_HISTORY.
     */
    await page.keyboard.press('ControlOrMeta+z');
    await page.waitForTimeout(400);
    expect(await section(page)).toBe(before);
  });
});

test.describe('music follows the timeline (§10)', () => {
  test('the audio loops with the video instead of running on past it', async ({ page }) => {
    /*
     * The bug this exists for. Web Audio sources play once, so the picture
     * looped and the music did not — and because the clock is *mastered* by
     * the audio (D-054), the two did not drift apart, they diverged by a whole
     * loop: the frame showed 1s while the track was 31s in.
     *
     * quick-pitch is 15s, so a pass takes 15 seconds of wall clock. Rather
     * than wait that out, the clip is placed near the end and the loop point
     * is crossed in a couple of seconds.
     */
    await page.goto('/?template=quick-pitch&aspect=9:16&frozen=13000');
    await page.waitForSelector('canvas');
    await page.waitForTimeout(2_000);
    await addMusic(page);

    await page.getByRole('button', { name: 'Play', exact: true }).click();

    const read = async (): Promise<{ timeMs: number; mastered: boolean }> =>
      page.evaluate(() => {
        const handle = (globalThis as unknown as {
          __motionStudio?: { clock: { timeMs: () => number; audioMastered: () => boolean } };
        }).__motionStudio;
        if (!handle) throw new Error('no dev handle');
        return { timeMs: handle.clock.timeMs(), mastered: handle.clock.audioMastered() };
      });

    // Cross the 15s loop point.
    await page.waitForTimeout(4_000);
    const after = await read();

    /*
     * Two assertions, and the second is the one that mattered. Before the fix
     * the clock kept reporting a wrapped position — so "it looped" looked
     * true — while the audio graph had nothing scheduled and was silent. The
     * clock only stays audio-mastered if the engine actually rescheduled.
     */
    expect(after.timeMs, 'the playhead wrapped').toBeLessThan(13_000);
    expect(after.mastered, 'audio is still driving the clock after the loop').toBe(true);
  });

  test('a clip placed later starts later, not immediately', async ({ page }) => {
    await page.goto('/?template=quick-pitch&aspect=9:16&frozen=0');
    await page.waitForSelector('canvas');
    await page.waitForTimeout(2_000);
    await addMusic(page);

    // Push the clip to start at roughly 8s.
    const clip = page.getByRole('button', { name: /^Music clip/ });
    const box = await clip.boundingBox();
    const lane = await page.locator('[data-lane]').first().boundingBox();
    if (!box || !lane) throw new Error('no geometry');

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(lane.x + lane.width * 0.85, box.y + box.height / 2, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(400);

    const startedAt = await page.evaluate(() => {
      const handle = (globalThis as unknown as {
        __motionStudio?: { audio?: { clipStartMs: () => number | null } };
      }).__motionStudio;
      return handle?.audio?.clipStartMs() ?? null;
    });

    // Moved, and not back to zero — the clip's position is what schedules it.
    expect(startedAt).not.toBeNull();
    expect(startedAt ?? 0).toBeGreaterThan(3_000);
  });
});

test.describe('auditioning the whole track (§10)', () => {
  /**
   * Deciding where to cut a piece of music means being able to hear the part
   * you are cutting. The transport used to stop at the end of the video, so
   * every second of overhanging music was visible on the timeline, editable by
   * slider, and impossible to listen to.
   */

  test('the playhead reaches past the end of the video', async ({ page }) => {
    await openAd(page);
    await addMusic(page, LONG_AUDIO_FIXTURE);

    // quick-pitch is 15s; the fixture is 40s.
    const scrub = page.getByLabel('Scrub');
    expect(Number(await scrub.getAttribute('aria-valuemax'))).toBe(40_000);

    // Scrub to 30s — fifteen seconds past the last scene.
    const box = await scrub.boundingBox();
    if (!box) throw new Error('no ruler');
    await scrub.click({ position: { x: box.width * 0.75, y: 2 } });
    await page.waitForTimeout(400);

    const at = Number(await scrub.getAttribute('aria-valuenow'));
    expect(at, 'the playhead went past the video').toBeGreaterThan(16_000);

    // And it says so, rather than leaving a held frame looking like a stall.
    await expect(page.getByText('past end')).toBeVisible();
  });

  test('the artboard holds the last frame rather than going blank', async ({ page }) => {
    await openAd(page);
    await addMusic(page, LONG_AUDIO_FIXTURE);

    const luminance = async (): Promise<number> =>
      page.evaluate(() => {
        const canvas = document.querySelector('canvas');
        if (!canvas) throw new Error('no artboard');
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('no context');
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let total = 0;
        let n = 0;
        for (let i = 0; i < data.length; i += 4 * 97) {
          total += ((data[i] ?? 0) + (data[i + 1] ?? 0) + (data[i + 2] ?? 0)) / 3;
          n += 1;
        }
        return total / n;
      });

    const scrub = page.getByLabel('Scrub');
    const box = await scrub.boundingBox();
    if (!box) throw new Error('no ruler');

    // Inside the video…
    await scrub.click({ position: { x: box.width * 0.2, y: 2 } });
    await page.waitForTimeout(500);
    const inside = await luminance();

    // …and well past the end of it.
    await scrub.click({ position: { x: box.width * 0.9, y: 2 } });
    await page.waitForTimeout(500);
    const beyond = await luminance();

    /*
     * The last frame is held, so there is still a picture. Without the clamp
     * the renderer draws a scene whose layers have all ended — a bare
     * background, which reads as the preview having broken.
     */
    expect(beyond, 'the artboard went blank past the end').toBeGreaterThan(8);
    expect(Math.abs(beyond - inside)).toBeLessThan(120);
  });

  test('music past the end of the video is still audible', async ({ page }) => {
    await page.goto('/?template=quick-pitch&aspect=9:16&frozen=25000');
    await page.waitForSelector('canvas');
    await page.waitForTimeout(2_000);
    await addMusic(page, LONG_AUDIO_FIXTURE);

    // Frozen at 25s — ten seconds past the video, well inside the track.
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.waitForTimeout(1_500);

    const state = await page.evaluate(() => {
      const handle = (globalThis as unknown as {
        __motionStudio?: { clock: { timeMs: () => number; audioMastered: () => boolean } };
      }).__motionStudio;
      if (!handle) throw new Error('no dev handle');
      return { timeMs: handle.clock.timeMs(), mastered: handle.clock.audioMastered() };
    });

    // Sounding, and the audio clock is driving — which is only true if the
    // engine actually scheduled something out here.
    expect(state.mastered, 'audio is playing past the end of the video').toBe(true);
    expect(state.timeMs).toBeGreaterThan(20_000);
  });
});
