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
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'CSV import' });
  await dialog.getByLabel('CSV input').fill(value);
  await dialog.getByRole('button', { name: 'Import', exact: true }).click();
}

function makeRowsCsv(count: number): string {
  const rows = ['word,subtitle'];
  for (let i = 1; i <= count; i += 1) {
    rows.push(`word-${i},subtitle-${i}`);
  }
  return rows.join('\n');
}

test('enter on last visible row at viewport bottom scrolls to inserted focused row', async ({ page }) => {
  await page.goto('/');
  await dismissFirstLaunchGuide(page);
  await importCsv(page, makeRowsCsv(24));

  const listTable = page.locator('.list-table');
  const rows = page.locator('tbody tr').filter({ has: page.locator('input[aria-label="Word"]') });
  await expect(rows).toHaveCount(24);

  const lastRowWord = rows.nth(23).getByLabel('Word');
  await listTable.evaluate((node) => {
    const el = node as HTMLDivElement;
    el.scrollTop = el.scrollHeight;
  });
  await lastRowWord.scrollIntoViewIfNeeded();
  await lastRowWord.click();

  await lastRowWord.press('Enter');

  await expect(rows).toHaveCount(25);
  const insertedRowWord = rows.nth(24).getByLabel('Word');
  await expect(insertedRowWord).toBeFocused();

  const insertedRowVisible = await insertedRowWord.evaluate((input) => {
    const row = input.closest('tr');
    const container = input.closest('.list-table');
    if (!row || !container) {
      return false;
    }
    const rowRect = row.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const header = container.querySelector('thead');
    const headerHeight = header ? header.getBoundingClientRect().height : 0;
    const visibleTop = containerRect.top + headerHeight;
    const visibleBottom = containerRect.bottom;
    return rowRect.top >= visibleTop - 1 && rowRect.bottom <= visibleBottom + 1;
  });

  expect(insertedRowVisible).toBe(true);
});

test('mobile viewport: enter on bottom row keeps inserted focused row visible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await dismissFirstLaunchGuide(page);
  await importCsv(page, makeRowsCsv(28));

  const listTable = page.locator('.list-table');
  const rows = page.locator('tbody tr').filter({ has: page.locator('input[aria-label="Word"]') });
  await expect(rows).toHaveCount(28);

  const lastRowWord = rows.nth(27).getByLabel('Word');
  await listTable.evaluate((node) => {
    const el = node as HTMLDivElement;
    el.scrollTop = el.scrollHeight;
  });
  await lastRowWord.click();
  await lastRowWord.press('Enter');

  await expect(rows).toHaveCount(29);
  const insertedRowWord = rows.nth(28).getByLabel('Word');
  await expect(insertedRowWord).toBeFocused();

  const insertedRowVisible = await insertedRowWord.evaluate((input) => {
    const row = input.closest('tr');
    const container = input.closest('.list-table');
    if (!row || !container) {
      return false;
    }
    const rowRect = row.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const header = container.querySelector('thead');
    const headerHeight = header ? header.getBoundingClientRect().height : 0;
    const visibleTop = containerRect.top + headerHeight;
    const visibleBottom = containerRect.bottom;
    return rowRect.top >= visibleTop - 1 && rowRect.bottom <= visibleBottom + 1;
  });

  expect(insertedRowVisible).toBe(true);
});
