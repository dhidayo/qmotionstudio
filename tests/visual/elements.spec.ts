import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * Elements people add (D-158): shapes, animated stickers and numbers.
 *
 * "shapes can be added, selected and customized too … animations such as
 * Youtube like, YouTube subscribe, FaceBook like, lots of library for this …
 * we may be having scroll of applicable elements on smaller screen" and "you
 * may have number elements that can be added and modified."
 */

test.skip(process.env['PW_PROD'] === '1', 'Reads the dev-only editor handle, which the production build rightly omits.');

const DESKTOP = { width: 1440, height: 900 };
const SELECTION = '[data-selection-box]';

type Handle = {
  editor: { getState(): { project: { overlays: { id: string; kind: string; content: Record<string, unknown>; transform: Record<string, number> }[] } } };
  clock: { seek(ms: number): void };
  overlays: { getState(): { openElementPicker(state: object | null): void } };
};

async function open(page: Page, url = '/?template=el-cta-button&aspect=1:1&frozen=3000'): Promise<void> {
  await page.goto(url);
  await page.waitForSelector('canvas');
  await page.waitForTimeout(1_500);
}

const picker = (page: Page): Locator => page.getByRole('dialog', { name: 'Elements' });

/** "+ Shape", "+ Sticker" or "+ Number" in the add bar, then a tile. */
async function add(page: Page, chip: 'shape' | 'sticker' | 'number', tile: string): Promise<void> {
  await page.locator(`[data-add-bar] [data-add="${chip}"]`).first().click();
  await expect(picker(page)).toBeVisible();
  await picker(page).locator(`[data-element-tile="${tile}"]`).click();
  await expect(picker(page)).toHaveCount(0);
  await expect(page.locator(SELECTION)).toBeVisible();
}

async function overlays(page: Page): Promise<{ kind: string; content: Record<string, unknown>; transform: Record<string, number> }[]> {
  return page.evaluate(() => (globalThis as unknown as { __motionStudio: Handle }).__motionStudio.editor.getState().project.overlays);
}

async function seek(page: Page, ms: number): Promise<void> {
  await page.evaluate((t) => { (globalThis as unknown as { __motionStudio: Handle }).__motionStudio.clock.seek(t); }, ms);
  await page.waitForTimeout(250);
}

/**
 * The pixels of the canvas inside the selection box, summed in a coarse grid.
 * `inner` keeps to the middle of the box, away from the design behind it.
 */
async function pixelsInSelection(page: Page, inner = 1): Promise<number[]> {
  const found = await page.locator(SELECTION).boundingBox();
  if (!found) throw new Error('nothing selected');
  const box = {
    x: found.x + (found.width * (1 - inner)) / 2,
    y: found.y + (found.height * (1 - inner)) / 2,
    width: found.width * inner,
    height: found.height * inner,
  };
  return page.evaluate((b) => {
    const canvas = document.querySelector('canvas');
    const cx = canvas?.getContext('2d');
    if (!canvas || !cx) throw new Error('no canvas');
    const r = canvas.getBoundingClientRect();
    const sx = canvas.width / r.width;
    const sy = canvas.height / r.height;
    const out: number[] = [];
    for (let j = 0; j < 8; j++) {
      for (let i = 0; i < 8; i++) {
        const x = Math.floor((b.x - r.left + ((i + 0.5) * b.width) / 8) * sx);
        const y = Math.floor((b.y - r.top + ((j + 0.5) * b.height) / 8) * sy);
        const d = cx.getImageData(x, y, 1, 1).data;
        out.push((d[0] ?? 0) + (d[1] ?? 0) + (d[2] ?? 0));
      }
    }
    return out;
  }, box);
}

const difference = (a: number[], b: number[]): number => a.reduce((sum, v, i) => sum + Math.abs(v - (b[i] ?? 0)), 0) / a.length;

