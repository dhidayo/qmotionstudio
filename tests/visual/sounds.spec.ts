import { expect, test, type Page } from '@playwright/test';
import { addMusic } from '../support/audio';

/**
 * + Sound (D-156): the sound library, and clips that loop.
 *
 * Opened from the add bar's "+ Sound" in the timeline's header, as a person
 * would. What is checked is what the person gets: the library lists its
 * sounds, Listen really plays one (the button turns into Stop while it
 * sounds), a background loop goes under the whole video and follows it, an
 * effect lands at the playhead on a Sounds row of its own, and undo takes
 * either back.
 */

test.use({ viewport: { width: 1500, height: 940 } });

type Clip = { id: string; mediaId: string; startMs: number; loop?: boolean; lengthMs?: number; fitsVideo?: boolean };
type Handle = {
  editor: { getState: () => { project: { audio: Clip[]; scenes: unknown[] }; undo: () => void; dispatch: (action: unknown) => void } };
  actions: { duplicateScene: (index: number) => unknown };
  clock: { seek: (ms: number) => void };
};

const timeline = (page: Page) => page.locator('[aria-label="Timeline"]');
const picker = (page: Page) => page.getByRole('dialog', { name: 'Sounds' });

async function openAd(page: Page): Promise<void> {
  await page.goto('/?template=quick-pitch&aspect=9:16&frozen=1000');
  await page.waitForSelector('canvas');
  await page.waitForTimeout(1_500);
}

async function openSounds(page: Page): Promise<void> {
  const chip = timeline(page).locator('[data-add="sound"]');
  await chip.scrollIntoViewIfNeeded();
  await chip.click();
  await expect(picker(page)).toBeVisible();
}

const audio = (page: Page): Promise<Clip[]> =>
  page.evaluate(() => (globalThis as unknown as { __motionStudio: Handle }).__motionStudio.editor.getState().project.audio);

