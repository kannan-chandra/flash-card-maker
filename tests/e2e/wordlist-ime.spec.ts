import { expect, test, type Locator, type Page } from '@playwright/test';

async function importCsv(page: Page, value: string) {
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'CSV import' });
  await dialog.getByLabel('CSV input').fill(value);
  await dialog.getByRole('button', { name: 'Import', exact: true }).click();
}

async function typeWithCompositionAndKey(input: Locator, key: 'Tab' | 'Enter', value: string) {
  await input.evaluate((element, args) => {
    const target = element as HTMLInputElement;
    target.focus();
    target.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: args.composedValue }));
    target.value = args.composedValue;
    target.dispatchEvent(new InputEvent('input', { bubbles: true, data: args.composedValue, inputType: 'insertCompositionText' }));
    target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: args.keyboardKey, isComposing: true }));
  }, { keyboardKey: key, composedValue: value });
}

async function endComposition(input: Locator, value: string) {
  await input.evaluate((element, composedValue) => {
    const target = element as HTMLInputElement;
    target.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: composedValue }));
  }, value);
}

async function composeEnterThenCommitWithExtraEnter(input: Locator, value: string) {
  await input.evaluate((element, composedValue) => {
    const target = element as HTMLInputElement;
    target.focus();
    target.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: composedValue }));
    target.value = composedValue;
    target.dispatchEvent(new InputEvent('input', { bubbles: true, data: composedValue, inputType: 'insertCompositionText' }));
    target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter', isComposing: true }));
    target.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: composedValue }));
    target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter', isComposing: false }));
  }, value);
}

test('tab navigation waits for IME composition commit and does not leak text to subtitle', async ({ page }) => {
  await page.goto('/');
  await importCsv(page, 'word,subtitle\nsample,');

  const row = page.locator('tbody tr').first();
  const wordInput = row.getByLabel('Word');
  const subtitleInput = row.getByLabel('Subtitle');

  await subtitleInput.fill('');
  await typeWithCompositionAndKey(wordInput, 'Tab', 'க');

  await expect(wordInput).toBeFocused();
  await expect(subtitleInput).toHaveValue('');

  await endComposition(wordInput, 'க');
  await expect(subtitleInput).toBeFocused();
  await expect(subtitleInput).toHaveValue('');

  const draftWord = page.getByLabel('New word');
  const draftSubtitle = page.getByLabel('New subtitle');
  await draftSubtitle.fill('');
  await typeWithCompositionAndKey(draftWord, 'Tab', 'த');

  await expect(draftWord).toBeFocused();
  await expect(draftSubtitle).toHaveValue('');

  await endComposition(draftWord, 'த');
  await expect(draftSubtitle).toBeFocused();
  await expect(draftSubtitle).toHaveValue('');
});

test('enter inserts a row and focuses its word field', async ({ page }) => {
  await page.goto('/');
  await importCsv(page, 'word,subtitle\nsample,');

  const rows = page.locator('tbody tr').filter({ has: page.getByLabel('Word', { exact: true }) });
  const firstRow = rows.first();
  const firstWordInput = firstRow.getByLabel('Word');

  await firstWordInput.focus();
  await firstWordInput.press('Enter');

  await expect(rows).toHaveCount(2);
  const insertedRowWord = rows.nth(1).getByLabel('Word');
  await expect(insertedRowWord).toBeFocused();
  await expect(insertedRowWord).toHaveValue('');
});

test('ime enter waits for composition end and does not leak text to inserted row', async ({ page }) => {
  await page.goto('/');
  await importCsv(page, 'word,subtitle\nsample,');

  const rows = page.locator('tbody tr').filter({ has: page.getByLabel('Word', { exact: true }) });
  const firstRow = rows.first();
  const firstWordInput = firstRow.getByLabel('Word');

  await typeWithCompositionAndKey(firstWordInput, 'Enter', 'க');

  await expect(rows).toHaveCount(1);
  await expect(firstWordInput).toBeFocused();

  await endComposition(firstWordInput, 'க');
  await expect(rows).toHaveCount(2);
  const insertedRowWord = rows.nth(1).getByLabel('Word');
  await expect(insertedRowWord).toBeFocused();
  await expect(insertedRowWord).toHaveValue('');
});

test('ime enter does not double-insert when composition end is followed by a plain enter keydown', async ({ page }) => {
  await page.goto('/');
  await importCsv(page, 'word,subtitle\nsample,');

  const rows = page.locator('tbody tr').filter({ has: page.getByLabel('Word', { exact: true }) });
  const firstWordInput = rows.first().getByLabel('Word');

  await composeEnterThenCommitWithExtraEnter(firstWordInput, 'க்');

  await expect(rows).toHaveCount(2);
  const insertedRowWord = rows.nth(1).getByLabel('Word');
  await expect(insertedRowWord).toBeFocused();
  await expect(insertedRowWord).toHaveValue('');
});
