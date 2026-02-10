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

test('can set emoji image for selected row and then remove image', async ({ page }) => {
  await page.goto('/');

  await page.locator('textarea').first().fill('word,subtitle\nbaby,one\nlion,two');
  await page.getByRole('button', { name: 'Import CSV' }).click();

  await page.getByRole('button', { name: /^Use emoji / }).first().click();
  await expect(page.getByRole('button', { name: 'Remove image' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Set image from URL' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Remove image' }).click();
  await expect(page.getByRole('button', { name: 'Set image from URL' })).toBeVisible();

  const firstStatus = page.locator('tbody tr').first().locator('td').nth(3);
  await expect(firstStatus).toContainText('Missing image');
});

test('offers emoji button for noun objects and vehicles', async ({ page }) => {
  await page.goto('/');

  await page.locator('textarea').first().fill('word,subtitle\nhammer,tool\nbus,vehicle');
  await page.getByRole('button', { name: 'Import CSV' }).click();

  const emojiChoices = page.getByRole('button', { name: /^Use emoji / });
  const count = await emojiChoices.count();
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThanOrEqual(5);
});

test('offers emoji button for Tamil keyword matches', async ({ page }) => {
  await page.goto('/');

  await page.locator('textarea').first().fill('word,subtitle\nநாய்,செல்லப்பிராணி');
  await page.getByRole('button', { name: 'Import CSV' }).click();

  const emojiChoices = page.getByRole('button', { name: /^Use emoji / });
  const count = await emojiChoices.count();
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThanOrEqual(5);
});

test('uses subtitle emoji keywords when word has no match', async ({ page }) => {
  await page.goto('/');

  await page.locator('textarea').first().fill('word,subtitle\nperro,நாய்');
  await page.getByRole('button', { name: 'Import CSV' }).click();

  const emojiChoices = page.getByRole('button', { name: /^Use emoji / });
  const count = await emojiChoices.count();
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThanOrEqual(5);
});

test('generates downloadable PDF in double-sided mode', async ({ page }) => {
  await page.goto('/');

  await page.locator('textarea').first().fill('word,subtitle\nDog,Animal');
  await page.getByRole('button', { name: 'Import CSV' }).click();

  const upload = page.getByLabel('Selected row image upload');
  await upload.setInputFiles({
    name: 'dog.png',
    mimeType: 'image/png',
    buffer: ONE_BY_ONE_PNG
  });

  await page.getByLabel('Double-sided cards').check();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Generate PDF' }).click();
  const download = await downloadPromise;

  expect(await download.failure()).toBeNull();
  expect(download.suggestedFilename().toLowerCase()).toContain('.pdf');
});