test.describe('+ Sound (D-156)', () => {
  test('lists background music and effects, searches them, and Listen plays one', async ({ page }) => {
    await openAd(page);
    await openSounds(page);
    const dialog = picker(page);

    await expect(dialog.locator('[data-sound]')).toHaveCount(12);
    await dialog.getByRole('tab', { name: 'Effects' }).click();
    await expect(dialog.locator('[data-sound]')).toHaveCount(8);
    await dialog.getByRole('tab', { name: 'All' }).click();
    await dialog.getByLabel('Search sounds').fill('clapping');
    await expect(dialog.locator('[data-sound]')).toHaveCount(1);
    await expect(dialog.locator('[data-sound="applause"]')).toBeVisible();
    await dialog.getByLabel('Search sounds').fill('');

    // A background loop plays until it is stopped: it goes round its loop.
    await dialog.getByRole('button', { name: 'Listen to Lo-fi Haze' }).click();
    const stop = dialog.getByRole('button', { name: 'Stop Lo-fi Haze' });
    await expect(stop).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(1_500);
    await expect(stop).toBeVisible();

    // Another sound takes over; an effect plays once and stops by itself.
    await dialog.getByRole('button', { name: 'Listen to Pop' }).click();
    await expect(dialog.getByRole('button', { name: 'Listen to Lo-fi Haze' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Listen to Pop' })).toBeVisible({ timeout: 10_000 });

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    // Listening adds nothing.
    expect(await audio(page)).toEqual([]);
  });

  test('a background loop plays under the whole video, follows it, and undo takes it away', async ({ page }) => {
    await openAd(page);
    await openSounds(page);
    await picker(page).getByRole('button', { name: 'Add Lo-fi Haze' }).click();
    await expect(picker(page)).toBeHidden();

    const clip = timeline(page).locator('[data-row="audio"]').getByRole('button', { name: /^Music clip, 15\.0 seconds, loops, Lo-fi Haze/ });
    await expect(clip).toBeVisible();
    // Fetched and decoded: its waveform is drawn, not a loading note.
    await expect(clip.getByText(/Loading/)).toBeHidden({ timeout: 15_000 });
    expect(await clip.locator('line').count()).toBeGreaterThan(50);
    // It spans the video, on the one Audio row (D-162), and ends where the video does.
    await expect(timeline(page).locator('[data-row="audio"]')).toHaveCount(1);
    const [stored] = await audio(page);
    expect(stored).toMatchObject({ mediaId: 'sound:lofi-haze', startMs: 0, loop: true, fitsVideo: true });

    // A scene more, and the music runs on to the new end.
    await page.evaluate(() => {
      const ms = (globalThis as unknown as { __motionStudio: Handle }).__motionStudio;
      ms.editor.getState().dispatch(ms.actions.duplicateScene(0));
    });
    await expect(timeline(page).getByRole('button', { name: /^Music clip, (?!15\.0)\d+\.\d seconds, loops, Lo-fi Haze/ })).toBeVisible();

    await page.evaluate(() => { (globalThis as unknown as { __motionStudio: Handle }).__motionStudio.editor.getState().undo(); });
    await page.evaluate(() => { (globalThis as unknown as { __motionStudio: Handle }).__motionStudio.editor.getState().undo(); });
    expect(await audio(page)).toEqual([]);
    await expect(timeline(page).locator('[data-row="audio"]')).toHaveCount(0);
  });

  test('choosing another background replaces the first', async ({ page }) => {
    await openAd(page);
    await openSounds(page);
    await picker(page).getByRole('button', { name: 'Add Lo-fi Haze' }).click();
    await openSounds(page);
    // The one in use says so.
    await expect(picker(page).locator('[data-sound="lofi-haze"]').getByText('In use')).toBeVisible();
    await picker(page).getByRole('button', { name: 'Add Upbeat Pulse' }).click();

    expect((await audio(page)).map((c) => c.mediaId)).toEqual(['sound:upbeat-pulse']);
    await expect(timeline(page).getByRole('button', { name: /^Music clip, .*Upbeat Pulse/ })).toBeVisible();
  });

  test('an effect lands at the playhead on the Audio row, selected; overlapping ones stack', async ({ page }) => {
    await openAd(page);
    await page.evaluate(() => { (globalThis as unknown as { __motionStudio: Handle }).__motionStudio.clock.seek(2_000); });
    await openSounds(page);
    await picker(page).getByRole('button', { name: 'Add Whoosh' }).click();

    // Music and sounds share one Audio row (D-162).
    const row = timeline(page).locator('[data-row="audio"]');
    await expect(row).toHaveCount(1);
    await expect(row.getByRole('button', { name: 'Sound clip, Whoosh, 1.0 seconds' })).toBeVisible();
    await expect(timeline(page).locator('[data-row="music"], [data-row="sounds"]')).toHaveCount(0);
    await expect(page.getByLabel('Sound inspector')).toBeVisible();
    expect((await audio(page))[0]).toMatchObject({ mediaId: 'sound:whoosh', startMs: 2_000 });

    const oneRow = (await row.boundingBox())?.height ?? 0;
    await openSounds(page);
    await picker(page).getByRole('button', { name: 'Add Pop' }).click();
    await expect(row.getByRole('button', { name: 'Sound clip, Pop, 0.3 seconds' })).toBeVisible();
    // A pop under a whoosh: two rows, each clip there to grab.
    await expect.poll(async () => (await row.boundingBox())?.height ?? 0).toBeGreaterThan(oneRow * 1.8);

    await page.getByRole('button', { name: 'Remove sound' }).click();
    expect((await audio(page)).map((c) => c.mediaId)).toEqual(['sound:whoosh']);
  });

  test('your own music can loop to fill the video, from the panel', async ({ page }) => {
    await openAd(page);
    await addMusic(page);
    const panel = page.getByLabel('Music inspector');
    await expect(page.getByRole('button', { name: /^Music clip, 12\.0 seconds$/ })).toBeVisible();

    // Twelve seconds of track under fifteen of video: Fit to video loops it.
    await panel.getByRole('button', { name: 'Fit to video' }).click();
    await expect(page.getByRole('button', { name: /^Music clip, 15\.0 seconds, loops$/ })).toBeVisible();
    await expect(panel.getByRole('switch', { name: 'Loop to fill the clip' })).toHaveAttribute('aria-checked', 'true');
    await expect(panel.getByText('Loop section')).toBeVisible();

    // Off again: it plays its section once, so it stops where the track does.
    await panel.getByRole('switch', { name: 'Loop to fill the clip' }).click();
    await expect(page.getByRole('button', { name: /^Music clip, 12\.0 seconds$/ })).toBeVisible();
  });

  test('your own sound or music is the first thing in the library (D-163)', async ({ page }) => {
    await openAd(page);
    await openSounds(page);
    const chooser = page.waitForEvent('filechooser');
    await picker(page).getByRole('button', { name: /Upload your own sound or music/ }).click();
    await chooser;
    await expect(picker(page)).toBeHidden();
  });
});

test.describe('+ Sound on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the library is a sheet from the bottom, and adds from there', async ({ page }) => {
    await page.goto('/?template=quick-pitch&aspect=9:16&frozen=1000');
    await page.waitForSelector('canvas');
    await page.waitForTimeout(1_500);
    await page.evaluate(() => {
      (globalThis as unknown as { __motionStudio: { overlays: { getState: () => { openSoundPicker: (open: boolean) => void } } } })
        .__motionStudio.overlays.getState().openSoundPicker(true);
    });
    const sheet = picker(page).locator('> div');
    await expect(sheet).toBeVisible();
    const box = await sheet.boundingBox();
    expect(box?.width).toBeCloseTo(390, -1);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeCloseTo(844, -1);
    await picker(page).getByRole('button', { name: 'Add Chime' }).click();
    await expect.poll(async () => (await audio(page)).map((c) => c.mediaId)).toEqual(['sound:chime']);
  });
});
