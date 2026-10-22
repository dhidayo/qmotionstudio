import { expect, test, type Locator, type Page } from '@playwright/test';
import { addMusic } from '../support/audio';

/**
 * The timeline shows only what is used, folds away, and one row holds
 * everything that can be added (D-153).
 *
 * "The timeline on desktop view has taken almost all screen … show only used
 * timeline and hide others that are not in use … can I have the + Motion
 * where you already have the + Photo, + Text, etc? … have collapsible
 * timeline in case where it is not actively used to get more view on the
 * canvas" — and "we may be having scroll of applicable elements on smaller
 * screen".
 */

test.use({ viewport: { width: 1500, height: 940 } });

const VIDEO_ORDER = ['text', 'photo', 'video', 'shape', 'sticker', 'number', 'motion', 'effect', 'sound', 'music'];
const DESIGN_ORDER = ['text', 'photo', 'shape', 'sticker', 'number', 'motion', 'effect'];

const timeline = (page: Page): Locator => page.locator('[aria-label="Timeline"]');
const toast = (page: Page): Locator => page.locator('[data-toast]');
const bar = (page: Page): Locator => page.locator('[data-add-bar]');
const fold = (page: Page): Locator => page.locator('[data-timeline-fold]');

async function open(page: Page, url = '/?template=quick-pitch&aspect=9:16&frozen=1000'): Promise<void> {
  await page.goto(url);
  await page.waitForSelector('canvas');
  await page.waitForTimeout(1_500);
}

/** The timeline's rows, top to bottom, by kind; repeated rows (layers, effects) once. */
async function rows(page: Page): Promise<string[]> {
  const names = await timeline(page).locator('[data-row]').evaluateAll((all) => all.map((row) => row.getAttribute('data-row') ?? ''));
  return names.filter((name, i) => names[i - 1] !== name);
}

const height = async (locator: Locator): Promise<number> => (await locator.boundingBox())?.height ?? 0;
const now = async (page: Page): Promise<number> => Number(await page.getByLabel('Scrub').getAttribute('aria-valuenow'));

test.describe('only the rows in use', () => {
  test('a new video shows its ruler and scenes, and little else', async ({ page }) => {
    await open(page);
    expect(await rows(page)).toEqual(['time', 'scenes']);
    // No empty rows with hints in them: that was four rows of height on every new video.
    expect(await height(timeline(page))).toBeLessThan(150);
    await expect(timeline(page).getByText(/No music|Effects at a moment/)).toHaveCount(0);
  });

  test('each kind of thing brings its row, and takes it away again', async ({ page }) => {
    await open(page);
    const empty = await height(timeline(page));

    await page.getByRole('button', { name: '+ Text' }).click();
    expect(await rows(page)).toEqual(['time', 'scenes', 'layers']);
    await page.keyboard.press('Delete');
    expect(await rows(page)).toEqual(['time', 'scenes']);
    // The row's height goes back to the picture rather than staying as spare room.
    await expect.poll(() => height(timeline(page))).toBeLessThan(empty + 2);

    await page.getByTitle(/^Add an effect at the playhead/).click();
    await page.getByRole('dialog', { name: 'Effects' }).locator('[data-effect="flash"]').click();
    expect(await rows(page)).toEqual(['time', 'scenes', 'effects']);

    await addMusic(page);
    expect(await rows(page)).toEqual(['time', 'scenes', 'effects', 'music']);
    await page.getByRole('button', { name: 'Remove music' }).click();
    expect(await rows(page)).toEqual(['time', 'scenes', 'effects']);
  });
});

