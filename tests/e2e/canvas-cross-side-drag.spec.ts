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

type TemplateShape = {
  width: number;
  height: number;
  image: { side: 1 | 2; x: number; y: number; width: number; height: number };
  textElements: Array<{ id: 'text1' | 'text2'; side: 1 | 2; x: number; y: number; width: number; height: number }>;
};

async function readActiveTemplate(page: Page): Promise<TemplateShape> {
  const template = await page.evaluate(async () => {
    function openDb(): Promise<IDBDatabase> {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open('keyval-store');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
    }
    function readWorkspace(db: IDBDatabase): Promise<unknown> {
      return new Promise((resolve, reject) => {
        const tx = db.transaction('keyval', 'readonly');
        const store = tx.objectStore('keyval');
        const request = store.get('flashcard-maker/workspace/v2');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
    }
    const db = await openDb();
    const workspace = (await readWorkspace(db)) as { sets: Array<{ id: string; template: unknown }>; activeSetId: string };
    db.close();
    const active = workspace.sets.find((setItem) => setItem.id === workspace.activeSetId);
    if (!active) {
      throw new Error('No active set found in workspace');
    }
    return active.template;
  });
  return template as TemplateShape;
}

function canvasMidpointForElement(
  template: TemplateShape,
  layout: 'vertical' | 'horizontal',
  element: { side: 1 | 2; x: number; y: number; width: number; height: number }
) {
  const sideOffsetX = layout === 'horizontal' && element.side === 2 ? template.width : 0;
  const sideOffsetY = layout === 'vertical' && element.side === 2 ? template.height : 0;
  return {
    x: element.x + element.width / 2 + sideOffsetX,
    y: element.y + element.height / 2 + sideOffsetY
  };
}

function canvasMidpointForSide(
  template: TemplateShape,
  layout: 'vertical' | 'horizontal',
  element: { x: number; y: number; width: number; height: number },
  side: 1 | 2
) {
  const sideOffsetX = layout === 'horizontal' && side === 2 ? template.width : 0;
  const sideOffsetY = layout === 'vertical' && side === 2 ? template.height : 0;
  return {
    x: element.x + element.width / 2 + sideOffsetX,
    y: element.y + element.height / 2 + sideOffsetY
  };
}

async function dragCanvasPointToCanvasPoint(
  page: Page,
  layout: 'vertical' | 'horizontal',
  source: { x: number; y: number },
  target: { x: number; y: number },
  template: TemplateShape
) {
  const stage = page.locator('.stage-canvas');
  const box = await stage.boundingBox();
  expect(box).toBeTruthy();
  if (!box) {
    return;
  }
  const contentWidth = layout === 'horizontal' ? template.width * 2 : template.width;
  const contentHeight = layout === 'horizontal' ? template.height : template.height * 2;
  const sourceX = box.x + (source.x / contentWidth) * box.width;
  const sourceY = box.y + (source.y / contentHeight) * box.height;
  const targetX = box.x + (target.x / contentWidth) * box.width;
  const targetY = box.y + (target.y / contentHeight) * box.height;
  await page.mouse.move(sourceX, sourceY);
  await page.mouse.down();
  await page.mouse.move(targetX, targetY, { steps: 20 });
  await page.mouse.up();
}

function canvasPointToScreenPoint(
  stageBox: { x: number; y: number; width: number; height: number },
  layout: 'vertical' | 'horizontal',
  template: TemplateShape,
  point: { x: number; y: number }
) {
  const contentWidth = layout === 'horizontal' ? template.width * 2 : template.width;
  const contentHeight = layout === 'horizontal' ? template.height : template.height * 2;
  return {
    x: stageBox.x + (point.x / contentWidth) * stageBox.width,
    y: stageBox.y + (point.y / contentHeight) * stageBox.height
  };
}

async function clickCanvasPoint(page: Page, layout: 'vertical' | 'horizontal', template: TemplateShape, point: { x: number; y: number }) {
  const stage = page.locator('.stage-canvas');
  const box = await stage.boundingBox();
  expect(box).toBeTruthy();
  if (!box) {
    return;
  }
  const screen = canvasPointToScreenPoint(box, layout, template, point);
  await page.mouse.click(screen.x, screen.y);
}

async function resizeElementFromBottomRightHandle(
  page: Page,
  layout: 'vertical' | 'horizontal',
  template: TemplateShape,
  element: { side: 1 | 2; x: number; y: number; width: number; height: number },
  deltaX: number,
  deltaY: number
) {
  const stage = page.locator('.stage-canvas');
  const box = await stage.boundingBox();
  expect(box).toBeTruthy();
  if (!box) {
    return;
  }
  const sideOffsetX = layout === 'horizontal' && element.side === 2 ? template.width : 0;
  const sideOffsetY = layout === 'vertical' && element.side === 2 ? template.height : 0;
  const handlePoint = {
    x: element.x + element.width + sideOffsetX,
    y: element.y + element.height + sideOffsetY
  };
  const handleScreen = canvasPointToScreenPoint(box, layout, template, handlePoint);
  await page.mouse.move(handleScreen.x, handleScreen.y);
  await page.mouse.down();
  await page.mouse.move(handleScreen.x + deltaX, handleScreen.y + deltaY, { steps: 16 });
  await page.mouse.up();
}

async function dragCanvasPointFarOutside(
  page: Page,
  layout: 'vertical' | 'horizontal',
  source: { x: number; y: number },
  target: { x: number; y: number },
  template: TemplateShape
) {
  const stage = page.locator('.stage-canvas');
  const box = await stage.boundingBox();
  expect(box).toBeTruthy();
  if (!box) {
    return;
  }
  const contentWidth = layout === 'horizontal' ? template.width * 2 : template.width;
  const contentHeight = layout === 'horizontal' ? template.height : template.height * 2;
  const sourceX = box.x + (source.x / contentWidth) * box.width;
  const sourceY = box.y + (source.y / contentHeight) * box.height;
  const targetX = box.x + target.x;
  const targetY = box.y + target.y;
  await page.mouse.move(sourceX, sourceY);
  await page.mouse.down();
  await page.mouse.move(targetX, targetY, { steps: 20 });
  await page.mouse.up();
}

async function dragImageToSide(page: Page, layout: 'vertical' | 'horizontal', targetSide: 1 | 2) {
  const template = await readActiveTemplate(page);
  const source = canvasMidpointForElement(template, layout, template.image);
  const target = canvasMidpointForSide(template, layout, template.image, targetSide);
  await dragCanvasPointToCanvasPoint(page, layout, source, target, template);
  await expect
    .poll(async () => {
      const next = await readActiveTemplate(page);
      return next.image.side;
    })
    .toBe(targetSide);
}

async function dragTextToSide(page: Page, layout: 'vertical' | 'horizontal', textId: 'text1' | 'text2', targetSide: 1 | 2) {
  const template = await readActiveTemplate(page);
  const element = template.textElements.find((item) => item.id === textId);
  if (!element) {
    throw new Error(`Missing text element ${textId}`);
  }
  const source = canvasMidpointForElement(template, layout, element);
  const target = canvasMidpointForSide(template, layout, element, targetSide);
  await dragCanvasPointToCanvasPoint(page, layout, source, target, template);
  await expect
    .poll(async () => {
      const next = await readActiveTemplate(page);
      return next.textElements.find((item) => item.id === textId)?.side;
    })
    .toBe(targetSide);
}

async function setupDoubleSidedCanvas(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto('/');
  await dismissFirstLaunchGuide(page);
  await importCsv(page, 'word,subtitle\napple,fruit');
  await page.locator('tbody tr').first().getByLabel('Word').click();
  await page.getByRole('button', { name: 'Double-sided' }).click();
}

function expectMidpointInsideCanvas(template: TemplateShape, layout: 'vertical' | 'horizontal', element: { side: 1 | 2; x: number; y: number; width: number; height: number }) {
  const midpoint = canvasMidpointForElement(template, layout, element);
  const contentWidth = layout === 'horizontal' ? template.width * 2 : template.width;
  const contentHeight = layout === 'horizontal' ? template.height : template.height * 2;
  expect(midpoint.x).toBeGreaterThanOrEqual(0);
  expect(midpoint.y).toBeGreaterThanOrEqual(0);
  expect(midpoint.x).toBeLessThanOrEqual(contentWidth);
  expect(midpoint.y).toBeLessThanOrEqual(contentHeight);
}

function getCenteredElementPosition(template: TemplateShape, element: { side: 1 | 2; width: number; height: number }) {
  const sideOffsetX = element.side === 2 ? template.width : 0;
  return {
    x: (template.width - element.width) / 2 + sideOffsetX,
    y: (template.height - element.height) / 2
  };
}

test('double-sided vertical layout still allows dragging image and text to other side', async ({ page }) => {
  await setupDoubleSidedCanvas(page, 1400, 900);
  await dragImageToSide(page, 'vertical', 1);
  await dragTextToSide(page, 'vertical', 'text1', 2);
});

test('double-sided horizontal layout still allows dragging image and text to other side', async ({ page }) => {
  await setupDoubleSidedCanvas(page, 1024, 844);
  await dragImageToSide(page, 'horizontal', 1);
  await dragTextToSide(page, 'horizontal', 'text1', 2);
});

test('image and text midpoints stay inside canvas when dragged far outside bounds', async ({ page }) => {
  await setupDoubleSidedCanvas(page, 1024, 844);

  const beforeImage = await readActiveTemplate(page);
  const imageMid = canvasMidpointForElement(beforeImage, 'horizontal', beforeImage.image);
  await dragCanvasPointFarOutside(page, 'horizontal', imageMid, { x: -400, y: -300 }, beforeImage);

  await expect
    .poll(async () => {
      const next = await readActiveTemplate(page);
      return next.image.x;
    })
    .not.toBe(beforeImage.image.x);
  const afterImage = await readActiveTemplate(page);
  expectMidpointInsideCanvas(afterImage, 'horizontal', afterImage.image);

  const beforeText = await readActiveTemplate(page);
  const text1 = beforeText.textElements.find((item) => item.id === 'text1');
  if (!text1) {
    throw new Error('Missing text1');
  }
  const textMid = canvasMidpointForElement(beforeText, 'horizontal', text1);
  await dragCanvasPointFarOutside(page, 'horizontal', textMid, { x: 2800, y: 1400 }, beforeText);

  await expect
    .poll(async () => {
      const next = await readActiveTemplate(page);
      return next.textElements.find((item) => item.id === 'text1')?.x;
    })
    .not.toBe(text1.x);
  const afterText = await readActiveTemplate(page);
  const text1After = afterText.textElements.find((item) => item.id === 'text1');
  if (!text1After) {
    throw new Error('Missing text1 after drag');
  }
  expectMidpointInsideCanvas(afterText, 'horizontal', text1After);
});

test('selected image and text boxes can be resized from canvas handles', async ({ page }) => {
  await setupDoubleSidedCanvas(page, 1400, 900);
  const layout: 'vertical' = 'vertical';

  const beforeImage = await readActiveTemplate(page);
  const imageMid = canvasMidpointForElement(beforeImage, layout, beforeImage.image);
  await clickCanvasPoint(page, layout, beforeImage, imageMid);
  await resizeElementFromBottomRightHandle(page, layout, beforeImage, beforeImage.image, 40, 30);

  await expect
    .poll(async () => {
      const next = await readActiveTemplate(page);
      return { width: next.image.width, height: next.image.height };
    })
    .toMatchObject({
      width: expect.any(Number),
      height: expect.any(Number)
    });
  const afterImage = await readActiveTemplate(page);
  expect(afterImage.image.width).toBeGreaterThan(beforeImage.image.width);
  expect(afterImage.image.height).toBeGreaterThan(beforeImage.image.height);

  const beforeText = afterImage;
  const text1 = beforeText.textElements.find((item) => item.id === 'text1');
  if (!text1) {
    throw new Error('Missing text1');
  }
  const textMid = canvasMidpointForElement(beforeText, layout, text1);
  await clickCanvasPoint(page, layout, beforeText, textMid);
  await resizeElementFromBottomRightHandle(page, layout, beforeText, text1, 36, 24);

  await expect
    .poll(async () => {
      const next = await readActiveTemplate(page);
      const resized = next.textElements.find((item) => item.id === 'text1');
      return { width: resized?.width ?? 0, height: resized?.height ?? 0 };
    })
    .toMatchObject({
      width: expect.any(Number),
      height: expect.any(Number)
    });
  const afterText = await readActiveTemplate(page);
  const text1After = afterText.textElements.find((item) => item.id === 'text1');
  if (!text1After) {
    throw new Error('Missing text1 after resize');
  }
  expect(text1After.width).toBeGreaterThan(text1.width);
  expect(text1After.height).toBeGreaterThan(text1.height);
});

test('dragging near center snaps image and text to exact horizontal and vertical center', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/');
  await dismissFirstLaunchGuide(page);
  await importCsv(page, 'word,subtitle\napple,fruit');
  await page.locator('tbody tr').first().getByLabel('Word').click();
  const layout: 'vertical' = 'vertical';

  const beforeImage = await readActiveTemplate(page);
  const imageMid = canvasMidpointForElement(beforeImage, layout, beforeImage.image);
  await clickCanvasPoint(page, layout, beforeImage, imageMid);

  const imageTarget = getCenteredElementPosition(beforeImage, beforeImage.image);
  await dragCanvasPointToCanvasPoint(
    page,
    layout,
    imageMid,
    { x: imageTarget.x + beforeImage.image.width / 2 + 4, y: imageTarget.y + beforeImage.image.height / 2 + 3 },
    beforeImage
  );
  const afterImage = await readActiveTemplate(page);
  expect(afterImage.image.x).toBeCloseTo((beforeImage.width - beforeImage.image.width) / 2, 3);
  expect(afterImage.image.y).toBeCloseTo((beforeImage.height - beforeImage.image.height) / 2, 3);

  const textBefore = await readActiveTemplate(page);
  const text1 = textBefore.textElements.find((item) => item.id === 'text1');
  if (!text1) {
    throw new Error('Missing text1');
  }
  const textMid = canvasMidpointForElement(textBefore, layout, text1);
  await clickCanvasPoint(page, layout, textBefore, textMid);
  const textTarget = getCenteredElementPosition(textBefore, text1);
  await dragCanvasPointToCanvasPoint(
    page,
    layout,
    textMid,
    { x: textTarget.x + text1.width / 2 + 4, y: textTarget.y + text1.height / 2 + 3 },
    textBefore
  );
  const textAfter = await readActiveTemplate(page);
  const text1After = textAfter.textElements.find((item) => item.id === 'text1');
  if (!text1After) {
    throw new Error('Missing text1 after center snap');
  }
  expect(text1After.x).toBeCloseTo((textAfter.width - text1.width) / 2, 3);
});
