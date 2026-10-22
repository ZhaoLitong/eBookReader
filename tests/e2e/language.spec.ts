import { test, expect, type Page } from '@playwright/test';
import { fixture } from '../fixtures';

async function preference(page: Page) {
  return page.evaluate(() => new Promise<string>((resolve, reject) => {
    const request = indexedDB.open('epub-reader');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result; const get = db.transaction('preferences').objectStore('preferences').get('settings');
      get.onsuccess = () => { resolve(get.result?.value.language ?? ''); db.close(); };
    };
  }));
}
async function position(page: Page) {
  return page.evaluate(() => new Promise<string>((resolve, reject) => {
    const request = indexedDB.open('epub-reader'); request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result; const get = db.transaction('states').objectStore('states').getAll();
      get.onsuccess = () => { resolve(get.result[0]?.cfi ?? ''); db.close(); };
    };
  }));
}

test('Chinese selection translates errors and persists after reload at 320px', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 780 });
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('zh-CN');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.getByRole('heading', { name: '从这里开启下一章。' })).toBeVisible();
  await expect.poll(() => preference(page)).toBe('zh-CN');
  await page.locator('input[type=file]').setInputFiles({ name: 'bad.epub', mimeType: 'application/epub+zip', buffer: Buffer.from('invalid') });
  await expect(page.getByRole('alert')).toContainText('无法读取此 EPUB 文件');
  await page.getByRole('combobox', { name: '语言', exact: true }).selectOption('en');
  await expect(page.getByRole('alert')).toContainText('not a readable EPUB');
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('zh-CN');
  await expect.poll(() => preference(page)).toBe('zh-CN');
  await page.reload();
  await expect(page.getByRole('combobox', { name: '语言', exact: true })).toHaveValue('zh-CN');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('chinese-shelf.png'), fullPage: true });
});

test.describe('Chinese device defaults', () => {
  test.use({ locale: 'zh-CN', viewport: { width: 390, height: 820 } });
  test('reader language changes preserve progress, book text, settings and dialogs', async ({ page }, testInfo) => {
    await page.goto('/');
    await expect(page.getByRole('combobox', { name: '语言', exact: true })).toHaveValue('zh-CN');
    await page.locator('input[type=file]').setInputFiles({ name: 'garden.epub', mimeType: 'application/epub+zip', buffer: Buffer.from(await fixture()) });
    await expect(page.getByRole('button', { name: '下一页', exact: true })).toBeEnabled();
    await expect(page.locator('iframe')).toHaveAttribute('title', '书籍内容');
    await expect(page.frameLocator('iframe').getByText('Chapter 1: Morning')).toBeVisible();
    await expect.poll(() => position(page)).toContain('epubcfi(');
    const first = await position(page);
    await page.getByRole('button', { name: '下一页', exact: true }).click();
    await expect.poll(() => position(page)).not.toBe(first);
    const saved = await position(page);
    await page.getByRole('button', { name: '阅读设置', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveAccessibleName('阅读设置');
    await page.screenshot({ path: testInfo.outputPath('chinese-settings.png'), fullPage: true });
    await page.getByRole('combobox', { name: '语言', exact: true }).selectOption('en');
    await expect(page.getByRole('dialog')).toHaveAccessibleName('Reading settings');
    await expect(page.locator('iframe')).toHaveAttribute('title', 'Book content');
    await expect.poll(() => preference(page)).toBe('en');
    await page.getByRole('button', { name: 'Close panel', exact: true }).click();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Previous page', exact: true })).toBeEnabled();
    await expect.poll(() => position(page)).toBe(saved);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await page.getByRole('button', { name: 'Reading settings', exact: true }).click();
    await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('zh-CN');
    await expect.poll(() => preference(page)).toBe('zh-CN');
    await page.getByRole('button', { name: '关闭面板', exact: true }).click();
    await page.getByRole('button', { name: '目录', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveAccessibleName('目录');
    await expect(page.getByRole('button', { name: 'Morning', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '关闭面板', exact: true }).click();
    await page.screenshot({ path: testInfo.outputPath('chinese-reader.png'), fullPage: true });
    await page.getByRole('button', { name: '返回书架', exact: true }).click();
    await page.getByRole('button', { name: '移除《The Quiet Garden — 花园》', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveAccessibleName('移除此书？');
    await page.getByRole('button', { name: '保留书籍', exact: true }).click();
    await expect(page.getByRole('button', { name: '阅读《The Quiet Garden — 花园》', exact: true })).toBeVisible();
  });
});
