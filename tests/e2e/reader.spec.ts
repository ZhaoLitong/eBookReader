import { test, expect, type Page } from '@playwright/test';
import { fixture } from '../fixtures';
import { prcFixture } from '../prcFixtures';
import JSZip from 'jszip';

test('malformed EPUB chapter is recovered without scripts or remote requests', async ({ page }) => {
  const remote: string[] = [];
  page.on('request', request => { if (request.url().startsWith('https://hostile.invalid')) remote.push(request.url()); });
  const zip = await JSZip.loadAsync(await fixture({ hostile: true }));
  const chapter = await zip.file('EPUB/chapter1.xhtml')!.async('string');
  zip.file('EPUB/chapter1.xhtml', chapter.replace('<h1>', '<p><divlity>Recovered text</div></p><h1>'));
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({ name: 'malformed.epub', mimeType: 'application/epub+zip', buffer: Buffer.from(await zip.generateAsync({ type: 'arraybuffer' })) });
  await expect(page.getByRole('button', { name: 'Next page', exact: true })).toBeEnabled();
  await expect(page.frameLocator('iframe').getByText('Recovered text', { exact: true })).toBeVisible();
  await expect(page.frameLocator('iframe').locator('script,iframe,[onerror]')).toHaveCount(0);
  expect(remote).toEqual([]);
  expect(await page.evaluate(() => (window as unknown as { __bookScriptRan?: boolean }).__bookScriptRan)).toBeUndefined();
});

test('PRC imports, reads, saves progress and resumes', async ({ page }) => {
  await page.goto('/');
  const text = '<html><body><h1>PRC garden</h1>' + Array.from({ length: 120 }, (_, i) => `<p>Passage ${i}. A quiet garden grows beside the house. Every page holds a new discovery.</p>`).join('') + '</body></html>';
  await page.locator('input[type=file]').setInputFiles({ name: 'garden.prc', mimeType: 'application/octet-stream', buffer: Buffer.from(prcFixture({ text })) });
  await expect(page.getByRole('button', { name: 'Next page', exact: true })).toBeEnabled();
  await expect(page.frameLocator('iframe').getByText('PRC garden', { exact: true })).toBeVisible();
  await expect.poll(() => savedCfi(page)).toContain('epubcfi('); const first = await savedCfi(page);
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect.poll(() => savedCfi(page)).not.toBe(first);
  await page.waitForTimeout(700); const position = await savedCfi(page);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Previous page', exact: true })).toBeEnabled();
  await expect.poll(() => savedCfi(page)).toBe(position);
});

test('TXT imports, paginates, resumes and displays markup as literal text', async ({ page }) => {
  await page.goto('/');
  const text = '<script>window.bad = true</script>\n花园 & friends\n\n' + Array.from({ length: 150 }, (_, i) => `Passage ${i}. A quiet garden grows beside the house. Every page holds a new discovery.`).join('\n');
  await page.locator('input[type=file]').setInputFiles({ name: 'Garden.TXT', mimeType: 'application/octet-stream', buffer: Buffer.from(text) });
  await expect(page.getByRole('button', { name: 'Next page', exact: true })).toBeEnabled();
  await expect(page.frameLocator('iframe').getByText('<script>window.bad = true</script>', { exact: true })).toBeVisible();
  await expect(page.frameLocator('iframe').locator('script')).toHaveCount(0);
  const first = await savedCfi(page);
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect.poll(() => savedCfi(page)).not.toBe(first);
  await page.waitForTimeout(700); const position = await savedCfi(page);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Previous page', exact: true })).toBeEnabled();
  await expect.poll(() => savedCfi(page)).toBe(position);
  await page.getByRole('button', { name: 'Back to shelf' }).click();
  await expect(page.getByRole('button', { name: 'Read Garden', exact: true })).toBeVisible();
});

