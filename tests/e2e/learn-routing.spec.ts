import { expect, test } from '@playwright/test';

const isProdMode = process.env.E2E_ENV === 'prod';

test('learn routes behave correctly in dev and production', async ({ page }) => {
  await page.goto('/learn');

  if (isProdMode) {
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: 'Swift Flashcards', level: 1 })).toBeVisible();
  } else {
    await expect(page).toHaveURL(/\/learn$/);
    await expect(page.getByRole('heading', { name: 'Learn', level: 1 })).toBeVisible();
  }

  await page.goto('/learn/getting-started');
  await expect(page).toHaveURL(/\/learn\/getting-started$/);
  await expect(page.getByRole('heading', { name: 'Getting Started', level: 1 })).toBeVisible();
  await expect(page.getByText('Where to add articles')).toBeVisible();

  const downloadLink = page.getByRole('link', { name: 'sample-download.txt' });
  await expect(downloadLink).toBeVisible();
  const href = await downloadLink.getAttribute('href');
  expect(href).toBeTruthy();

  const downloadUrl = new URL(href!, page.url());
  expect(downloadUrl.pathname).toMatch(/\/files\/sample-download\.txt$/);

  const response = await page.request.get(downloadUrl.toString());
  expect(response.ok()).toBeTruthy();
  await expect(response.text()).resolves.toContain('sample downloadable file');
});