test.describe('on a computer', () => {
  test.use({ viewport: DESKTOP });

  test('the add bar opens the library on its own kind, which searches and switches', async ({ page }) => {
    await open(page);
    await page.locator('[data-add-bar] [data-add="shape"]').first().click();
    const dialog = picker(page);
    await expect(dialog.getByRole('tab', { name: 'Shapes' })).toHaveAttribute('aria-selected', 'true');
    await expect(dialog.locator('[data-element-tile="shape:star"]')).toBeVisible();
    await expect(dialog.locator('[data-element-tile^="counter:"]')).toHaveCount(0);

    await dialog.getByRole('tab', { name: 'Numbers' }).click();
    await expect(dialog.locator('[data-element-tile="counter:followers"]')).toBeVisible();
    await expect(dialog.locator('[data-element-tile^="shape:"]')).toHaveCount(0);

    await dialog.getByRole('tab', { name: 'All' }).click();
    // Words are matched from their start: "tick" finds the tick, not "sticker".
    await dialog.getByLabel('Search elements').fill('tick');
    await expect(dialog.locator('[data-element-tile="sticker:check"]')).toBeVisible();
    await expect(dialog.locator('[data-element-tile^="shape:"]')).toHaveCount(0);

    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
  });

  test('a shape is added, styled, and stretched by its sides in one undo step', async ({ page }) => {
    await open(page);
    await add(page, 'shape', 'shape:star');
    await expect(page.locator('section[data-section="Shape"]')).toBeVisible();

    // A colour of the look restyles the picture.
    const before = await pixelsInSelection(page);
    await page.getByRole('button', { name: 'Fill: Text' }).click();
    await expect.poll(async () => difference(before, await pixelsInSelection(page))).toBeGreaterThan(5);

    // The east side widens the shape's own box; its scale stays as it was.
    const start = (await overlays(page))[0];
    const box = await page.locator(SELECTION).boundingBox();
    if (!box) throw new Error('no box');
    const east = { x: box.x + box.width, y: box.y + box.height / 2 };
    await page.mouse.move(east.x, east.y);
    await page.mouse.down();
    await page.mouse.move(east.x + 30, east.y);
    await page.mouse.move(east.x + 60, east.y);
    await page.mouse.up();
    const after = (await overlays(page))[0];
    expect(Number(after?.content['w'])).toBeGreaterThan(Number(start?.content['w']) * 1.2);
    expect(after?.content['h']).toBe(start?.content['h']);
    expect(after?.transform['scaleX']).toBe(start?.transform['scaleX']);

    await page.keyboard.press('ControlOrMeta+z');
    const undone = (await overlays(page))[0];
    expect(undone?.content['w']).toBe(start?.content['w']);
    expect(undone?.transform['x']).toBe(start?.transform['x']);
  });

  test('a line has two ends to pull, and a sticker only corners', async ({ page }) => {
    await open(page);
    await add(page, 'shape', 'shape:line');
    const grips = async (): Promise<string[]> =>
      page.locator(`${SELECTION} [data-grip]`).evaluateAll((all) => all.map((g) => g.getAttribute('data-grip') ?? ''));
    expect((await grips()).sort()).toEqual(['e', 'rotate', 'w']);
    await add(page, 'sticker', 'sticker:check');
    expect((await grips()).sort()).toEqual(['ne', 'nw', 'rotate', 'se', 'sw']);
  });

  test('a sticker plays, holds still when asked, and can be changed for another', async ({ page }) => {
    await open(page);
    await add(page, 'sticker', 'sticker:check');
    await expect(page.locator('section[data-section="Sticker"]')).toBeVisible();

    // The middle of the tick's circle, where the design behind does not show.
    await seek(page, 2_300);
    const early = await pixelsInSelection(page, 0.5);
    await seek(page, 3_400);
    const late = await pixelsInSelection(page, 0.5);
    expect(difference(early, late)).toBeGreaterThan(5);

    await page.getByRole('group', { name: 'Animation' }).getByRole('button', { name: 'Still' }).click();
    await seek(page, 2_300);
    const stillEarly = await pixelsInSelection(page, 0.5);
    await seek(page, 3_400);
    const stillLate = await pixelsInSelection(page, 0.5);
    expect(difference(stillEarly, stillLate)).toBeLessThan(1);

    // Change: the library opens on stickers, to put another in its place.
    await page.locator('[data-selection-toolbar]').getByRole('button', { name: 'Change' }).click();
    await expect(picker(page).getByRole('heading', { name: 'Change sticker' })).toBeVisible();
    await expect(picker(page).locator('[data-element-tile^="shape:"]')).toHaveCount(0);
  });

  test('a number counts, keeps its box while it counts, and counts to what is typed', async ({ page }) => {
    await open(page);
    await add(page, 'number', 'counter:followers');
    await expect(page.locator('section[data-section="Number"]')).toBeVisible();

    await seek(page, 300);
    const early = await pixelsInSelection(page);
    const earlyBox = await page.locator(SELECTION).boundingBox();
    await seek(page, 3_000);
    const late = await pixelsInSelection(page);
    const lateBox = await page.locator(SELECTION).boundingBox();
    expect(difference(early, late)).toBeGreaterThan(5);
    expect(Math.abs((earlyBox?.width ?? 0) - (lateBox?.width ?? 1))).toBeLessThan(1);

    const to = page.getByLabel('Counts to');
    await to.fill('2,500');
    await to.press('Enter');
    await expect.poll(async () => (await overlays(page))[0]?.content['to']).toBe(2500);
    await expect.poll(async () => difference(late, await pixelsInSelection(page))).toBeGreaterThan(5);
  });

  test('the picture’s menu adds an element, and the library lists what is on it', async ({ page }) => {
    await open(page);
    await add(page, 'shape', 'shape:heart');
    await page.keyboard.press('Escape');
    const canvas = await page.locator('canvas').boundingBox();
    if (!canvas) throw new Error('no canvas');
    await page.mouse.click(canvas.x + 12, canvas.y + 12, { button: 'right' });
    await page.getByRole('menuitem', { name: /Add an element/ }).click();
    const dialog = picker(page);
    await expect(dialog.getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'true');
    const current = dialog.locator('[data-element-current]');
    await expect(current.getByRole('button', { name: /Select the heart/ })).toBeVisible();
    await current.getByRole('button', { name: /Delete the heart/ }).click();
    await expect(current).toHaveCount(0);
    expect(await overlays(page)).toHaveLength(0);
  });

  test('elements are kept when the page is reloaded', async ({ page }) => {
    // No design in the address, so a reload reopens the saved project.
    await open(page, '/');
    await add(page, 'shape', 'shape:badge');
    await add(page, 'sticker', 'sticker:check');
    await add(page, 'number', 'counter:rating');
    // Past the autosave's wait, and written (persistence.spec's `settled`).
    await page.waitForTimeout(1_200);
    await expect(page.locator('[data-save-state]')).toHaveAttribute('data-save-state', 'saved', { timeout: 10_000 });
    await page.reload();
    await page.waitForSelector('canvas');
    await expect.poll(async () => (await overlays(page)).map((o) => o.kind)).toEqual(['shape', 'sticker', 'counter']);
  });

  test('in a video an element is a clip named for what it is, and stays when the video becomes an image', async ({ page }) => {
    await open(page, '/?template=quick-pitch&aspect=9:16&frozen=1000');
    await add(page, 'sticker', 'sticker:check');
    await expect(page.locator('[data-overlay-clip]').first()).toHaveAttribute('aria-label', /^Check tick, layer 1/);
    await page.getByRole('group', { name: 'Mode' }).getByRole('button', { name: 'Image', exact: true }).click();
    await expect.poll(async () => (await overlays(page)).map((o) => o.kind)).toEqual(['sticker']);
  });
});

