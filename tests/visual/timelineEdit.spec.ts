import { expect, test, type Page } from '@playwright/test';

/**
 * Acting on things on the timeline (D-103, D-104).
 *
 * Reported together: there was no way to delete a clip from the timeline —
 * "pressing Delete on the keyboard or … a right-click to bring options out" —
 * nothing for a touch screen, and every new element got a layer of its own,
 * "not different layers for lots of elements that could have shared a single
 * timeline", with no way to move one between layers.
 */

test.use({ viewport: { width: 1500, height: 940 } });

const toast = (page: Page) => page.locator('[data-toast]');
const clips = (page: Page) => page.locator('[data-overlay-clip]');
const menu = (page: Page) => page.locator('[data-context-menu]');

async function openAd(page: Page, frozenMs = 1_000): Promise<void> {
  await page.goto(`/?template=quick-pitch&aspect=9:16&frozen=${frozenMs}`);
  await page.waitForSelector('canvas');
  await page.waitForTimeout(2_000);
}

/** Moves the playhead by clicking the ruler, the way a person would. */
async function scrubTo(page: Page, fraction: number): Promise<void> {
  const ruler = page.getByLabel('Scrub');
  const box = await ruler.boundingBox();
  if (!box) throw new Error('no ruler');
  await ruler.click({ position: { x: box.width * fraction, y: 3 } });
  await page.waitForTimeout(250);
}

/** How many clips sit on each layer, L1 first. */
async function layers(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const counts = new Map<number, number>();
    for (const clip of document.querySelectorAll('[data-overlay-clip]')) {
      const row = Number(clip.getAttribute('data-track'));
      counts.set(row, (counts.get(row) ?? 0) + 1);
    }
    const rows = Math.max(-1, ...counts.keys()) + 1;
    return Array.from({ length: rows }, (_, row) => counts.get(row) ?? 0);
  });
}

async function addText(page: Page): Promise<void> {
  await page.getByTitle('Add a text overlay').click();
  await page.waitForTimeout(200);
}

test.describe('deleting from the timeline (D-104)', () => {
  test('Delete removes the selected layer, says how to undo, and ⌘Z brings it back', async ({ page }) => {
    await openAd(page);
    await addText(page);
    await expect(clips(page)).toHaveCount(1);

    await clips(page).first().click();
    await page.keyboard.press('Delete');
    await expect(clips(page)).toHaveCount(0);
    await expect(toast(page)).toContainText(/Deleted .*undo/);

    await page.keyboard.press('ControlOrMeta+z');
    await expect(clips(page)).toHaveCount(1);
  });

  test('Backspace does the same, but never while typing', async ({ page }) => {
    await openAd(page);
    await addText(page);
    // The new caption's text field is in the inspector; Backspace there edits the words.
    const field = page.getByLabel('Overlay text');
    await field.click();
    await field.press('End');
    await field.press('Backspace');
    await expect(clips(page)).toHaveCount(1);

    await clips(page).first().click();
    await page.keyboard.press('Backspace');
    await expect(clips(page)).toHaveCount(0);
  });

  test('a scene picked on the timeline is what Delete removes', async ({ page }) => {
    await openAd(page);
    const scenes = page.getByRole('button', { name: /^\d+\. / });
    await expect(scenes).toHaveCount(5);
    await scenes.nth(2).click();
    await page.keyboard.press('Delete');
    await expect(scenes).toHaveCount(4);
    await expect(toast(page)).toContainText('Deleted scene 3');
  });
});

