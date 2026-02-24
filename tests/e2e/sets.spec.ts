import { expect, test } from '@playwright/test';

type StoredWorkspace = {
  sets: Array<{ id: string }>;
  activeSetId: string;
  updatedAt: number;
};

async function dismissFirstLaunchGuide(page: import('@playwright/test').Page) {
  const guide = page.getByRole('dialog', { name: 'First launch guide' });
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if ((await guide.count()) > 0) {
      await guide.getByRole('button', { name: 'Got it' }).click();
      return;
    }
    await page.waitForTimeout(100);
  }
}

async function readWorkspace(page: import('@playwright/test').Page): Promise<StoredWorkspace | null> {
  return page.evaluate(async () => {
    function openDb(): Promise<IDBDatabase> {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open('keyval-store');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
    }
    const db = await openDb();
    const workspace = await new Promise<StoredWorkspace | null>((resolve, reject) => {
      const tx = db.transaction('keyval', 'readonly');
      const store = tx.objectStore('keyval');
      const request = store.get('flashcard-maker/workspace/v2');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve((request.result as StoredWorkspace | null) ?? null);
    });
    db.close();
    return workspace;
  });
}

async function writeWorkspace(page: import('@playwright/test').Page, workspace: StoredWorkspace): Promise<void> {
  await page.evaluate(async (nextWorkspace) => {
    function openDb(): Promise<IDBDatabase> {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open('keyval-store');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
    }
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('keyval', 'readwrite');
      const store = tx.objectStore('keyval');
      const request = store.put(nextWorkspace, 'flashcard-maker/workspace/v2');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
    db.close();
  }, workspace);
}

test('creating a set from the drawer modal activates the new set', async ({ page }) => {
  const newSetName = `Playwright Set ${Date.now()}`;

  await page.goto('/');
  await dismissFirstLaunchGuide(page);

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
  await dismissFirstLaunchGuide(page);

  await page.getByRole('button', { name: 'Toggle flash card sets menu' }).click();
  await page.getByRole('button', { name: 'Rename set' }).first().click();

  const renameDialog = page.getByRole('dialog', { name: 'Rename flash card set' });
  await renameDialog.getByLabel('Rename flash card set name').fill(renamedSetName);
  await renameDialog.getByLabel('Rename flash card set name').press('Enter');

  await expect(renameDialog).toHaveCount(0);
  await expect(page.locator('.set-item.active .set-select strong')).toHaveText(renamedSetName);
  await expect(page.getByRole('button', { name: renamedSetName })).toBeVisible();
});

test('invalid persisted activeSetId is normalized to an existing set id', async ({ page }) => {
  await page.goto('/');
  await dismissFirstLaunchGuide(page);

  const workspace = await readWorkspace(page);
  expect(workspace).not.toBeNull();
  expect(workspace?.sets.length ?? 0).toBeGreaterThan(0);
  if (!workspace) {
    return;
  }

  await writeWorkspace(page, {
    ...workspace,
    activeSetId: '__invalid_set_id__',
    updatedAt: Date.now()
  });

  await page.reload();
  await dismissFirstLaunchGuide(page);

  await expect(page.locator('.set-item.active .set-select strong')).toBeVisible();

  await expect
    .poll(async () => {
      const nextWorkspace = await readWorkspace(page);
      if (!nextWorkspace) {
        return false;
      }
      return nextWorkspace.sets.some((setItem) => setItem.id === nextWorkspace.activeSetId);
    })
    .toBe(true);
});
