import { expect, test, type Locator, type Page } from '@playwright/test';

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

async function openWordCanvasEditor(page: Page) {
  const stage = page.locator('canvas').first();
  const box = await stage.boundingBox();
  expect(box).toBeTruthy();
  if (!box) {
    return;
  }
  await page.mouse.dblclick(box.x + box.width * 0.5, box.y + box.height * 0.11);
}

async function expectPreviewedWord(page: Page, expected: string) {
  await openWordCanvasEditor(page);
  const editor = page.locator('textarea.canvas-text-editor');
  await expect(editor).toBeVisible();
  await expect(editor).toHaveValue(expected);
  await page.keyboard.press('Escape');
  await expect(editor).toHaveCount(0);
}

async function expectFocusAt(input: Locator) {
  await expect(input).toBeFocused();
  await expect(input.locator('xpath=ancestor::tr[1]')).toHaveClass(/selected/);
}

test('preview follows row focus across compose-row entry paths', async ({ page }) => {
  await page.goto('/');
  await dismissFirstLaunchGuide(page);
  await importCsv(page, 'word,subtitle\none,uno\ntwo,dos');

  const rows = page.locator('tbody tr').filter({ has: page.locator('input[aria-label="Word"]') });
  await expect(rows).toHaveCount(2);

  const firstWord = rows.nth(0).getByLabel('Word');
  const secondWord = rows.nth(1).getByLabel('Word');

  await secondWord.click();
  await secondWord.press('Enter');
  await expect(rows).toHaveCount(3);

  const thirdWord = rows.nth(2).getByLabel('Word');
  await expectFocusAt(thirdWord);
  await thirdWord.fill('three');
  await expectPreviewedWord(page, 'three');

  await thirdWord.press('Enter');
  await expect(rows).toHaveCount(4);
  const fourthWord = rows.nth(3).getByLabel('Word');
  await expectFocusAt(fourthWord);
  await fourthWord.fill('four');
  await expectPreviewedWord(page, 'four');

  await fourthWord.press('Enter');
  await expect(rows).toHaveCount(5);
  const fifthWord = rows.nth(4).getByLabel('Word');
  await expectFocusAt(fifthWord);
  await fifthWord.fill('five');
  await expectPreviewedWord(page, 'five');

  await fifthWord.press('ArrowUp');
  await expectFocusAt(fourthWord);
  await expectPreviewedWord(page, 'four');

  await fourthWord.press('ArrowDown');
  await expectFocusAt(fifthWord);
  await expectPreviewedWord(page, 'five');

  await fifthWord.press('ArrowDown');
  const draftWord = page.getByLabel('New word');
  await expectFocusAt(draftWord);
  await draftWord.fill('draft-via-arrows');
  await expectPreviewedWord(page, 'draft-via-arrows');

  await firstWord.click();
  await expectFocusAt(firstWord);
  await expectPreviewedWord(page, 'one');

  await draftWord.click();
  await expectFocusAt(draftWord);
  await draftWord.fill('draft-via-click');
  await expectPreviewedWord(page, 'draft-via-click');
});
