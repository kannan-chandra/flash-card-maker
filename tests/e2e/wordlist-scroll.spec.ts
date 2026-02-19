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

test('mobile viewport: card nav arrows stay within viewport bounds', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await dismissFirstLaunchGuide(page);
  await importCsv(page, makeRowsCsv(3));

  const upButton = page.locator('.mobile-card-nav-button').first();
  const downButton = page.locator('.mobile-card-nav-button').nth(1);
  await expect(upButton).toBeVisible();
  await expect(downButton).toBeVisible();

  const viewport = page.viewportSize();
  expect(viewport).toBeTruthy();
  if (!viewport) {
    return;
  }

  const upBox = await upButton.boundingBox();
  const downBox = await downButton.boundingBox();
  expect(upBox).toBeTruthy();
  expect(downBox).toBeTruthy();
  if (!upBox || !downBox) {
    return;
  }

  expect(upBox.x).toBeGreaterThanOrEqual(0);
  expect(upBox.y).toBeGreaterThanOrEqual(0);
  expect(upBox.x + upBox.width).toBeLessThanOrEqual(viewport.width);
  expect(upBox.y + upBox.height).toBeLessThanOrEqual(viewport.height);

  expect(downBox.x).toBeGreaterThanOrEqual(0);
  expect(downBox.y).toBeGreaterThanOrEqual(0);
  expect(downBox.x + downBox.width).toBeLessThanOrEqual(viewport.width);
  expect(downBox.y + downBox.height).toBeLessThanOrEqual(viewport.height);
});

test('mobile arrows move row highlight/focus without keeping input cursor active', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await dismissFirstLaunchGuide(page);
  await importCsv(page, makeRowsCsv(6));

  const rows = page.locator('tbody tr').filter({ has: page.locator('input[aria-label="Word"]') });
  await expect(rows).toHaveCount(6);

  const secondWord = rows.nth(1).getByLabel('Word');
  await secondWord.click();
  await expect(secondWord).toBeFocused();

  const navDown = page.locator('.mobile-card-nav-button').nth(1);
  await navDown.click();

  await expect(rows.nth(2)).toHaveClass(/selected/);

  const activeState = await page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    return {
      tag: active?.tagName ?? null,
      rowId: active?.getAttribute('data-row-id') ?? null
    };
  });

  expect(activeState.tag).not.toBe('INPUT');
  expect(activeState.rowId).toBeTruthy();
  expect(activeState.rowId).not.toBe('__draft__');

  const selectedRowId = await rows.nth(2).getAttribute('data-row-id');
  expect(activeState.rowId).toBe(selectedRowId);
});

async function getDraftWordCellBackground(page: Page): Promise<string> {
  return page.locator('tr.draft-row td').first().evaluate((cell) => getComputedStyle(cell).backgroundColor);
}

async function getDraftWordInputBackground(page: Page): Promise<string> {
  return page.getByLabel('New word').evaluate((input) => getComputedStyle(input).backgroundColor);
}

test('narrow desktop viewport arrows keep draft row highlight visible when selected', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 844 });
  await page.goto('/');
  await dismissFirstLaunchGuide(page);
  await importCsv(page, makeRowsCsv(1));

  const firstWord = page.locator('tbody tr').filter({ has: page.locator('input[aria-label="Word"]') }).first().getByLabel('Word');
  await firstWord.click();

  const draftUnselectedBg = await getDraftWordCellBackground(page);
  const draftUnselectedInputBg = await getDraftWordInputBackground(page);

  const navDown = page.locator('.mobile-card-nav-button').nth(1);
  await navDown.click();

  const draftRow = page.locator('tr.draft-row');
  await expect(draftRow).toHaveClass(/selected/);
  const draftSelectedBg = await getDraftWordCellBackground(page);
  const draftSelectedInputBg = await getDraftWordInputBackground(page);

  expect(draftSelectedBg).not.toBe(draftUnselectedBg);
  expect(draftSelectedInputBg).not.toBe(draftUnselectedInputBg);
});

test('mobile arrows keep draft row highlight visible when selected', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await dismissFirstLaunchGuide(page);
  await importCsv(page, makeRowsCsv(1));

  const firstWord = page.locator('tbody tr').filter({ has: page.locator('input[aria-label="Word"]') }).first().getByLabel('Word');
  await firstWord.click();

  const draftUnselectedBg = await getDraftWordCellBackground(page);
  const draftUnselectedInputBg = await getDraftWordInputBackground(page);

  const navDown = page.locator('.mobile-card-nav-button').nth(1);
  await navDown.click();

  const draftRow = page.locator('tr.draft-row');
  await expect(draftRow).toHaveClass(/selected/);
  const draftSelectedBg = await getDraftWordCellBackground(page);
  const draftSelectedInputBg = await getDraftWordInputBackground(page);

  expect(draftSelectedBg).not.toBe(draftUnselectedBg);
  expect(draftSelectedInputBg).not.toBe(draftUnselectedInputBg);
});
