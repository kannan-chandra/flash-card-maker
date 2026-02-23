import { expect, test, type Page } from '@playwright/test';

async function dismissFirstLaunchGuide(page: Page) {
  const guide = page.getByRole('dialog', { name: 'First launch guide' });
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if ((await guide.count()) > 0) {
      await guide.getByRole('button', { name: 'Got it' }).click();
      return;
    }
    await page.waitForTimeout(100);
  }
}

async function importCsv(page: Page, value: string) {
  const toolbarImport = page.locator('.header-actions').getByRole('button', { name: 'Import', exact: true });
  if (await toolbarImport.isVisible()) {
    await toolbarImport.click();
  } else {
    await page.getByRole('button', { name: 'Open quick actions' }).click();
    await page.locator('.header-actions-menu').getByRole('menuitem', { name: 'Import', exact: true }).click();
  }
  const dialog = page.getByRole('dialog', { name: 'CSV import' });
  await dialog.getByLabel('CSV input').fill(value);
  await dialog.getByRole('button', { name: 'Import', exact: true }).click();
}

async function clickStageAt(page: Page, xRatio: number, yRatio: number) {
  const stage = page.locator('canvas').first();
  const box = await stage.boundingBox();
  expect(box).toBeTruthy();
  if (!box) {
    return;
  }
  await page.mouse.click(box.x + box.width * xRatio, box.y + box.height * yRatio);
}

test.describe('floating panel dismiss outside click', () => {
  test('image panel closes when clicking outside modal in word list', async ({ page }) => {
    await page.setViewportSize({ width: 970, height: 700 });
    await page.goto('/');
    await dismissFirstLaunchGuide(page);
    await importCsv(page, 'word,subtitle\napple,fruit\nball,toy');

    await page.locator('tbody tr').first().getByLabel('Word').click();
    await clickStageAt(page, 0.5, 0.46);
    await expect(page.locator('.floating-image-panel')).toBeVisible();

    await page.locator('tbody tr').nth(1).getByLabel('Word').click();
    await expect(page.locator('.floating-image-panel')).toHaveCount(0);
  });

  test('text panel closes when clicking outside modal in word list', async ({ page }) => {
    await page.setViewportSize({ width: 970, height: 700 });
    await page.goto('/');
    await dismissFirstLaunchGuide(page);
    await importCsv(page, 'word,subtitle\napple,fruit\nball,toy');

    await page.locator('tbody tr').first().getByLabel('Word').click();
    await clickStageAt(page, 0.5, 0.11);
    await expect(page.locator('.floating-text-panel')).toBeVisible();

    await page.locator('tbody tr').nth(1).getByLabel('Word').click();
    await expect(page.locator('.floating-text-panel')).toHaveCount(0);
  });
});