test.describe('the menu on a clip (D-104)', () => {
  test('a right-click lists what can be done, and does it', async ({ page }) => {
    await openAd(page);
    await addText(page);
    await clips(page).first().click({ button: 'right' });

    await expect(menu(page)).toBeVisible();
    for (const item of ['Effects…', 'Entrance effect…', 'Exit effect…', 'Duplicate', 'Bring to front', 'Delete']) {
      await expect(menu(page).getByRole('menuitem', { name: new RegExp(`^${item.replace('…', '…')}`) })).toBeVisible();
    }

    await menu(page).getByRole('menuitem', { name: /^Duplicate/ }).click();
    await expect(menu(page)).toHaveCount(0);
    await expect(clips(page)).toHaveCount(2);

    await clips(page).nth(1).click({ button: 'right' });
    await menu(page).getByRole('menuitem', { name: /^Delete/ }).click();
    await expect(clips(page)).toHaveCount(1);
  });

  test('Escape or a click elsewhere closes it without doing anything', async ({ page }) => {
    await openAd(page);
    await addText(page);
    await clips(page).first().click({ button: 'right' });
    await expect(menu(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu(page)).toHaveCount(0);
    await expect(clips(page)).toHaveCount(1);
  });

  test('“Entrance effect…” opens the library on entrances, for that layer', async ({ page }) => {
    await openAd(page);
    await addText(page);
    await clips(page).first().click({ button: 'right' });
    await menu(page).getByRole('menuitem', { name: /^Entrance effect/ }).click();

    const library = page.getByRole('dialog', { name: 'Effects' });
    await expect(library).toBeVisible();
    await expect(library.getByRole('tab', { name: 'Entrance' })).toHaveAttribute('aria-selected', 'true');
    await library.locator('[data-effect="spin-in"]').click();

    await expect(page.locator('[data-effect-row="spin-in"]')).toBeVisible();
  });

  test('a scene has its own menu, with Change design and its effects', async ({ page }) => {
    await openAd(page);
    await page.getByRole('button', { name: /^2\. / }).click({ button: 'right' });
    await expect(menu(page)).toContainText('Scene 2');
    await menu(page).getByRole('menuitem', { name: /^Change design/ }).click();
    await expect(page.getByRole('dialog', { name: 'Change scene 2' })).toBeVisible();
  });

  test('a selected clip has a “⋯” button for the same menu', async ({ page }) => {
    await openAd(page);
    await addText(page);
    await page.getByRole('button', { name: /^More for / }).click();
    await expect(menu(page)).toBeVisible();
  });
});

test.describe('on a touch screen (D-104)', () => {
  test.use({ hasTouch: true });

  test('holding a finger on a clip opens its menu', async ({ page }) => {
    await openAd(page);
    await addText(page);
    const box = await clips(page).first().boundingBox();
    if (!box) throw new Error('no clip');
    const cdp = await page.context().newCDPSession(page);
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await page.waitForTimeout(800);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

    // Still open after the finger lifts: the click the browser sends on
    // release must not pick the item that happens to be under it.
    await page.waitForTimeout(300);
    await expect(menu(page)).toBeVisible();
    await expect(menu(page).getByRole('menuitem', { name: /^Delete/ })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});

test.describe('layers (D-103)', () => {
  test('a new element shares a layer that has room at the playhead', async ({ page }) => {
    await openAd(page, 500);
    await scrubTo(page, 0.03);
    await addText(page);
    // Past the first caption's end (it runs four seconds).
    await scrubTo(page, 0.6);
    await addText(page);

    await expect(clips(page)).toHaveCount(2);
    expect(await layers(page)).toEqual([2]);
  });

  test('…and opens a new layer only when every one is busy', async ({ page }) => {
    await openAd(page, 500);
    await scrubTo(page, 0.1);
    await addText(page);
    await scrubTo(page, 0.15);
    await addText(page);
    expect(await layers(page)).toEqual([1, 1]);
  });

  test('clicking a layer chooses it for the next element, after what is already there', async ({ page }) => {
    await openAd(page, 500);
    await scrubTo(page, 0.1);
    await addText(page);
    await scrubTo(page, 0.15);
    await addText(page);
    expect(await layers(page)).toEqual([1, 1]);

    // Choose L1, with the playhead still inside its caption: the next one
    // goes on L1, straight after it, rather than opening L3.
    await page.locator('[data-track-label="0"]').click();
    await expect(page.locator('[data-track-label="0"]')).toHaveAttribute('aria-pressed', 'true');
    await addText(page);
    expect(await layers(page)).toEqual([2, 1]);
  });

  test('dragging a clip down a row moves it to that layer', async ({ page }) => {
    await openAd(page, 500);
    await scrubTo(page, 0.1);
    await addText(page);
    await scrubTo(page, 0.15);
    await addText(page);
    // One on L1, one on L2. Drag the L1 clip later *and* down a row, to a
    // stretch of L2 that is free.
    const first = page.locator('[data-overlay-clip][data-track="0"]');
    const box = await first.boundingBox();
    if (!box) throw new Error('no clip');
    const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 220, from.y + 10, { steps: 5 });
    await page.mouse.move(from.x + 440, from.y + 28, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(200);

    // Both now share one layer — and the emptied L1 closed up behind it.
    expect(await layers(page)).toEqual([2]);
  });

  test('dropped on top of another clip, it goes back where it came from — and says so', async ({ page }) => {
    await openAd(page, 500);
    await scrubTo(page, 0.1);
    await addText(page);
    await scrubTo(page, 0.15);
    await addText(page);
    // The clip on L2, dragged straight up onto L1, where the other one already is.
    const second = page.locator('[data-overlay-clip][data-track="1"]');
    const box = await second.boundingBox();
    if (!box) throw new Error('no clip');
    const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x, from.y - 14, { steps: 3 });
    await page.mouse.move(from.x, from.y - 28, { steps: 3 });
    await page.mouse.up();

    await expect(toast(page)).toContainText('No room on L1');
    expect(await layers(page)).toEqual([1, 1]);
  });
});

test.describe('the timeline lines up and grows (D-106)', () => {
  test('every row’s label sits exactly beside its lane', async ({ page }) => {
    await openAd(page);
    const rows = await page.evaluate(() =>
      [...document.querySelectorAll('[aria-label="Timeline"] [data-lane="true"]')]
        .filter((lane) => lane.parentElement?.firstElementChild !== lane)
        .map((lane) => {
          const label = lane.parentElement?.firstElementChild?.getBoundingClientRect();
          const own = lane.getBoundingClientRect();
          return { dTop: Math.abs((label?.top ?? -99) - own.top), dHeight: Math.abs((label?.height ?? -99) - own.height) };
        }),
    );
    expect(rows.length).toBeGreaterThan(4);
    for (const row of rows) {
      expect(row.dTop).toBeLessThan(1);
      expect(row.dHeight).toBeLessThan(1);
    }
  });

  test('grows with its rows, so the music row stays in view', async ({ page }) => {
    await openAd(page);
    for (const id of ['lightning', 'shake', 'flash']) {
      await page.getByTitle(/^Add an effect at the playhead/).click();
      await page.getByRole('dialog', { name: 'Effects' }).locator(`[data-effect="${id}"]`).click();
    }
    const panel = await page.locator('[aria-label="Timeline"]').boundingBox();
    const music = await page.locator('[aria-label="Timeline"] [data-lane="true"]').last().boundingBox();
    if (!panel || !music) throw new Error('no timeline');
    expect(music.y + music.height).toBeLessThanOrEqual(panel.y + panel.height + 1);
  });
});

test.describe('effects on the timeline (D-106)', () => {
  test('a scene’s own effect shows on the FX lane, with its menu', async ({ page }) => {
    await openAd(page);
    await page.getByRole('button', { name: /^2\. / }).click();
    await page.getByRole('tab', { name: 'Motion' }).click();
    await page.getByRole('button', { name: '+ Add effect' }).last().click();
    await page.getByRole('dialog', { name: 'Effects' }).locator('[data-effect="snow"]').click();

    const clip = page.locator('[data-fx-scope="scene-1"][data-fx-clip="snow"]');
    await expect(clip).toBeVisible();
    await expect(clip).toContainText('scene 2');

    await clip.click({ button: 'right' });
    await menu(page).getByRole('menuitem', { name: /^Move to the timeline/ }).click();
    await expect(page.locator('[data-fx-scope="timeline"][data-fx-clip="snow"]')).toBeVisible();
  });

  test('overlapping effects stack onto rows of their own, each one selectable', async ({ page }) => {
    await openAd(page);
    for (const id of ['lightning', 'shake']) {
      await page.getByTitle(/^Add an effect at the playhead/).click();
      await page.getByRole('dialog', { name: 'Effects' }).locator(`[data-effect="${id}"]`).click();
    }
    const rowOf = (id: string) => page.locator(`[data-fx-clip="${id}"]`).getAttribute('data-fx-row');
    expect(await rowOf('lightning')).not.toBe(await rowOf('shake'));

    await page.locator('[data-fx-clip="lightning"]').click();
    await expect(page.getByLabel('Effect inspector')).toContainText('Lightning');
    await page.locator('[data-fx-clip="shake"]').click();
    await expect(page.getByLabel('Effect inspector')).toContainText('Shake');
  });

  test('dragging an effect’s dotted end makes it longer', async ({ page }) => {
    await openAd(page);
    await page.getByTitle(/^Add an effect at the playhead/).click();
    await page.getByRole('dialog', { name: 'Effects' }).locator('[data-effect="flash"]').click();
    const clip = page.locator('[data-fx-clip="flash"]');
    const before = await clip.boundingBox();
    const end = await clip.locator('[data-trim="end"]').boundingBox();
    if (!before || !end) throw new Error('no clip');
    await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2);
    await page.mouse.down();
    await page.mouse.move(end.x + 60, end.y + end.height / 2, { steps: 4 });
    await page.mouse.move(end.x + 120, end.y + end.height / 2, { steps: 4 });
    await page.mouse.up();
    const after = await clip.boundingBox();
    expect((after?.width ?? 0) - before.width).toBeGreaterThan(80);
  });
});

test.describe('Lifestyle (D-106)', () => {
  test('its effects can be moved, trimmed and right-clicked under the scrubber', async ({ page }) => {
    await page.goto('/?template=pop-float&aspect=1:1&frozen=3000');
    await page.waitForSelector('canvas');
    await page.waitForTimeout(2_000);
    await page.getByRole('button', { name: 'Add an effect' }).click();
    await page.getByRole('dialog', { name: 'Effects' }).locator('[data-effect="flash"]').click();

    const clip = page.locator('[data-fx-clip="flash"]');
    await expect(clip).toBeVisible();
    await expect(clip.locator('[data-trim="start"]')).toBeAttached();
    await expect(clip.locator('[data-trim="end"]')).toBeAttached();
    await clip.click({ button: 'right' });
    await expect(menu(page).getByRole('menuitem', { name: /^Delete effect/ })).toBeVisible();
  });

  test('speed changes how long the scene lasts, so the design fills it', async ({ page }) => {
    await page.goto('/?template=pop-float&aspect=1:1&frozen=1000');
    await page.waitForSelector('canvas');
    await page.waitForTimeout(2_000);
    const scrub = page.locator('input[aria-label="Scrub"]');
    const before = Number(await scrub.getAttribute('max'));
    await page.getByRole('tab', { name: 'Motion' }).click();
    await page.getByLabel('Speed').fill('200');
    await page.waitForTimeout(300);
    expect(Number(await scrub.getAttribute('max'))).toBe(Math.round(before / 2));
  });
});

test.describe('picking something stops the preview (D-110)', () => {
  const playing = (page: Page): Promise<boolean> =>
    page.evaluate(() => (globalThis as unknown as { __motionStudio: { clock: { playing: () => boolean } } }).__motionStudio.clock.playing());

  test('clicking a clip on the timeline pauses playback where it is', async ({ page }) => {
    test.skip(process.env['PW_PROD'] === '1', 'Reads the dev-only clock handle, which the production build rightly omits.');
    await openAd(page);
    await addText(page);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(() => playing(page)).toBe(true);
    // Something else selected first, so the click below is a fresh pick.
    await page.keyboard.press('Escape');
    await clips(page).first().click();
    await expect.poll(() => playing(page)).toBe(false);
  });
});
