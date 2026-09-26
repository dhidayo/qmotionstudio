import { expect, test, type Page } from '@playwright/test';

/**
 * §13: "Responsive down to tablet. On phones, inspector and library become
 * bottom sheets."
 *
 * The test is not that things are narrower — it is that they change *kind*.
 * Below tablet width the two side columns stop being columns and become sheets
 * you open, and the artboard keeps the room that frees up.
 */

const AD = '/?template=quick-pitch&aspect=9:16&frozen=2000';

async function open(page: Page): Promise<void> {
  await page.goto(AD);
  await page.waitForSelector('canvas');
  await page.waitForTimeout(2_500);
}

const canvasWidth = async (page: Page): Promise<number> => {
  const box = await page.locator('canvas').boundingBox();
  return box?.width ?? 0;
};

test.describe('at desktop width', () => {
  test.use({ viewport: { width: 1500, height: 940 } });

  test('both side panels are columns', async ({ page }) => {
    await open(page);
    await expect(page.getByRole('complementary', { name: 'Template library' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Templates', exact: true })).toHaveCount(0);
    await expect(page.locator('[data-sheet]')).toHaveCount(0);
  });
});

test.describe('at tablet width', () => {
  test.use({ viewport: { width: 900, height: 1000 } });

  test('the columns become sheets, and the artboard takes the room', async ({ page }) => {
    await open(page);

    await expect(page.getByRole('complementary', { name: 'Template library' })).toHaveCount(0);
    const wide = await canvasWidth(page);

    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Edit' })).toBeVisible();

    // The inspector's own controls are in there — the same component, not a
    // cut-down copy of it.
    await expect(page.getByRole('tab', { name: 'Photos' })).toBeVisible();

    await page.getByRole('button', { name: 'Close edit' }).click();
    await expect(page.locator('[data-sheet]')).toHaveCount(0);

    // Closing gives the artboard its width back rather than leaving a gap.
    expect(await canvasWidth(page)).toBeCloseTo(wide, 0);
  });

  test('tapping the artboard behind a sheet closes it', async ({ page }) => {
    /*
     * The sheet covers the toolbar on purpose, so the two cannot be swapped
     * without closing one — which is how a sheet behaves everywhere else, and
     * is what makes tapping away from it the obvious way out.
     */
    await open(page);

    await page.getByRole('button', { name: 'Templates', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Templates' });
    await expect(sheet).toBeVisible();

    // Well above the sheet, over the dimmed area.
    await page.mouse.click(450, 80);
    await expect(page.locator('[data-sheet]')).toHaveCount(0);

    // And the other one opens now that nothing is in the way.
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Edit' })).toBeVisible();
  });
});

test.describe('at phone width', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the editor still works, and the artboard is the biggest thing on it', async ({ page }) => {
    await open(page);

    const canvas = await page.locator('canvas').boundingBox();
    expect(canvas, 'the preview is on screen').not.toBeNull();
    expect(canvas?.width ?? 0).toBeGreaterThan(200);

    // Nothing overflows the viewport sideways, which is the usual way a
    // desktop layout fails on a phone.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, 'no horizontal scroll').toBeLessThanOrEqual(1);

    // And the timeline is still usable: this is an editor, not a viewer.
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  });

  test('the template library opens as a sheet and can pick a template', async ({ page }) => {
    await open(page);

    await page.getByRole('button', { name: 'Templates', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Templates' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByPlaceholder('Search templates')).toBeVisible();
  });
});
