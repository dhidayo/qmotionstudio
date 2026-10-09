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
    await expect(page.locator('[data-sheet]')).toHaveCount(0);
    // And the same way in as a phone's, under the picture (D-116).
    await expect(page.locator('[data-tool-strip]').getByRole('button', { name: 'Choose a design' })).toBeVisible();
  });
});

test.describe('at tablet width', () => {
  test.use({ viewport: { width: 900, height: 1000 } });

  test('the columns become sheets, and the artboard takes the room', async ({ page }) => {
    await open(page);

    await expect(page.getByRole('complementary', { name: 'Template library' })).toHaveCount(0);
    const wide = await canvasWidth(page);

    // The tool strip's Photos opens the inspector as a sheet (D-116).
    await page.locator('[data-tool-strip]').getByRole('button', { name: 'Photos', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Photos, text and style' })).toBeVisible();

    // The inspector's own controls are in there — the same component, not a
    // cut-down copy of it.
    await expect(page.getByRole('tab', { name: 'Photos' })).toBeVisible();

    await page.getByRole('button', { name: 'Close photos, text and style' }).click();
    await expect(page.locator('[data-sheet]')).toHaveCount(0);

    // Closing gives the artboard its width back rather than leaving a gap.
    expect(await canvasWidth(page)).toBeCloseTo(wide, 0);
  });

  test('tapping outside a panel closes it', async ({ page }) => {
    await open(page);

    // Designs opens as a window over the editor (D-116); a tap outside it closes it.
    await page.locator('[data-tool-strip]').getByRole('button', { name: 'Choose a design' }).click();
    const designs = page.getByRole('dialog', { name: 'Choose a design' });
    await expect(designs).toBeVisible();
    await page.mouse.click(12, 500);
    await expect(designs).toHaveCount(0);

    // And the inspector sheet opens now that nothing is in the way.
    await page.locator('[data-tool-strip]').getByRole('button', { name: 'Text', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Photos, text and style' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Text' })).toHaveAttribute('aria-selected', 'true');
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

    // A phone has its own layout (D-109): the library is "Designs" in the toolbar.
    await page.locator('[data-phone-toolbar]').getByRole('button', { name: 'Designs' }).click();
    const sheet = page.getByRole('dialog', { name: 'Choose a design' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByPlaceholder('Search templates')).toBeVisible();
  });
});