test.describe('+ Motion, with everything else that can be added', () => {
  test('the add bar holds every item, in order, in the timeline’s header', async ({ page }) => {
    await open(page);
    const ids = await bar(page).locator('[data-add]').evaluateAll((all) => all.map((chip) => chip.getAttribute('data-add')));
    expect(ids).toEqual(VIDEO_ORDER);
    // In the header, beside Play: the timeline's own first row.
    const play = await timeline(page).getByRole('button', { name: 'Play' }).boundingBox();
    const chips = await bar(page).boundingBox();
    expect(Math.abs((play?.y ?? 0) + (play?.height ?? 0) / 2 - ((chips?.y ?? 99) + (chips?.height ?? 0) / 2))).toBeLessThan(4);
    // The tool strip no longer has an Add of its own, and stays one row.
    await expect(page.locator('[data-tool-strip]').getByRole('button', { name: 'Add', exact: true })).toHaveCount(0);
    expect(await height(page.locator('[data-tool-strip]'))).toBeLessThan(80);
  });

  test('gives the selected element a motion in one step, and takes the playhead to its end', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: '+ Text' }).click();
    const before = await now(page);

    await bar(page).locator('[data-add="motion"]').click();
    await expect(toast(page)).toContainText('Motion added — drag it to where it should finish.');
    await expect(timeline(page).locator('[data-row="motion"] [data-motion-bar]')).toBeVisible();
    // Paused at the end of the motion, ready for the drag that says where it goes.
    expect(await now(page)).toBeGreaterThan(before);

    // One undo takes it back out, and leaves the text where it was.
    await page.keyboard.press('ControlOrMeta+z');
    await expect(page.locator('[data-motion-bar]')).toHaveCount(0);
    await expect(page.locator('[data-overlay-clip]')).toHaveCount(1);
    expect(await rows(page)).toEqual(['time', 'scenes', 'layers']);
  });

  test('on something that already moves, it goes to the start and says how to change it', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: '+ Text' }).click();
    await bar(page).locator('[data-add="motion"]').click();
    const end = await now(page);
    await bar(page).locator('[data-add="motion"]').click();
    await expect(toast(page)).toContainText('It already moves.');
    expect(await now(page)).toBeLessThan(end);
    await expect(page.locator('[data-motion-bar]')).toHaveCount(1);
  });

  test('with nothing that can move selected, it says what to do', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: /^2\. / }).click();
    await bar(page).locator('[data-add="motion"]').click();
    await expect(toast(page)).toContainText('Select a photo, some text or an element first.');
    expect(await rows(page)).toEqual(['time', 'scenes']);
  });
});

test.describe('folding the timeline away', () => {
  test('folds to the scenes, gives the picture the room, and is remembered', async ({ page }) => {
    await open(page);
    const canvas = page.locator('canvas').first();
    const before = await height(canvas);
    await page.getByRole('button', { name: '+ Text' }).click();

    await fold(page).click();
    await expect(timeline(page)).toHaveAttribute('data-collapsed', 'true');
    expect(await rows(page)).toEqual(['time', 'scenes']);
    await expect(page.getByRole('button', { name: 'Remove this scene' })).toHaveCount(0);
    await expect.poll(() => height(canvas)).toBeGreaterThan(before);

    // A scene can still be added from the folded timeline.
    await page.getByRole('button', { name: /^Add a scene after this one/ }).click();
    await expect(page.getByRole('dialog', { name: 'Add a scene' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Add a scene' })).toHaveCount(0);

    await page.reload();
    await page.waitForSelector('canvas');
    await expect(timeline(page)).toHaveAttribute('data-collapsed', 'true');
    await fold(page).click();
    await expect(timeline(page)).not.toHaveAttribute('data-collapsed', 'true');
    await expect(page.getByRole('button', { name: 'Remove this scene' })).toBeVisible();
  });

  test('dragging its top edge right down folds it', async ({ page }) => {
    await open(page);
    const edge = await page.locator('[data-timeline-resize]').boundingBox();
    if (!edge) throw new Error('no edge');
    await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2);
    await page.mouse.down();
    await page.mouse.move(edge.x + edge.width / 2, edge.y + 80, { steps: 4 });
    await page.mouse.move(edge.x + edge.width / 2, edge.y + 160, { steps: 4 });
    await page.mouse.up();
    await expect(timeline(page)).toHaveAttribute('data-collapsed', 'true');
  });

  test.describe('in a short window', () => {
    test.use({ viewport: { width: 1366, height: 700 } });

    test('starts folded with nothing stored, and opens for something new without storing it', async ({ page }) => {
      await page.addInitScript(() => { localStorage.removeItem('ms.timeline'); });
      await open(page);
      await expect(timeline(page)).toHaveAttribute('data-collapsed', 'true');

      await page.getByTitle(/^Add an effect at the playhead/).click();
      await page.getByRole('dialog', { name: 'Effects' }).locator('[data-effect="flash"]').click();
      // What was just added is part of the work now: the timeline opens to show it.
      await expect(timeline(page)).not.toHaveAttribute('data-collapsed', 'true');
      expect(await rows(page)).toEqual(['time', 'scenes', 'effects']);
      expect(await page.evaluate(() => localStorage.getItem('ms.timeline'))).toBeNull();
    });
  });
});

test.describe('on a narrow screen', () => {
  test.use({ viewport: { width: 900, height: 1100 } });

  test('the add bar scrolls sideways, by wheel or by its arrow, and the page does not', async ({ page }) => {
    await open(page);
    const row = bar(page);
    const widths = await row.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
    expect(widths.scroll).toBeGreaterThan(widths.client);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);

    const at = async (): Promise<number> => row.evaluate((el) => el.scrollLeft);
    // The add bar's own arrow: in a video the tool strip below may scroll too, with an arrow of its own.
    await row.locator('xpath=..').locator('[data-side-scroll="end"]').click();
    await expect.poll(at).toBeGreaterThan(0);

    await row.evaluate((el) => { el.scrollLeft = 0; });
    const box = await row.boundingBox();
    if (!box) throw new Error('no bar');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 240);
    await expect.poll(at).toBeGreaterThan(0);
    // Every item is still reachable.
    await row.locator('[data-add="music"]').scrollIntoViewIfNeeded();
    await expect(row.locator('[data-add="music"]')).toBeInViewport();
  });
});

