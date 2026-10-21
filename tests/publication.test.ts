import { expect, it } from 'vitest';
import JSZip from 'jszip';
import { inspectPublication, preparePublication } from '../src/publication';
import { fixture } from './fixtures';
it('prepares EPUB 2/3 and preserves text and nested contents', async () => {
  for (const epub2 of [false, true]) {
    const prepared = await preparePublication(await fixture({ epub2 }));
    const zip = await JSZip.loadAsync(prepared.bytes);
    expect(await zip.file('EPUB/chapter2.xhtml')!.async('string')).toContain('CH2-PASSAGE-5');
    expect(prepared.direction).toBe('ltr');
  }
});
it('strips active content, blocks external URLs, and inserts CSP before chapter resources', async () => {
  const prepared = await preparePublication(await fixture({ hostile: true }));
  const zip = await JSZip.loadAsync(prepared.bytes);
  const text = await zip.file('EPUB/chapter1.xhtml')!.async('string');
  const doc = new DOMParser().parseFromString(text, 'application/xhtml+xml');
  expect(doc.querySelectorAll('script,iframe,form,input,[onerror]')).toHaveLength(0);
  expect(doc.querySelector('head')?.firstElementChild?.getAttribute('http-equiv')).toBe('Content-Security-Policy');
  expect(text).not.toContain('https://hostile.invalid'); expect(text).toContain('data-blocked-link');
});
it('rejects entity declarations, missing reading-order resources and unsafe archive paths', async () => {
  const zip = await JSZip.loadAsync(await fixture());
  zip.file('META-INF/container.xml', '<!DOCTYPE x [<!ENTITY a SYSTEM "file:///etc/passwd">]><x>&a;</x>');
  await expect(inspectPublication(await zip.generateAsync({ type: 'arraybuffer' }))).rejects.toThrow();
  const missing = await JSZip.loadAsync(await fixture()); missing.remove('EPUB/chapter1.xhtml');
  await expect(inspectPublication(await missing.generateAsync({ type: 'arraybuffer' }))).rejects.toThrow();
  const unsafe = await JSZip.loadAsync(await fixture()); unsafe.file('../escape.xhtml', '<html/>');
  await expect(inspectPublication(await unsafe.generateAsync({ type: 'arraybuffer' }))).rejects.toThrow();
});
