import { expect, type Page } from '@playwright/test';

/** Picks a purpose on the bar above the picture (D-150). */
export async function choosePurpose(page: Page, purpose: 'social' | 'business' | 'news' | 'both'): Promise<void> {
  const part = page.locator(`[data-purpose-bar] [data-workspace="${purpose}"]`);
  await part.click();
  await expect(part).toHaveAttribute('aria-checked', 'true');
}
