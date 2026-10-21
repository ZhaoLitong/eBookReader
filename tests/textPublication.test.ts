import { expect, it } from 'vitest';
import { textPublication } from '../src/textPublication';
import { preparePublication, inspectPublication } from '../src/publication';
import JSZip from 'jszip';

const bytes = (text: string) => new TextEncoder().encode(text).buffer;
it('preserves Unicode, indentation and literal markup through publication sanitization', async () => {
  const input = '  花园 & friends\r\n<script>alert("hello")</script>\r\n\r\nLast line 😀';
  const converted = await textPublication(bytes(input), 'Garden & friends.TXT', 'test');
  expect((await inspectPublication(converted)).title).toBe('Garden & friends');
  const zip = await JSZip.loadAsync((await preparePublication(converted)).bytes);
  const doc = new DOMParser().parseFromString(await zip.file('EPUB/part-0.xhtml')!.async('string'), 'application/xhtml+xml');
  expect(doc.querySelector('parsererror')).toBeNull();
  expect(doc.querySelector('script')).toBeNull();
  expect(Array.from(doc.querySelectorAll('p')).map(p => p.textContent)).toEqual(['  花园 & friends', '<script>alert("hello")</script>', '', 'Last line 😀']);
});
it.each(['le', 'be'])('decodes BOM-marked UTF-16 %s', async endian => {
  const text = '\ufeffHello 花园 😀';
  const data = new ArrayBuffer(text.length * 2); const view = new DataView(data);
  for (let i = 0; i < text.length; i++) view.setUint16(i * 2, text.charCodeAt(i), endian === 'le');
  const publication = await inspectPublication(await textPublication(data, 'book.txt', 'test'));
  expect(await publication.zip.file('EPUB/part-0.xhtml')!.async('string')).toContain('Hello 花园 😀');
});
it('splits large text without dropping characters or breaking emoji', async () => {
  const input = 'a'.repeat(31999) + '😀' + 'b'.repeat(35000);
  const publication = await inspectPublication(await textPublication(bytes(input), 'book.txt', 'test'));
  let result = '';
  for (let i = 0; i < 3; i++) {
    const doc = new DOMParser().parseFromString(await publication.zip.file(`EPUB/part-${i}.xhtml`)!.async('string'), 'application/xhtml+xml');
    result += doc.querySelector('body')!.textContent;
  }
  expect(result).toBe(input);
});
it('rejects empty, binary and malformed encoded text', async () => {
  await expect(textPublication(bytes(' \n\t'), 'empty.txt', 'test')).rejects.toThrow(/empty/);
  await expect(textPublication(bytes('abc\0def'), 'binary.txt', 'test')).rejects.toThrow(/binary/);
  await expect(textPublication(new Uint8Array([0xff, 0xff]).buffer, 'legacy.txt', 'test')).rejects.toThrow(/encoding/);
});
