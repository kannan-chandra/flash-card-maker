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

function makeRowsCsv(count: number): string {
  const rows = ['word,subtitle'];
  for (let i = 1; i <= count; i += 1) {
    rows.push(`word-${i},subtitle-${i}`);
  }
  return rows.join('\n');
}

async function preparePage(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto('/');
  await dismissFirstLaunchGuide(page);
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        transition: none !important;
        animation: none !important;
      }
      .canvas-text-editor {
        caret-color: transparent !important;
      }
    `
  });
  await importCsv(page, makeRowsCsv(6));
  await page.locator('tbody tr').first().getByLabel('Word').click();
}

async function getRect(page: Page, selector: string) {
  return page.locator(selector).evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom
    };
  });
}

test.describe('canvas layout refactor guards (temporary)', () => {
  test('wide desktop keeps canvas centered in shell and hides mobile arrows', async ({ page }) => {
    await preparePage(page, 1440, 900);

    await expect(page.locator('.mobile-card-nav')).toHaveCount(0);

    const shell = await getRect(page, '.stage-shell');
    const canvas = await getRect(page, '.stage-canvas');
    const shellCenter = shell.left + shell.width / 2;
    const canvasCenter = canvas.left + canvas.width / 2;
    expect(Math.abs(shellCenter - canvasCenter)).toBeLessThanOrEqual(1);

  });

  test('1180 breakpoint keeps canvas centered when arrow clearance is already available', async ({ page }) => {
    await preparePage(page, 1180, 844);

    await expect(page.locator('.mobile-card-nav')).toBeVisible();

    const shell = await getRect(page, '.stage-shell');
    const canvas = await getRect(page, '.stage-canvas');
    const shellCenter = shell.left + shell.width / 2;
    const canvasCenter = canvas.left + canvas.width / 2;
    expect(Math.abs(shellCenter - canvasCenter)).toBeLessThanOrEqual(1);

  });

  test('narrow desktop keeps arrows visible and toolbar aligned with canvas', async ({ page }) => {
    await preparePage(page, 1024, 844);

    await expect(page.locator('.mobile-card-nav')).toBeVisible();

    const viewport = page.viewportSize();
    expect(viewport).toBeTruthy();
    if (!viewport) {
      return;
    }

    const toolbar = await getRect(page, '.stage-toolbar');
    const canvas = await getRect(page, '.stage-canvas');
    expect(Math.abs(toolbar.left - canvas.left)).toBeLessThanOrEqual(1);
    expect(Math.abs(toolbar.right - canvas.right)).toBeLessThanOrEqual(1);

    const nav = await getRect(page, '.mobile-card-nav');
    expect(nav.right).toBeLessThanOrEqual(viewport.width + 1);

  });

  test('mobile keeps arrows in viewport and shifts canvas only as needed', async ({ page }) => {
    await preparePage(page, 390, 844);

    await expect(page.locator('.mobile-card-nav')).toBeVisible();

    const viewport = page.viewportSize();
    expect(viewport).toBeTruthy();
    if (!viewport) {
      return;
    }

    const shell = await getRect(page, '.stage-shell');
    const canvas = await getRect(page, '.stage-canvas');
    const nav = await getRect(page, '.mobile-card-nav');
    const centeredLeft = shell.left + Math.max((shell.width - canvas.width) / 2, 0);
    const shiftFromCenter = centeredLeft - canvas.left;
    expect(shiftFromCenter).toBeGreaterThanOrEqual(0);
    expect(nav.right).toBeLessThanOrEqual(viewport.width + 1);
    expect(canvas.right).toBeLessThanOrEqual(nav.left + 10);

  });
});