test.describe('in the export', () => {
  test.use({ viewport: { width: 1500, height: 940 } });

  test('shapes and stickers are drawn into the video as in the preview', async ({ page }) => {
    test.setTimeout(240_000);
    // Captures the download instead of saving it (export.spec's pattern).
    await page.addInitScript(() => {
      const store = globalThis as unknown as { __exported?: { blob: Blob } };
      HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement) {
        if (!this.download) return;
        void fetch(this.href).then((r) => r.blob()).then((blob) => { store.__exported = { blob }; });
      };
    });
    await open(page, '/?template=el-cta-button&aspect=1:1');

    // A pure green box over the whole frame, and a tick in the top-left quarter.
    await page.evaluate(() => {
      const h = (globalThis as unknown as { __motionStudio: { editor: { getState(): { dispatch(a: unknown): void } }; actions: Record<string, (...args: unknown[]) => unknown> } }).__motionStudio;
      const place = { startMs: 0, endMs: 10_000, track: 0 };
      const green = h.actions['makeOverlay']?.({ kind: 'shape', shape: 'rect', w: 3, h: 3, fill: { hex: '#00ff00' }, stroke: null, strokeWidth: 0.01, corner: 0, shadow: false }, place) as Record<string, unknown>;
      const tick = h.actions['makeOverlay']?.({ kind: 'sticker', sticker: 'check', play: 'loop', speed: 1 }, { ...place, track: 1 }) as Record<string, unknown>;
      h.editor.getState().dispatch(h.actions['addOverlay']?.({ ...green, enterAnim: 'none', exitAnim: 'none' }));
      h.editor.getState().dispatch(h.actions['addOverlay']?.({ ...tick, enterAnim: 'none', exitAnim: 'none', transform: { x: 0.25, y: 0.25, scaleX: 1.5, scaleY: 1.5 } }));
    });

    await page.getByTitle(/^Export \(/).click();
    const dialog = page.getByRole('dialog', { name: 'Export' });
    await expect(dialog).toBeVisible();
    // An image saves as a picture first; the video is beside it (D-155).
    await dialog.getByRole('group', { name: 'Save as' }).getByRole('button', { name: 'Video', exact: true }).click();
    // WebM: some Chromium builds cannot encode H.264, and every one can VP9.
    await page.getByRole('button', { name: 'WebM · VP9' }).click();
    await page.getByRole('button', { name: /^Export( again)?$/ }).last().click();
    await page.waitForFunction(() => (globalThis as unknown as { __exported?: unknown }).__exported !== undefined, undefined, { timeout: 180_000 });

    const frames = await page.evaluate(async () => {
      const { blob } = (globalThis as unknown as { __exported: { blob: Blob } }).__exported;
      const url = URL.createObjectURL(blob);
      const video = document.createElement('video');
      video.src = url;
      video.muted = true;
      await new Promise<void>((resolve, reject) => {
        video.onloadeddata = () => { resolve(); };
        video.onerror = () => { reject(new Error('the exported file would not decode')); };
      });
      const grab = async (seconds: number): Promise<{ green: number[]; tick: number[] }> => {
        video.currentTime = seconds;
        await new Promise<void>((resolve) => { video.onseeked = () => { resolve(); }; });
        const canvas = document.createElement('canvas');
        canvas.width = 100;
        canvas.height = 100;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('no 2d');
        ctx.drawImage(video, 0, 0, 100, 100);
        const at = (x: number, y: number): number[] => [...ctx.getImageData(x, y, 1, 1).data].slice(0, 3);
        // The tick sits at (25, 25), its circle 22 across; this is near the circle's edge.
        return { green: at(80, 80), tick: at(42, 25) };
      };
      const early = await grab(0.1);
      const later = await grab(1.3);
      URL.revokeObjectURL(url);
      return { early, later };
    });

    const [r = 0, g = 0, b = 0] = frames.later.green;
    expect(g).toBeGreaterThan(200);
    expect(r).toBeLessThan(60);
    expect(b).toBeLessThan(60);
    // At 0.1s the tick's circle is still growing and has not reached here; by 1.3s it has.
    const moved = frames.early.tick.reduce((sum, v, i) => sum + Math.abs(v - (frames.later.tick[i] ?? 0)), 0);
    expect(moved).toBeGreaterThan(60);
  });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the Add sheet opens the library as a sheet that scrolls; a tap adds and selects', async ({ page }) => {
    await open(page, '/?template=pop-float&aspect=1:1&frozen=3000');
    await page.locator('[data-phone-toolbar="main"]').getByRole('button', { name: 'Add', exact: true }).tap();
    await page.locator('[data-add="sticker"]').tap();
    const dialog = picker(page);
    await expect(dialog.getByRole('tab', { name: 'Stickers' })).toHaveAttribute('aria-selected', 'true');
    await dialog.getByRole('tab', { name: 'All' }).tap();
    const grid = dialog.locator('[data-element-grid]');
    const scrolls = await grid.evaluate((el) => el.scrollHeight > el.clientHeight + 10);
    expect(scrolls).toBe(true);

    await dialog.locator('[data-element-tile="counter:step"]').tap();
    await expect(dialog).toHaveCount(0);
    const toolbar = page.locator('[data-phone-toolbar="selection"]');
    await expect(toolbar.getByRole('button', { name: 'Number' })).toBeVisible();
    const clipped = await toolbar.locator('button span').evaluateAll((spans) => spans.some((s) => s.scrollWidth > s.clientWidth + 1));
    expect(clipped).toBe(false);

    // Its first tool opens its own settings in the sheet.
    await toolbar.getByRole('button', { name: 'Number' }).tap();
    await expect(page.getByRole('button', { name: 'Number', expanded: true })).toBeVisible();
    await expect(page.getByLabel('Counts to')).toBeVisible();
  });

  test('on a short phone the library still fits, with its chips in one row', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 600 });
    await open(page, '/?template=pop-float&aspect=1:1&frozen=3000');
    await page.evaluate(() => { (globalThis as unknown as { __motionStudio: Handle }).__motionStudio.overlays.getState().openElementPicker({}); });
    const dialog = picker(page);
    const box = await dialog.locator('> div').boundingBox();
    expect(box?.y ?? -1).toBeGreaterThanOrEqual(0);
    const row = dialog.locator('[data-chip-row="elements-kind"]');
    const rowBox = await row.boundingBox();
    const chips = await row.getByRole('tab').evaluateAll((all) => all.map((c) => c.getBoundingClientRect().top));
    expect(new Set(chips.map((t) => Math.round(t))).size).toBe(1);
    expect(rowBox?.height ?? 99).toBeLessThan(44);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
