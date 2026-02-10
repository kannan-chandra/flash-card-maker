import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ONE_BY_ONE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2XK7kAAAAASUVORK5CYII=',
  'base64'
);

async function importCsv(page: Page, value: string) {
  await page.getByRole('button', { name: 'Import CSV' }).click();
  const dialog = page.getByRole('dialog', { name: 'CSV import' });
  await dialog.getByLabel('CSV input').fill(value);
  await dialog.getByRole('button', { name: 'Import', exact: true }).click();
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

  await importCsv(page, 'word,subtitle\nசிங்கம்,விலங்கு');

  const upload = page.getByLabel('Selected row image upload');
  await upload.setInputFiles({
    name: 'lion.png',
    mimeType: 'image/png',
    buffer: ONE_BY_ONE_PNG
  });

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Generate PDF' }).click();
  const download = await downloadPromise;

  const path = await download.path();
  expect(path).toBeTruthy();

  const failure = await download.failure();
  expect(failure).toBeNull();
  expect(download.suggestedFilename().toLowerCase()).toContain('.pdf');

  await expect(page.getByText(/PDF generated/i)).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('flags long unbroken words as overflow', async ({ page }) => {
  await page.goto('/');

  await importCsv(page, 'word,subtitle\nBabyBabyBabyBabyBabyBabyBabyBabyBaby,Demo');

  await expect(page.getByLabel(/Row issues: Word overflow/i)).toBeVisible();
});

test('can set emoji image for selected row and then remove image', async ({ page }) => {
  await page.goto('/');

  await importCsv(page, 'word,subtitle\nbaby,one\nlion,two');

  await page.getByRole('button', { name: /^Use emoji / }).first().click();
  await expect(page.getByRole('button', { name: 'Remove image' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Set image from URL' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Remove image' }).click();
  await expect(page.getByRole('button', { name: 'Set image from URL' })).toBeVisible();
});

test('offers emoji button for noun objects and vehicles', async ({ page }) => {
  await page.goto('/');

  await importCsv(page, 'word,subtitle\nhammer,tool\nbus,vehicle');

  const emojiChoices = page.getByRole('button', { name: /^Use emoji / });
  const count = await emojiChoices.count();
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThanOrEqual(5);
});

test('offers emoji button for Tamil keyword matches', async ({ page }) => {
  await page.goto('/');

  await importCsv(page, 'word,subtitle\nநாய்,செல்லப்பிராணி');

  const emojiChoices = page.getByRole('button', { name: /^Use emoji / });
  const count = await emojiChoices.count();
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThanOrEqual(5);
});

test('uses subtitle emoji keywords when word has no match', async ({ page }) => {
  await page.goto('/');

  await importCsv(page, 'word,subtitle\nperro,நாய்');

  const emojiChoices = page.getByRole('button', { name: /^Use emoji / });
  const count = await emojiChoices.count();
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThanOrEqual(5);
});

test('generates downloadable PDF in double-sided mode', async ({ page }) => {
  await page.goto('/');

  await importCsv(page, 'word,subtitle\nDog,Animal');

  const upload = page.getByLabel('Selected row image upload');
  await upload.setInputFiles({
    name: 'dog.png',
    mimeType: 'image/png',
    buffer: ONE_BY_ONE_PNG
  });

  await page.getByLabel('Double-sided cards').check();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Generate PDF' }).click();
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

  await page.goto('/');
  await importCsv(page, 'word,subtitle\nLOM,LOM');

  await dragOnStage(page, { x: 500, y: 165 }, { x: 500, y: 165 });
  await dragOnStage(page, { x: 500, y: 165 }, { x: 668, y: 34 });
  await dragOnStage(page, { x: 500, y: 346 }, { x: 20, y: 487 });

  await page.getByLabel('Size').fill('100');
  await page.keyboard.press('Enter');

  const stageCanvas = page.locator('.stage-canvas');
  await expect(stageCanvas).toHaveScreenshot('canvas-large-font-edge.png');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Generate PDF' }).click();
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
