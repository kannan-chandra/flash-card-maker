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

test('flags long unbroken words as overflow', async ({ page }) => {
  await page.goto('/');

  await page.locator('textarea').first().fill('word,subtitle\nBabyBabyBabyBabyBabyBabyBabyBabyBaby,Demo');
  await page.getByRole('button', { name: 'Import CSV' }).click();

  const statusCell = page.locator('tbody tr').first().locator('td').nth(3);
  await expect(statusCell).toContainText('Word overflow');
});

test('can use emoji image for selected row and suggest bulk apply', async ({ page }) => {
  await page.goto('/');

  await page.locator('textarea').first().fill('word,subtitle\nbaby,one\nlion,two');
  await page.getByRole('button', { name: 'Import CSV' }).click();

  await page.getByRole('button', { name: /Use emoji for image/i }).click();
  await expect(page.getByText(/Apply emoji images for/i)).toBeVisible();

  const firstStatus = page.locator('tbody tr').first().locator('td').nth(3);
  await expect(firstStatus).toContainText('Fits');
});

test('offers emoji button for noun objects and vehicles', async ({ page }) => {
  await page.goto('/');

  await page.locator('textarea').first().fill('word,subtitle\nhammer,tool\nbus,vehicle');
  await page.getByRole('button', { name: 'Import CSV' }).click();

  await expect(page.getByRole('button', { name: /Use emoji for image/i })).toBeVisible();
});

test('offers emoji button for Tamil keyword matches', async ({ page }) => {
  await page.goto('/');

  await page.locator('textarea').first().fill('word,subtitle\nநாய்,செல்லப்பிராணி');
  await page.getByRole('button', { name: 'Import CSV' }).click();

  await expect(page.getByRole('button', { name: /Use emoji for image/i })).toBeVisible();
});
