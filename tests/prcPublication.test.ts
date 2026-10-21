import { expect, it } from 'vitest';
import { prcPublication } from '../src/prcPublication';
import { inspectPublication, preparePublication } from '../src/publication';
import { prcFixture } from './prcFixtures';

it('imports Unicode MOBI text and title without active markup or remote resources', async () => {
  const bytes = await prcPublication(prcFixture({ text: '<html><head><script>bad()</script></head><body><p>Hello 花园 &amp; friends</p><img src="https://invalid.example/a.jpg"/><p>Next</p></body></html>' }), 'book.prc', 'test');
  const pub = await inspectPublication(bytes);
  expect(pub.title).toBe('The PRC Garden');
  const html = await pub.zip.file('EPUB/part-0.xhtml')!.async('string');
  expect(html).toContain('Hello 花园 &amp; friends'); expect(html).toContain('Next');
  expect(html).not.toContain('bad()'); expect(html).not.toContain('https://'); expect(html).not.toContain('<img');
  await expect(preparePublication(bytes)).resolves.toBeDefined();
});
it('decodes PalmDOC literal runs, overlapping back references, and space compression', async () => {
  // abc + a 6-byte copy from distance 3 + compressed space/X + literal NUL-free byte.
  const compressed = new Uint8Array([3, 97, 98, 99, 0x80, 0x1b, 0xd8, 33]);
  const pub = await inspectPublication(await prcPublication(prcFixture({ palm: true, text: 'abcabcabc X!', compressed }), 'book.prc', 'test'));
  expect(await pub.zip.file('EPUB/part-0.xhtml')!.async('string')).toContain('abcabcabc X!');
});
it('reads Windows-1252 PalmDOC text', async () => {
  const data = prcFixture({ palm: true, text: 'cafe' }); new Uint8Array(data)[data.byteLength - 1] = 0xe9;
  const pub = await inspectPublication(await prcPublication(data, 'Cafe.prc', 'test'));
  expect(await pub.zip.file('EPUB/part-0.xhtml')!.async('string')).toContain('café');
});
it('ignores a PalmDOC saved reading position and removes MOBI record trailers', async () => {
  const palm = prcFixture({ palm: true, text: 'Hello' }); new DataView(palm).setUint32(108, 70000);
  await expect(prcPublication(palm, 'book.prc', 'test')).resolves.toBeInstanceOf(ArrayBuffer);
  const original = prcFixture(); const data = new Uint8Array(original.byteLength + 3); data.set(new Uint8Array(original));
  data.set([42, 42, 0x83], original.byteLength); new DataView(data.buffer).setUint16(96 + 242, 2);
  await expect(prcPublication(data.buffer, 'book.prc', 'test')).resolves.toBeInstanceOf(ArrayBuffer);
});
it.each([{ encryption: 1 }, { compression: 17480 }, { version: 8 }])('rejects unsupported PRC: %j', async options => {
  await expect(prcPublication(prcFixture(options), 'book.prc', 'test')).rejects.toThrow(/encrypted|not supported/);
});
it('rejects invalid record offsets, truncated records and invalid back references', async () => {
  const data = prcFixture(); new DataView(data).setUint32(86, 1);
  await expect(prcPublication(data, 'book.prc', 'test')).rejects.toThrow(/not a readable/);
  await expect(prcPublication(prcFixture().slice(0, -2), 'book.prc', 'test')).rejects.toThrow(/not a readable/);
  await expect(prcPublication(prcFixture({ palm: true, text: 'aaa', compressed: new Uint8Array([0x80, 8]) }), 'book.prc', 'test')).rejects.toThrow(/not a readable/);
});
