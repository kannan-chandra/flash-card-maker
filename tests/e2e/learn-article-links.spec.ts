import { expect, test } from '@playwright/test';

const isProdMode = process.env.E2E_ENV === 'prod';

test('article pages load and support file + article links', async ({ page }) => {
  await page.goto('/learn/teach-toddler-to-read-5-minutes');
  await expect(page.getByRole('heading', { name: 'Teach Your Toddler to Read in 5 Minutes a Day', level: 1 })).toBeVisible();

  if (isProdMode) {
    const stylesheets = page.locator('link[rel="stylesheet"]');
    await expect(stylesheets).toHaveCount(1);
    await expect(stylesheets.first()).toHaveAttribute('href', /\/assets\/index-.*\.css$/);

    const bodyOverflow = await page.evaluate(() => getComputedStyle(document.body).overflow);
    expect(bodyOverflow).not.toBe('hidden');
  }

  const pdfLink = page.getByRole('link', { name: 'here is a free printable PDF' });
  await expect(pdfLink).toBeVisible();
  const pdfHref = await pdfLink.getAttribute('href');
  expect(pdfHref).toBeTruthy();

  const pdfUrl = new URL(pdfHref!, page.url());
  expect(pdfUrl.pathname).toMatch(/\/files\/Letter-Sounds-swiftflashcards\.com\.pdf$/);
  const pdfResponse = await page.request.get(pdfUrl.toString());
  expect(pdfResponse.ok()).toBeTruthy();

  const articleLink = page.getByRole('link', { name: 'how you can use playing card sleeves to DIY flashcards' });
  await expect(articleLink).toBeVisible();
  await articleLink.click();
  await expect(page).toHaveURL(/\/learn\/make-flashcards-at-home\/?$/);
  await expect(page.getByRole('heading', { name: 'How to Make DIY Flashcards at Home (That Actually Feel Like Real Cards)', level: 1 })).toBeVisible();
});
