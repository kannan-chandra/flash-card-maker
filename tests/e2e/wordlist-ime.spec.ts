import { expect, test, type Locator, type Page } from '@playwright/test';

async function importCsv(page: Page, value: string) {
  await page.getByRole('button', { name: 'Import CSV' }).click();
  const dialog = page.getByRole('dialog', { name: 'CSV import' });
  await dialog.getByLabel('CSV input').fill(value);
  await dialog.getByRole('button', { name: 'Import', exact: true }).click();
}

async function typeWithCompositionAndTab(input: Locator, value: string) {
  await input.evaluate((element, composedValue) => {
    const target = element as HTMLInputElement;
    target.focus();
    target.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: composedValue }));
    target.value = composedValue;
    target.dispatchEvent(new InputEvent('input', { bubbles: true, data: composedValue, inputType: 'insertCompositionText' }));
    target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Tab', isComposing: true }));
  }, value);
}

async function endComposition(input: Locator, value: string) {
  await input.evaluate((element, composedValue) => {
    const target = element as HTMLInputElement;
    target.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: composedValue }));
  }, value);
}

test('tab navigation waits for IME composition commit and does not leak text to subtitle', async ({ page }) => {
  await page.goto('/');
  await importCsv(page, 'word,subtitle\nsample,');

  const row = page.locator('tbody tr').first();
  const wordInput = row.getByLabel('Word');
  const subtitleInput = row.getByLabel('Subtitle');

  await subtitleInput.fill('');
  await typeWithCompositionAndTab(wordInput, 'க');

  await expect(wordInput).toBeFocused();
  await expect(subtitleInput).toHaveValue('');

  await endComposition(wordInput, 'க');
  await expect(subtitleInput).toBeFocused();
  await expect(subtitleInput).toHaveValue('');

  const draftWord = page.getByLabel('New word');
  const draftSubtitle = page.getByLabel('New subtitle');
  await draftSubtitle.fill('');
  await typeWithCompositionAndTab(draftWord, 'த');

  await expect(draftWord).toBeFocused();
  await expect(draftSubtitle).toHaveValue('');

  await endComposition(draftWord, 'த');
  await expect(draftSubtitle).toBeFocused();
  await expect(draftSubtitle).toHaveValue('');
});
