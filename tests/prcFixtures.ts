/** Synthetic Palm database fixture, no third-party book content. */
export function prcFixture(options: { palm?: boolean; compressed?: Uint8Array; text?: string; encryption?: number; compression?: number; version?: number } = {}) {
  const source = new TextEncoder().encode(options.text ?? '<html><body><h1>Garden</h1><p>Hello 花园 &amp; friends.</p><p>Second paragraph.</p></body></html>');
  const record = options.compressed ?? source;
  const title = new TextEncoder().encode('The PRC Garden');
  const headerSize = options.palm ? 16 : 248 + title.length;
  const data = new Uint8Array(96 + headerSize + record.length); const v = new DataView(data.buffer);
  data.set(new TextEncoder().encode(options.palm ? 'TEXtREAd' : 'BOOKMOBI'), 60);
  v.setUint16(76, 2); v.setUint32(78, 96); v.setUint32(86, 96 + headerSize);
  v.setUint16(96, options.compression ?? (options.compressed ? 2 : 1)); v.setUint32(100, source.length);
  v.setUint16(104, 1); v.setUint16(106, Math.max(4096, source.length)); v.setUint16(108, options.encryption ?? 0);
  if (!options.palm) {
    data.set(new TextEncoder().encode('MOBI'), 112); v.setUint32(116, 232); v.setUint32(124, 65001); v.setUint32(132, options.version ?? 6);
    v.setUint32(180, 248); v.setUint32(184, title.length); data.set(title, 96 + 248);
  }
  data.set(record, 96 + headerSize); return data.buffer;
}
