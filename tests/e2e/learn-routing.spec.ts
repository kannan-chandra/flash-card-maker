import { expect, test } from '@playwright/test';

const isProdMode = process.env.E2E_ENV === 'prod';

test('learn routes behave correctly in dev and production', async ({ page }) => {
  await page.goto('/learn');
  await expect(page).toHaveURL(/\/learn\/?$/);
  await expect(page.getByRole('heading', { name: 'Learn', level: 1 })).toBeVisible();

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

  await page.goto('/learn/teach-toddler-to-read-5-minutes');
  await expect(page).toHaveURL(/\/learn\/teach-toddler-to-read-5-minutes$/);
  await expect(page.getByRole('heading', { name: 'Teach Your Toddler to Read in 5 Minutes a Day', level: 1 })).toBeVisible();

  if (isProdMode) {
    const sitemapResponse = await page.request.get('/sitemap.xml');
    expect(sitemapResponse.ok()).toBeTruthy();
    const sitemapXml = await sitemapResponse.text();

    expect(sitemapXml).toContain('<urlset');
    expect(sitemapXml).toContain('/learn/getting-started</loc>');
    expect(sitemapXml).toContain('/files/sample-download.txt</loc>');
    expect(sitemapXml).toContain('/files/Letter-Sounds-swiftflashcards.com.pdf</loc>');
  }
});