test.describe('in a design', () => {
  test('the add bar sits beside the scrubber, with what a design can take', async ({ page }) => {
    await open(page, '/?template=pop-float&aspect=1:1&frozen=1000');
    await expect(timeline(page)).toHaveCount(0);
    const ids = await bar(page).locator('[data-add]').evaluateAll((all) => all.map((chip) => chip.getAttribute('data-add')));
    expect(ids).toEqual(DESIGN_ORDER);
    const scrub = await page.getByLabel('Scrub').boundingBox();
    const chips = await bar(page).boundingBox();
    expect(Math.abs((scrub?.y ?? 0) + (scrub?.height ?? 0) / 2 - ((chips?.y ?? 99) + (chips?.height ?? 0) / 2))).toBeLessThan(12);
  });

  test('+ Motion on a template photo puts its bar on the scrubber', async ({ page }) => {
    await open(page, '/?template=pop-float&aspect=1:1&frozen=1000');
    const box = await page.locator('canvas').first().boundingBox();
    if (!box) throw new Error('no canvas');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.locator('[data-selection-box]')).toBeVisible();
    await bar(page).locator('[data-add="motion"]').click();
    await expect(toast(page)).toContainText('Motion added');
    const motion = await page.locator('[data-motion-bar]').first().boundingBox();
    const scrub = await page.getByLabel('Scrub').boundingBox();
    expect(motion && scrub && Math.abs(motion.y + motion.height / 2 - (scrub.y + scrub.height / 2)) < 16, 'on the scrubber').toBe(true);
  });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the Add sheet is the same list, a scene first in a video', async ({ page }) => {
    await open(page);
    // Counts of nothing are not shown: the summary says what the full timeline holds.
    const summary = page.locator('[data-phone-timeline]');
    await expect(summary).not.toContainText('Layers');
    await expect(summary).not.toContainText('Effects');

    await page.locator('[data-phone-toolbar="main"]').getByRole('button', { name: 'Add', exact: true }).tap();
    const ids = await page.getByRole('group', { name: 'Add' }).locator('[data-add]').evaluateAll((all) => all.map((tile) => tile.getAttribute('data-add')));
    expect(ids).toEqual(['scene', ...VIDEO_ORDER]);

    await page.getByRole('group', { name: 'Add' }).locator('[data-add="text"]').tap();
    await expect(summary).toContainText('Layers · 1');
  });

  test('a design has Add too, without scenes, video, sound or music', async ({ page }) => {
    await open(page, '/?template=pop-float&aspect=4:5&frozen=1000');
    await page.locator('[data-phone-toolbar="main"]').getByRole('button', { name: 'Add', exact: true }).tap();
    const ids = await page.getByRole('group', { name: 'Add' }).locator('[data-add]').evaluateAll((all) => all.map((tile) => tile.getAttribute('data-add')));
    expect(ids).toEqual(DESIGN_ORDER);
  });

  test('a selected text has Motion among its tools', async ({ page }) => {
    await open(page);
    await page.locator('[data-phone-toolbar="main"]').getByRole('button', { name: 'Add', exact: true }).tap();
    await page.getByRole('group', { name: 'Add' }).locator('[data-add="text"]').tap();
    const tools = page.locator('[data-phone-toolbar="selection"]');
    await tools.getByRole('button', { name: 'Motion', exact: true }).tap();
    await expect(toast(page)).toContainText('Motion added');
    await expect(page.locator('[data-phone-timeline]')).toContainText('Motion');
  });
});