async function importFixture(page: Page, options: Parameters<typeof fixture>[0] = {}) {
  await page.locator('input[type=file]').setInputFiles({ name: 'garden.epub', mimeType: 'application/epub+zip', buffer: Buffer.from(await fixture(options)) });
  await expect(page.getByRole('button', { name: 'Next page', exact: true })).toBeEnabled({ timeout: 30000 });
}
async function savedCfi(page: Page) {
  return page.evaluate(() => new Promise<string>((resolve, reject) => {
    const request = indexedDB.open('epub-reader');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => { const db = request.result; const get = db.transaction('states').objectStore('states').getAll(); get.onsuccess = () => { resolve(get.result[0]?.cfi ?? ''); db.close(); }; };
  }));
}
async function visiblePassages(page: Page) {
  return page.frameLocator('iframe').locator('body').evaluate(body => {
    const win = body.ownerDocument.defaultView!;
    const frame = win.frameElement!.getBoundingClientRect();
    const viewport = win.frameElement!.closest('.book-viewport')!.getBoundingClientRect();
    return Array.from(body.querySelectorAll('p[id]')).filter(node => {
      const range = body.ownerDocument.createRange(); range.selectNodeContents(node);
      return Array.from(range.getClientRects()).some(rect => rect.left + frame.left < viewport.right && rect.right + frame.left > viewport.left && rect.top + frame.top < viewport.bottom && rect.bottom + frame.top > viewport.top);
    }).map(node => node.textContent!.split('.')[0]);
  });
}
async function updateState(page: Page, cfi: string) {
  await page.evaluate(cfi => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('epub-reader'); request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result; const tx = db.transaction('states', 'readwrite'); const table = tx.objectStore('states'); const get = table.getAll();
      get.onsuccess = () => table.put({ ...get.result[0], cfi });
      tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
    };
  }), cfi);
}
test('imports, reads nested contents, saves a passage, resumes, changes settings, deduplicates and removes', async ({ page }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await expect(page.getByText('Your next chapter starts here.')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('shelf.png'), fullPage: true });
  await importFixture(page);
  await expect(page.frameLocator('iframe').getByText('Chapter 1: Morning')).toBeVisible();
  await page.getByRole('button', { name: 'Table of contents', exact: true }).click();
  await expect(page.getByRole('button', { name: 'A quiet corner', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Evening', exact: true }).click();
  await expect(page.frameLocator('iframe').getByText('Chapter 2: Evening')).toBeVisible();
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect.poll(() => savedCfi(page)).toContain('epubcfi(');
  await page.waitForTimeout(700); const cfi = await savedCfi(page);
  const passage = (await visiblePassages(page))[0];
  await page.reload(); await expect(page.getByRole('button', { name: 'Next page', exact: true })).toBeEnabled();
  await expect.poll(() => savedCfi(page)).toBe(cfi);
  expect(await visiblePassages(page)).toContain(passage);
  await page.getByRole('button', { name: 'Reading settings', exact: true }).click();
  await page.getByRole('button', { name: 'Increase font size' }).click();
  await page.getByRole('button', { name: '☾ Dark', exact: true }).click();
  await expect(page.getByLabel('Font size', { exact: true })).toHaveText('110%');
  await page.getByRole('button', { name: 'Close panel' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect.poll(() => visiblePassages(page)).toContain(passage);
  await page.setViewportSize({ width: 390, height: 780 });
  await page.waitForTimeout(500); // Allow the debounced rendition resize to settle.
  await expect.poll(() => visiblePassages(page)).toContain(passage);
  await page.screenshot({ path: testInfo.outputPath('reader-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Back to shelf' }).click();
  await expect(page.getByRole('button', { name: /Read The Quiet Garden/ })).toHaveCount(1);
  await importFixture(page); await page.getByRole('button', { name: 'Back to shelf' }).click();
  await expect(page.getByRole('button', { name: /Read The Quiet Garden/ })).toHaveCount(1);
  await page.getByRole('button', { name: /Remove The Quiet Garden/ }).click();
  await page.getByRole('button', { name: 'Keep book', exact: true }).click();
  await expect(page.getByRole('button', { name: /Read The Quiet Garden/ })).toHaveCount(1);
  await page.getByRole('button', { name: /Remove The Quiet Garden/ }).click();
  await page.getByRole('button', { name: 'Remove book', exact: true }).click();
  await expect(page.getByText('Your next chapter starts here.')).toBeVisible();
  expect(errors).toEqual([]);
});
test('hostile EPUB cannot execute scripts or request remote resources', async ({ page }) => {
  const remote: string[] = [];
  page.on('request', request => { if (request.url().startsWith('https://hostile.invalid')) remote.push(request.url()); });
  await page.goto('/'); await importFixture(page, { hostile: true });
  await expect(page.frameLocator('iframe').getByText('Chapter 1: Morning')).toBeVisible();
  await page.frameLocator('iframe').getByText('Outside', { exact: true }).click();
  await expect(page.getByText('External links are unavailable offline.')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __bookScriptRan?: boolean }).__bookScriptRan)).toBeUndefined();
  await expect(page.locator('iframe')).toHaveAttribute('sandbox', 'allow-same-origin');
  expect(remote).toEqual([]);
});
test('invalid imports fail cleanly and the shelf fits a 320px viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 }); await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({ name: 'bad.epub', mimeType: 'application/epub+zip', buffer: Buffer.from('not an epub') });
  await expect(page.getByRole('alert')).toContainText('not a readable EPUB');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await importFixture(page, { epub2: true, noToc: true });
  await page.getByRole('button', { name: 'Table of contents', exact: true }).click();
  await expect(page.getByText('This book doesn’t include a table of contents.', { exact: false })).toBeVisible();
});
test('production shell and a saved book open after restarting offline', async ({ page, context }) => {
  await page.goto('/'); await importFixture(page);
  await page.getByRole('button', { name: 'Back to shelf' }).click();
  await page.evaluate(async () => { const registration = await navigator.serviceWorker.ready; if (!registration.active) throw new Error('Service worker not active'); });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true); await page.close(); const offline = await context.newPage();
  const failures: string[] = []; offline.on('console', message => { if (message.type() === 'error') failures.push(message.text()); });
  await offline.goto('/');
  await expect(offline.getByRole('button', { name: /Read The Quiet Garden/ }), failures.join('\n')).toBeVisible({ timeout: 10000 });
  await offline.getByRole('button', { name: /Read The Quiet Garden/ }).click();
  await expect(offline.getByRole('button', { name: 'Next page', exact: true })).toBeEnabled({ timeout: 30000 });
  await expect(offline.frameLocator('iframe').getByText('Chapter 1: Morning')).toBeVisible();
});
test('internal links, keyboard, swipe thresholds and invalid-CFI recovery work', async ({ page }) => {
  await page.goto('/'); await importFixture(page);
  await expect(page.getByRole('button', { name: 'Previous page', exact: true })).toBeDisabled();
  await page.frameLocator('iframe').getByText('Visit another chapter', { exact: true }).click();
  await expect.poll(() => visiblePassages(page)).toContain('CH2-PASSAGE-5');
  await page.waitForTimeout(400); const before = await savedCfi(page);
  await page.locator('.book-viewport').focus(); await page.keyboard.press('ArrowRight');
  await expect.poll(() => savedCfi(page)).not.toBe(before);
  const afterKey = await savedCfi(page);
  const swipe = async (dx: number, dy: number) => page.frameLocator('iframe').locator('body').evaluate((body, { dx, dy }) => {
    const doc = body.ownerDocument; const win = doc.defaultView! as Window & typeof globalThis;
    const start = new win.Touch({ identifier: 1, target: body, clientX: 200, clientY: 200 });
    const end = new win.Touch({ identifier: 1, target: body, clientX: 200 + dx, clientY: 200 + dy });
    body.dispatchEvent(new win.TouchEvent('touchstart', { bubbles: true, touches: [start], changedTouches: [start] }));
    body.dispatchEvent(new win.TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: [end] }));
  }, { dx, dy });
  await swipe(-20, 0); await page.waitForTimeout(400); expect(await savedCfi(page)).toBe(afterKey);
  await swipe(-90, 0); await expect.poll(() => savedCfi(page)).not.toBe(afterKey);
  await page.getByRole('button', { name: 'Back to shelf' }).click();
  await updateState(page, 'invalid-cfi');
  await page.getByRole('button', { name: /Read The Quiet Garden/ }).click();
  await expect(page.getByText('Your saved location could not be restored.', { exact: false })).toBeVisible();
  await expect(page.frameLocator('iframe').getByText('Chapter 1: Morning')).toBeVisible();
});
test('reader can be exited while opening and reopened without late errors', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await importFixture(page); await page.getByRole('button', { name: 'Back to shelf' }).click();
  for (let count = 0; count < 3; count++) {
    await page.getByRole('button', { name: /Read The Quiet Garden/ }).click();
    await page.getByRole('button', { name: 'Back to shelf' }).click();
  }
  await page.getByRole('button', { name: /Read The Quiet Garden/ }).click();
  await expect(page.getByRole('button', { name: 'Next page', exact: true })).toBeEnabled();
  await page.waitForTimeout(500); expect(errors).toEqual([]);
});
