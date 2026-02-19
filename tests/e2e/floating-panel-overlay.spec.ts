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
  await page.getByRole('button', { name: 'Import', exact: true }).click();
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

async function clickImageBox(page: Page) {
  const stage = page.locator('canvas').first();
  const box = await stage.boundingBox();
  expect(box).toBeTruthy();
  if (!box) {
    return;
  }
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.46);
}

async function overlapProbe(page: Page, selectorA: string, selectorB: string) {
  return page.evaluate(
    ({ selectorA: a, selectorB: b }) => {
      const nodeA = document.querySelector(a);
      const nodeB = document.querySelector(b);
      if (!nodeA || !nodeB) {
        return null;
      }
      const ra = nodeA.getBoundingClientRect();
      const rb = nodeB.getBoundingClientRect();
      const left = Math.max(ra.left, rb.left);
      const right = Math.min(ra.right, rb.right);
      const top = Math.max(ra.top, rb.top);
      const bottom = Math.min(ra.bottom, rb.bottom);
      if (right <= left || bottom <= top) {
        return {
          hasOverlap: false,
          point: null
        };
      }
      return {
        hasOverlap: true,
        point: {
          x: left + Math.min(8, Math.max((right - left) / 2, 1)),
          y: top + Math.min(8, Math.max((bottom - top) / 2, 1))
        }
      };
    },
    { selectorA, selectorB }
  );
}

test.describe('floating panel overlay behavior', () => {
  test('mobile-ish width: image panel stays above overlapping word-list header', async ({ page }) => {
    await page.setViewportSize({ width: 600, height: 760 });
    await page.goto('/');
    await dismissFirstLaunchGuide(page);
    await importCsv(page, makeRowsCsv(12));

    await page.locator('tbody tr').first().getByLabel('Word').click();
    await clickImageBox(page);
    await expect(page.locator('.floating-image-panel')).toBeVisible();

    const overlap = await overlapProbe(page, '.floating-image-panel', '.list-table thead');
    expect(overlap).toBeTruthy();
    if (!overlap || !overlap.hasOverlap || !overlap.point) {
      throw new Error('Expected floating image panel to overlap list header area for z-order validation.');
    }

    const topNodeIsPanel = await page.evaluate(({ x, y }) => {
      const top = document.elementFromPoint(x, y);
      return Boolean(top?.closest('.floating-inspector-panel'));
    }, overlap.point);
    expect(topNodeIsPanel).toBe(true);
  });

  test('narrow desktop: panel is above app header and emoji list shrinks when space is tight', async ({ page }) => {
    await page.setViewportSize({ width: 970, height: 430 });
    await page.goto('/');
    await dismissFirstLaunchGuide(page);
    await importCsv(page, makeRowsCsv(8));

    await page.locator('tbody tr').first().getByLabel('Word').click();
    await clickImageBox(page);
    await expect(page.locator('.floating-image-panel')).toBeVisible();
    const searchButton = page.getByRole('button', { name: 'Search all emoji' });
    if (await searchButton.count()) {
      await searchButton.click();
    }
    await expect(page.getByLabel('Search emoji')).toBeVisible();

    const headerOverlap = await overlapProbe(page, '.floating-image-panel', 'header');
    expect(headerOverlap).toBeTruthy();
    if (!headerOverlap || !headerOverlap.hasOverlap || !headerOverlap.point) {
      throw new Error('Expected floating image panel to overlap app header area for z-order validation.');
    }

    const headerPointTopNodeIsPanel = await page.evaluate(({ x, y }) => {
      const top = document.elementFromPoint(x, y);
      return Boolean(top?.closest('.floating-inspector-panel'));
    }, headerOverlap.point);
    expect(headerPointTopNodeIsPanel).toBe(true);

    const emojiResultsHeight = await page.locator('.floating-image-panel .emoji-search-results').evaluate((node) => {
      return (node as HTMLElement).clientHeight;
    });
    expect(emojiResultsHeight).toBeLessThan(234);
  });

  test('ios safari repro: panel should not scroll while emoji area does', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 620 });
    await page.goto('/');
    await dismissFirstLaunchGuide(page);
    await importCsv(page, makeRowsCsv(12));

    await page.locator('tbody tr').first().getByLabel('Word').click();
    await clickImageBox(page);
    await expect(page.locator('.floating-image-panel')).toBeVisible();

    const searchButton = page.getByRole('button', { name: 'Search all emoji' });
    if (await searchButton.count()) {
      await searchButton.click();
    }
    await expect(page.getByLabel('Search emoji')).toBeVisible();

    const panelScrollable = await page.locator('.floating-image-panel').evaluate((node) => {
      const el = node as HTMLElement;
      return {
        overflowY: getComputedStyle(el).overflowY,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        scrollable: el.scrollHeight > el.clientHeight + 1
      };
    });
    const emojiScrollable = await page.locator('.floating-image-panel .emoji-search-results').evaluate((node) => {
      const el = node as HTMLElement;
      return {
        overflowY: getComputedStyle(el).overflowY,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        scrollable: el.scrollHeight > el.clientHeight + 1
      };
    });

    expect(emojiScrollable.overflowY).toBe('auto');
    expect(emojiScrollable.scrollable).toBe(true);
    expect(panelScrollable.overflowY).not.toBe('auto');
    expect(panelScrollable.scrollable).toBe(false);
  });
});
