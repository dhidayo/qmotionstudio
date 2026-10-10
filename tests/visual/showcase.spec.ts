import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * M3 — Showcase mode.
 *
 * The exit criterion is "I can load photos, edit every control, and see it
 * reflected live", so these drive the real controls rather than the store.
 */

type Stats = { frameCount: number; buildCount: number; lastFrameMs: number; lastBuildMs: number };

async function readStats(page: Page): Promise<Stats> {
  return page.evaluate(() => {
    const handle = (globalThis as unknown as { __motionStudio?: { stats: Stats } }).__motionStudio;
    if (!handle) throw new Error('renderer stats handle is missing');
    return { ...handle.stats };
  });
}

test.use({ viewport: { width: 1500, height: 940 } });

test.beforeEach(async ({ page }) => {
  await page.goto('/?frozen=4000');
  await page.waitForSelector('canvas');
  // The template and samples load lazily (D-029).
  await page.waitForTimeout(800);
});

test.describe('library', () => {
  test('groups templates by category', async ({ page }) => {
    for (const category of ['Depth Stage', 'Angle Stage', 'Kinetic Type']) {
      await expect(page.getByRole('heading', { name: category })).toBeVisible();
    }
  });

  test('search narrows to matching templates and clears again', async ({ page }) => {
    const search = page.getByRole('searchbox', { name: 'Search templates' });
    await search.fill('stack');

    await expect(page.getByRole('button', { name: 'Card Stack', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Angle Stage' })).toBeHidden();

    await search.fill('');
    await expect(page.getByRole('heading', { name: 'Angle Stage' })).toBeVisible();
  });

  test('searching a category name finds the whole group', async ({ page }) => {
    await page.getByRole('searchbox', { name: 'Search templates' }).fill('kinetic');
    await expect(page.getByRole('heading', { name: 'Kinetic Type' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Depth Stage' })).toBeHidden();
  });

  test('the free/pro filter splits the library', async ({ page }) => {
    await page.getByRole('button', { name: 'Pro', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Kinetic Type' })).toBeVisible();
    // Parallax Depth is free, so it should be gone.
    await expect(page.getByTitle(/receding planes/)).toBeHidden();
  });

  test('favourites persist across a reload', async ({ page }) => {
    await page.getByRole('button', { name: 'Favourite Fan Out' }).click();
    await page.getByRole('button', { name: /^★/ }).click();
    await expect(page.getByTitle(/fanned across an arc/)).toBeVisible();

    await page.reload();
    await page.waitForSelector('canvas');
    await expect(page.getByRole('button', { name: 'Unfavourite Fan Out' })).toBeAttached();
  });

  test('picking a template changes what renders', async ({ page }) => {
    test.skip(process.env['PW_PROD'] === '1', 'Reads the dev-only renderer handle, which the production build rightly omits.');
    const before = await readStats(page);
    await page.getByTitle(/full-bleed photo/).click();
    await page.waitForTimeout(900);
    const after = await readStats(page);
    // A different template is a different structure, so it must rebuild.
    expect(after.buildCount).toBeGreaterThan(before.buildCount);
  });
});

test.describe('inspector', () => {
  test('photo tiles show the decoded media, not empty boxes', async ({ page }) => {
    /*
     * A regression guard for a race, not for a layout.
     *
     * Decoded bitmaps land in a Map inside MediaStore, which React cannot
     * observe. The inspector renders once; without a subscription its tiles
     * keep whatever they had at first paint, which is nothing. That was
     * invisible while the sample set was 95KB of synthesised gradient and
     * unmissable the moment it became real photography (D-049) — the decode
     * simply started losing the race. The store has notified since.
     */
    const tiles = page.locator('[aria-label^="Photo "] span');
    await expect(tiles.first()).toBeVisible();

    await expect
      .poll(async () =>
        tiles.evaluateAll((nodes) =>
          nodes.filter((node) => getComputedStyle(node).backgroundImage.includes('blob:')).length,
        ),
      )
      .toBeGreaterThan(0);

    // Every tile, not just the first: a partially-loaded set is the same bug.
    const total = await tiles.count();
    const filled = await tiles.evaluateAll((nodes) =>
      nodes.filter((node) => getComputedStyle(node).backgroundImage.includes('blob:')).length,
    );
    expect(filled, `${filled} of ${total} photo tiles have an image`).toBe(total);
  });

  test('shows the template’s own text slots', async ({ page }) => {
    await page.getByRole('tab', { name: 'Text' }).click();
    // Parallax Depth declares a headline and a caption — a tile each (D-124).
    await expect(page.locator('[data-text-tile="text:headline"]')).toContainText('Headline');
    await expect(page.locator('[data-text-tile="text:caption"]')).toContainText('Caption');
  });

  test('editing text reflects in the render without rebuilding per keystroke', async ({ page }) => {
    test.skip(process.env['PW_PROD'] === '1', 'Reads the dev-only renderer handle, which the production build rightly omits.');
    const field = await headlineField(page);

    const before = await readStats(page);
    await field.fill('A brand new headline');
    await page.waitForTimeout(500);
    const after = await readStats(page);

    // Text content is structural — it changes wrapping — so it does rebuild,
    // but once per distinct value, not once per frame.
    expect(after.buildCount).toBeGreaterThan(before.buildCount);
    expect(after.buildCount - before.buildCount).toBeLessThan(40);
  });

  test('a palette change repaints without rebuilding (D-006)', async ({ page }) => {
    test.skip(process.env['PW_PROD'] === '1', 'Reads the dev-only renderer handle, which the production build rightly omits.');
    await page.getByRole('tab', { name: 'Look' }).click();
    await page.waitForTimeout(200);

    const before = await readStats(page);
    // Looks on the same kind of ground, so only colours change (D-121).
    for (const look of ['paper', 'forest', 'tide']) {
      await page.locator(`[data-look="${look}"]`).click();
    }
    await page.waitForTimeout(400);
    const after = await readStats(page);

    // The whole point of the structural/cosmetic split: colours resolve at
    // draw time, so dragging a colour picker must never cost a build.
    expect(after.buildCount - before.buildCount).toBe(0);
  });

  test('photo controls are bounded by the template’s own slots', async ({ page }) => {
    // Parallax Depth declares min 2, max 6.
    await expect(page.getByText('of 6')).toBeVisible();
    const increase = page.getByRole('button', { name: 'Increase Photo count' });
    // Click up to the ceiling; the control disables itself once there.
    for (let i = 0; i < 8; i++) {
      if (await increase.isDisabled()) break;
      await increase.click();
    }
    await expect(increase).toBeDisabled();
    await expect(page.getByText('of 6')).toBeVisible();
  });
});

/** The headline's field, in its tile in the Text tab (D-124). */
async function headlineField(page: Page): Promise<Locator> {
  await page.getByRole('tab', { name: 'Text' }).click();
  await page.locator('[data-text-tile="text:headline"]').getByRole('button', { expanded: false }).click();
  return page.getByRole('textbox', { name: 'Headline' });
}

test.describe('history', () => {
  test('undo and redo round-trip a document edit', async ({ page }) => {
    const field = await headlineField(page);
    const original = await field.inputValue();

    await field.fill('Changed');
    await expect(field).toHaveValue('Changed');

    await page.getByRole('button', { name: /^Undo/ }).click();
    await expect(field).toHaveValue(original);

    await page.getByRole('button', { name: /^Redo/ }).click();
    await expect(field).toHaveValue('Changed');
  });

  test('a slider drag is one undo step, not one per frame', async ({ page }) => {
    await page.getByRole('tab', { name: 'Look' }).click();
    const slider = page.getByRole('slider', { name: 'Vignette' });

    await slider.focus();
    // Ten discrete changes within one interaction.
    for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('button', { name: /^Undo Change vignette/ })).toBeEnabled();

    // One undo takes the whole run back, not a tenth of it.
    await page.getByRole('button', { name: /^Undo/ }).click();
    await expect(page.getByRole('button', { name: 'Nothing to undo' })).toBeDisabled();
  });

  test('⌘Z works from the keyboard', async ({ page }) => {
    await page.getByRole('tab', { name: 'Look' }).click();
    await page.locator('[data-look="paper"]').click();
    await expect(page.getByRole('button', { name: /^Undo Change look/ })).toBeEnabled();

    await page.keyboard.press('ControlOrMeta+z');
    await expect(page.getByRole('button', { name: 'Nothing to undo' })).toBeDisabled();
  });
});
