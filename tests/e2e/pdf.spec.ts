import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ONE_BY_ONE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2XK7kAAAAASUVORK5CYII=',
  'base64'
);

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

async function selectFirstImportedRow(page: Page) {
  const firstWordInput = page.locator('tbody tr[data-row-id]:not([data-row-id="__draft__"]) input[aria-label="Word"]').first();
  await expect(firstWordInput).toBeVisible();
  await firstWordInput.click();
  await expect(page.locator('tbody tr[data-row-id]:not([data-row-id="__draft__"])').first()).toHaveClass(/selected/);
}

async function openExportModal(page: Page) {
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Export PDF' })).toBeVisible();
}

async function openImageInspector(page: Page) {
  const stage = page.locator('canvas').first();
  const box = await stage.boundingBox();
  expect(box).toBeTruthy();
  if (!box) return;
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.46);
}

async function openWordTextInspector(page: Page) {
  const stage = page.locator('canvas').first();
  const box = await stage.boundingBox();
  expect(box).toBeTruthy();
  if (!box) return;
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.1);
}

async function dragOnStage(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  const stage = page.locator('canvas').first();
  const box = await stage.boundingBox();
  expect(box).toBeTruthy();
  if (!box) return;

  await page.mouse.move(box.x + from.x, box.y + from.y);
  await page.mouse.down();
  await page.mouse.move(box.x + to.x, box.y + to.y, { steps: 15 });
  await page.mouse.up();
}

async function renderPdfFirstPageToCanvas(page: Page, pdfBytes: Buffer, scale = 2) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.setContent(`
    <html>
      <body style="margin:0;background:#111827;display:flex;justify-content:center;align-items:flex-start;padding:20px;">
        <canvas id="pdf-page-canvas"></canvas>
      </body>
    </html>
  `);

  await page.addScriptTag({
    path: path.resolve(process.cwd(), 'node_modules/pdfjs-dist/build/pdf.min.mjs'),
    type: 'module'
  });
  const workerSource = await readFile(path.resolve(process.cwd(), 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs'), 'utf8');
  const workerSrc = `data:text/javascript;base64,${Buffer.from(workerSource).toString('base64')}`;

  await page.waitForFunction(() => Boolean((window as unknown as { pdfjsLib?: unknown }).pdfjsLib));
  await page.evaluate(
    async ({ bytes, viewportScale, workerUrl }) => {
      const pdfjsLib = (window as unknown as { pdfjsLib: any }).pdfjsLib;
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
      const loadingTask = pdfjsLib.getDocument({ data: bytes, disableWorker: true });
      const pdf = await loadingTask.promise;
      const firstPage = await pdf.getPage(1);
      const viewport = firstPage.getViewport({ scale: viewportScale });
      const canvas = document.getElementById('pdf-page-canvas') as HTMLCanvasElement;
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Failed to create 2d context for PDF render canvas');
      }
      await firstPage.render({ canvasContext: context, viewport }).promise;
    },
    { bytes: Array.from(pdfBytes), viewportScale: scale, workerUrl: workerSrc }
  );
}

