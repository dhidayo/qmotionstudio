import { expect, test, type Page } from '@playwright/test';

/**
 * §13: "Reloading the tab must not lose work."
 *
 * These use a plain URL on purpose. `?template=` and `?scene=` are deep links
 * that deliberately start fresh — they are how the thumbnail job and the rest
 * of the visual suite drive the app — so persistence can only be tested the
 * way a person meets it, by opening the editor and reloading it.
 *
 * Playwright gives each test its own browser context, so each one gets its own
 * empty IndexedDB and they cannot leak into each other.
 */

test.use({ viewport: { width: 1500, height: 940 } });

const MARKER = 'PERSISTENCE CHECK 42';

async function openEditor(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('canvas');
  await page.waitForTimeout(2_500);
}

/** Types into a field the way React's own onChange expects. */
async function setOverlayText(page: Page, text: string): Promise<void> {
  const field = page.getByLabel('Overlay text');
  await field.fill(text);
}

const saveState = (page: Page) => page.locator('[data-save-state]');

/**
 * Waits until the *latest* edit is on disk, not merely until the badge has
 * said "saved" at some point.
 *
 * The badge cannot distinguish versions: it reads "saved" from the previous
 * write while the newest change is still inside the debounce, so asserting on
 * it alone and reloading immediately reliably tests the wrong thing. Sitting
 * out the debounce first is what makes this about persistence rather than
 * about timing.
 */
async function settled(page: Page): Promise<void> {
  await page.waitForTimeout(1_200);
  await expect(saveState(page)).toHaveAttribute('data-save-state', 'saved', { timeout: 10_000 });
}

test.describe('autosave', () => {
  test('reports saved rather than failing forever', async ({ page }) => {
    /*
     * The regression this exists for: all three IndexedDB stores were created
     * against one database name, so the first to open created it holding a
     * single store and every transaction against the other two threw. The save
     * failed on the very first attempt and then on every attempt after it, and
     * the badge read "Not saved" for the rest of the session.
     */
    await openEditor(page);
    await page.getByRole('button', { name: 'Motion Ads' }).click();
    await page.getByTitle('Add a text overlay').click();
    await setOverlayText(page, MARKER);

    await expect(saveState(page)).toHaveAttribute('data-save-state', 'saved', { timeout: 10_000 });
  });

  test('a reload brings the work back', async ({ page }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Motion Ads' }).click();
    await page.getByTitle('Add a text overlay').click();
    await setOverlayText(page, MARKER);
    await settled(page);

    await page.reload();
    await page.waitForSelector('canvas');
    await page.waitForTimeout(2_500);

    /*
     * The clip is labelled with its own text, so finding it is already proof
     * the overlay came back intact. What is deliberately *not* restored is the
     * selection — which panel was open is a property of a session, not of the
     * document — so the panel has to be reopened before its field exists.
     */
    await expect(page.getByTitle(MARKER)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Motion Ads' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await page.getByTitle(MARKER).click();
    await expect(page.getByLabel('Overlay text')).toHaveValue(MARKER);
  });

  test('a photograph comes back with it, decoded', async ({ page }) => {
    // Blobs are stored separately and re-decoded on restore, so this checks
    // the other half of the save: the thumbnail is drawn from a real bitmap.
    await openEditor(page);
    await page.getByRole('button', { name: 'Try sample photos' }).click();
    await page.waitForTimeout(2_000);
    await settled(page);

    await page.reload();
    await page.waitForSelector('canvas');
    await page.waitForTimeout(3_000);

    // Blob-backed, i.e. the tile is showing a bitmap this session decoded
    // from the stored file — not a placeholder and not a stale reference.
    const tiles = page.locator('[aria-label^="Photo "] span');
    await expect(tiles.first()).toBeVisible();
    await expect
      .poll(async () =>
        tiles.evaluateAll((nodes) =>
          nodes.filter((node) => getComputedStyle(node).backgroundImage.includes('blob:')).length,
        ),
      )
      .toBeGreaterThan(0);
  });
});

test.describe('undo has a floor', () => {
  test('cannot walk back past the document it opened', async ({ page }) => {
    /*
     * A project opens as a placeholder and only becomes an ad once its
     * template has been fetched and expanded — and that expansion went through
     * the ordinary undoable pipeline. Enough presses of ⌘Z therefore walked
     * back *through* it and left the editor showing the bare M0 test card,
     * which reads as the application having broken. Opening a document is not
     * an edit to it.
     */
    await page.goto('/?template=quick-pitch&aspect=9:16&frozen=1600');
    await page.waitForSelector('canvas');
    await page.waitForTimeout(2_500);

    await expect(page.getByText('Scene 1 of 5')).toBeVisible();

    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('ControlOrMeta+z');
      await page.waitForTimeout(60);
    }

    await expect(page.getByText('Scene 1 of 5'), 'still the ad it opened').toBeVisible();
    await expect(page.getByText('__placeholder__')).toHaveCount(0);
  });

  test('still undoes ordinary edits', async ({ page }) => {
    // The floor must not cost the undo people actually want.
    await page.goto('/?template=quick-pitch&aspect=9:16&frozen=1600');
    await page.waitForSelector('canvas');
    await page.waitForTimeout(2_500);

    await page.getByTitle('Add a text overlay').click();
    await expect(page.locator('[data-selection-box]')).toBeVisible();

    await page.keyboard.press('ControlOrMeta+z');
    await expect(page.locator('[data-selection-box]')).toHaveCount(0);
    await expect(page.getByText('Scene 1 of 5')).toBeVisible();
  });
});
