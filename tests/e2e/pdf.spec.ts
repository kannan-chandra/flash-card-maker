import { expect, test } from '@playwright/test';

const ONE_BY_ONE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2XK7kAAAAASUVORK5CYII=',
  'base64'
);

test('generates downloadable PDF for Tamil text without runtime errors', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/');

  await page.locator('textarea').first().fill('word,subtitle\nசிங்கம்,விலங்கு');
  await page.getByRole('button', { name: 'Import CSV' }).click();

  const upload = page.getByLabel('Selected row image upload');
  await upload.setInputFiles({
    name: 'lion.png',
    mimeType: 'image/png',
    buffer: ONE_BY_ONE_PNG
  });

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Generate PDF' }).click();
  const download = await downloadPromise;

  const path = await download.path();
  expect(path).toBeTruthy();

  const failure = await download.failure();
  expect(failure).toBeNull();
  expect(download.suggestedFilename().toLowerCase()).toContain('.pdf');

  await expect(page.getByText(/PDF generated/i)).toBeVisible();
  expect(pageErrors).toEqual([]);
});