test('generates downloadable PDF for Tamil text without runtime errors', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/');
  await dismissFirstLaunchGuide(page);

  await importCsv(page, 'word,subtitle\nசிங்கம்,விலங்கு');
  await selectFirstImportedRow(page);
  await openImageInspector(page);

  const upload = page.getByLabel('Selected row image upload');
  await upload.setInputFiles({
    name: 'lion.png',
    mimeType: 'image/png',
    buffer: ONE_BY_ONE_PNG
  });

  await openExportModal(page);
  const exportDialog = page.getByRole('dialog', { name: 'Export PDF' });
  const downloadPromise = page.waitForEvent('download');
  await exportDialog.getByRole('button', { name: 'Generate PDF' }).click();
  const download = await downloadPromise;

  const path = await download.path();
  expect(path).toBeTruthy();

  const failure = await download.failure();
  expect(failure).toBeNull();
  expect(download.suggestedFilename().toLowerCase()).toContain('.pdf');

  await expect(page.getByText(/PDF generated/i)).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('generates PDF successfully when rows have no images', async ({ page }) => {
  await page.goto('/');
  await dismissFirstLaunchGuide(page);

  await importCsv(page, 'word,subtitle\nDog,Animal');
  await openExportModal(page);

  const exportDialog = page.getByRole('dialog', { name: 'Export PDF' });
  const downloadPromise = page.waitForEvent('download');
  await exportDialog.getByRole('button', { name: 'Generate PDF' }).click();
  const download = await downloadPromise;

  const path = await download.path();
  expect(path).toBeTruthy();
  expect(await download.failure()).toBeNull();
  await expect(page.getByText('PDF generated successfully.')).toBeVisible();
});

test('generates PDF in easy cut mode with no gap between cards', async ({ page }) => {
  await page.goto('/');
  await dismissFirstLaunchGuide(page);

  await importCsv(page, 'word,subtitle\nOne,First\nTwo,Second\nThree,Third\nFour,Fourth');
  await openExportModal(page);

  const exportDialog = page.getByRole('dialog', { name: 'Export PDF' });
  await exportDialog.getByRole('button', { name: 'Easy cut', exact: true }).click();
  await expect(exportDialog.getByRole('button', { name: 'Easy cut', exact: true })).toHaveAttribute('aria-pressed', 'true');

  const downloadPromise = page.waitForEvent('download');
  await exportDialog.getByRole('button', { name: 'Generate PDF' }).click();
  const download = await downloadPromise;

  expect(await download.failure()).toBeNull();
  await expect(page.getByText(/PDF generated/i)).toBeVisible();
});

test('flags long unbroken words as overflow', async ({ page }) => {
  await page.goto('/');
  await dismissFirstLaunchGuide(page);

  await importCsv(page, 'word,subtitle\nBabyBabyBabyBabyBabyBabyBabyBabyBaby,Demo');

  await expect(page.getByLabel(/Row issues: Word overflow/i)).toBeVisible();
});

test('can set emoji image for selected row and then remove image', async ({ page }) => {
  await page.goto('/');
  await dismissFirstLaunchGuide(page);

  await importCsv(page, 'word,subtitle\nbaby,one\nlion,two');
  await selectFirstImportedRow(page);
  await openImageInspector(page);

  await page.getByRole('button', { name: /^Use emoji / }).first().click();
  await expect(page.getByRole('button', { name: 'Remove image' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Upload with URL' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Remove image' }).click();
  await expect(page.getByRole('button', { name: 'Upload with URL' })).toBeVisible();
});

test('offers emoji button for noun objects and vehicles', async ({ page }) => {
  await page.goto('/');
  await dismissFirstLaunchGuide(page);

  await importCsv(page, 'word,subtitle\nhammer,tool\nbus,vehicle');
  await selectFirstImportedRow(page);
  await openImageInspector(page);

  const emojiChoices = page.getByRole('button', { name: /^Use emoji / });
  const count = await emojiChoices.count();
  expect(count).toBeGreaterThan(0);
});

test('offers emoji button for Tamil keyword matches', async ({ page }) => {
  await page.goto('/');
  await dismissFirstLaunchGuide(page);

  await importCsv(page, 'word,subtitle\nநாய்,செல்லப்பிராணி');
  await selectFirstImportedRow(page);
  await openImageInspector(page);

  const emojiChoices = page.getByRole('button', { name: /^Use emoji / });
  const count = await emojiChoices.count();
  expect(count).toBeGreaterThan(0);
});

test('uses subtitle emoji keywords when word has no match', async ({ page }) => {
  await page.goto('/');
  await dismissFirstLaunchGuide(page);

  await importCsv(page, 'word,subtitle\nperro,நாய்');
  await selectFirstImportedRow(page);
  await openImageInspector(page);

  const emojiChoices = page.getByRole('button', { name: /^Use emoji / });
  const count = await emojiChoices.count();
  expect(count).toBeGreaterThan(0);
});

test('generates downloadable PDF in double-sided mode', async ({ page }) => {
  await page.goto('/');
  await dismissFirstLaunchGuide(page);

  await importCsv(page, 'word,subtitle\nDog,Animal');
  await selectFirstImportedRow(page);
  await openImageInspector(page);

  const upload = page.getByLabel('Selected row image upload');
  await upload.setInputFiles({
    name: 'dog.png',
    mimeType: 'image/png',
    buffer: ONE_BY_ONE_PNG
  });

  await page.getByLabel('Double-sided').click();
  await openExportModal(page);

  const exportDialog = page.getByRole('dialog', { name: 'Export PDF' });
  const downloadPromise = page.waitForEvent('download');
  await exportDialog.getByRole('button', { name: 'Generate PDF' }).click();
  const download = await downloadPromise;

  expect(await download.failure()).toBeNull();
  expect(download.suggestedFilename().toLowerCase()).toContain('.pdf');
});

test('dragging on canvas does not produce NaN coordinate warnings', async ({ page }) => {
  const warnings: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'warning' || msg.type() === 'error') {
      warnings.push(msg.text());
    }
  });

  await page.goto('/');
  await dismissFirstLaunchGuide(page);

  const stage = page.locator('canvas').first();
  const box = await stage.boundingBox();
  expect(box).toBeTruthy();
  if (!box) return;

  await page.mouse.move(box.x + 340, box.y + 110);
  await page.mouse.down();
  await page.mouse.move(box.x + 380, box.y + 160, { steps: 10 });
  await page.mouse.up();

  const bad = warnings.find((text) => text.includes('NaN is a not valid value for "y" attribute'));
  expect(bad).toBeUndefined();
});

test('pdf text layout remains visually aligned at large font sizes', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'PDF viewer screenshot assertions are chromium-specific');
  test.setTimeout(60000);
  await page.setViewportSize({ width: 1600, height: 1200 });

  await page.goto('/');
  await dismissFirstLaunchGuide(page);
  await importCsv(page, 'word,subtitle\nLOM,LOM');

  await dragOnStage(page, { x: 500, y: 165 }, { x: 500, y: 165 });
  await dragOnStage(page, { x: 500, y: 165 }, { x: 668, y: 34 });
  await dragOnStage(page, { x: 500, y: 346 }, { x: 20, y: 487 });
  await openWordTextInspector(page);

  await page.getByLabel('Size').fill('100');
  await page.keyboard.press('Enter');

  const stageCanvas = page.locator('.stage-canvas');
  const stageBounds = await stageCanvas.boundingBox();
  expect(stageBounds).toBeTruthy();
  if (!stageBounds) return;
  expect(stageBounds.width).toBeGreaterThan(500);
  expect(stageBounds.height).toBeGreaterThan(300);

  await openExportModal(page);
  const exportDialog = page.getByRole('dialog', { name: 'Export PDF' });
  const downloadPromise = page.waitForEvent('download');
  await exportDialog.getByRole('button', { name: 'Generate PDF' }).click();
  const download = await downloadPromise;
  const pdfPath = await download.path();
  expect(pdfPath).toBeTruthy();
  if (!pdfPath) return;

  const pdfBytes = await readFile(pdfPath);

  const pdfPage = await context.newPage();
  await renderPdfFirstPageToCanvas(pdfPage, pdfBytes, 2);
  await expect(pdfPage.locator('#pdf-page-canvas')).toHaveScreenshot('pdf-large-font-edge.png');
  await pdfPage.close();
});
