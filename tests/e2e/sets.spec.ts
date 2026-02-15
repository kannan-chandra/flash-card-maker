import { expect, test } from '@playwright/test';

test('creating a set from the drawer modal activates the new set', async ({ page }) => {
  const newSetName = `Playwright Set ${Date.now()}`;

  await page.goto('/');

  await page.getByRole('button', { name: 'Toggle flash card sets menu' }).click();
  await page.getByRole('button', { name: 'Create Flashcard Set' }).click();

  const createDialog = page.getByRole('dialog', { name: 'Create flash card set' });
  await createDialog.getByLabel('Flash card set name').fill(newSetName);
  await createDialog.getByLabel('Flash card set name').press('Enter');

  await expect(createDialog).toHaveCount(0);

  await page.getByRole('button', { name: 'Toggle flash card sets menu' }).click();
  await expect(page.getByRole('button', { name: newSetName })).toBeVisible();
  await expect(page.locator('.set-item.active .set-select strong')).toHaveText(newSetName);
});

test('renaming a set from the drawer updates the visible set name', async ({ page }) => {
  const renamedSetName = `Renamed Set ${Date.now()}`;

  await page.goto('/');

  await page.getByRole('button', { name: 'Toggle flash card sets menu' }).click();
  await page.getByRole('button', { name: 'Rename set' }).first().click();

  const renameDialog = page.getByRole('dialog', { name: 'Rename flash card set' });
  await renameDialog.getByLabel('Rename flash card set name').fill(renamedSetName);
  await renameDialog.getByLabel('Rename flash card set name').press('Enter');

  await expect(renameDialog).toHaveCount(0);
  await expect(page.locator('.set-item.active .set-select strong')).toHaveText(renamedSetName);
  await expect(page.getByRole('button', { name: renamedSetName })).toBeVisible();
});
