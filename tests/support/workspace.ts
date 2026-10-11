import { expect, type Page } from '@playwright/test';

/** Answers "What will you make most?" on a first visit (D-149). */
export async function answerWelcome(
  page: Page,
  answer: 'Social posts' | 'Business ads' | 'News & events' | 'A bit of everything',
): Promise<void> {
  const question = page.getByRole('dialog', { name: 'What will you make most?' });
  await expect(question).toBeVisible();
  await question.getByRole('button', { name: new RegExp(`^${answer.replace(/[&]/g, '\\$&')}`) }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
