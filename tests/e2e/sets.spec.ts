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
