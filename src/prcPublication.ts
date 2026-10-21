import { ReaderError } from './types';
import { textPublication } from './textPublication';

const invalid = () => new ReaderError('invalid', 'This file is not a readable PRC/Mobipocket book.');
const unsupported = (detail: string) => new ReaderError('unsupported', `${detail} Convert this book to EPUB before importing it.`);
const MAX_TEXT = 64 * 1024 * 1024;

/** Decode PalmDOC LZ77, with a per-record output bound and checked back references. */
function decompress(input: Uint8Array, limit: number): Uint8Array {
  const output = new Uint8Array(limit); let length = 0;
  const emit = (value: number) => { if (length >= limit) throw invalid(); output[length++] = value; };
  for (let i = 0; i < input.length;) {
    const value = input[i++];
    if (value >= 1 && value <= 8) {
      if (i + value > input.length) throw invalid();
      for (let n = 0; n < value; n++) emit(input[i++]);
    } else if (value <= 0x7f) emit(value);
    else if (value >= 0xc0) { emit(32); emit(value ^ 0x80); }
    else {
      if (i >= input.length) throw invalid();
      const pair = ((value & 0x3f) << 8) | input[i++];
      const distance = pair >> 3, count = (pair & 7) + 3;
      if (!distance || distance > length) throw invalid();
      for (let n = 0; n < count; n++) emit(output[length - distance]);
    }
  }
  return output.subarray(0, length);
}

/** Read legacy, unencrypted PalmDOC/MOBI text. Never execute or attach source HTML. */
export async function prcPublication(bytes: ArrayBuffer, filename: string, id: string): Promise<ArrayBuffer> {
  const data = new Uint8Array(bytes), view = new DataView(bytes);
  if (data.length < 86) throw invalid();
  const signature = String.fromCharCode(...data.subarray(60, 68));
  if (!['BOOKMOBI', 'TEXtREAd'].includes(signature)) throw invalid();
  const count = view.getUint16(76), tableEnd = 78 + count * 8;
  if (count < 2 || tableEnd > data.length || view.getUint32(72) !== 0) throw invalid();
  const offsets: number[] = [];
  for (let i = 0; i < count; i++) {
    const offset = view.getUint32(78 + i * 8);
    // Palm databases may contain empty auxiliary records, including at EOF.
    // Repeated offsets represent empty records; only backwards/out-of-range offsets are invalid.
    if (offset < tableEnd || offset > data.length || (i > 0 && offset < offsets[i - 1])) throw invalid();
    offsets.push(offset);
  }
  offsets.push(data.length);
  const header = data.subarray(offsets[0], offsets[1]);
  if (header.length < 16) throw invalid();
  const h = new DataView(header.buffer, header.byteOffset, header.byteLength);
  const compression = h.getUint16(0), textLength = h.getUint32(4), records = h.getUint16(8), recordSize = h.getUint16(10);
  if (signature === 'BOOKMOBI' && h.getUint16(12) !== 0) throw new ReaderError('protected', 'This PRC book is encrypted. Only DRM-free books are supported.');
  if (![1, 2].includes(compression)) throw unsupported('This PRC compression format is not supported.');
  if (!textLength || textLength > MAX_TEXT) throw new ReaderError('size', 'PRC text must be nonempty and no larger than 64 MiB.');
  if (!records || records >= count || !recordSize) throw invalid();
  let encoding = 'windows-1252', title = filename.replace(/\.(prc|mobi)$/i, ''), flags = 0;
  if (signature === 'BOOKMOBI') {
    if (header.length < 116 || String.fromCharCode(...header.subarray(16, 20)) !== 'MOBI') throw invalid();
    const headerLength = h.getUint32(20), version = h.getUint32(36), codepage = h.getUint32(28);
    if (headerLength < 100 || 16 + headerLength > header.length) throw invalid();
    if (version > 7) throw unsupported('Kindle KF8 PRC books are not supported.');
    if (![1252, 65001].includes(codepage)) throw unsupported('This PRC character encoding is not supported.');
    encoding = codepage === 65001 ? 'utf-8' : 'windows-1252';
    const titleOffset = h.getUint32(84), titleLength = h.getUint32(88);
    if (titleLength) {
      if (titleOffset < 16 + headerLength || titleOffset + titleLength > header.length) throw invalid();
      title = new TextDecoder(encoding).decode(header.subarray(titleOffset, titleOffset + titleLength));
    }
    if (headerLength >= 228) flags = h.getUint16(242);
  }
  const output = new Uint8Array(textLength); let written = 0;
  for (let i = 1; i <= records; i++) {
    let record = data.subarray(offsets[i], offsets[i + 1]);
    // MOBI trailing entries are length-prefixed backwards; lengths include the prefix.
    let end = record.length;
    for (let bits = flags >>> 1; bits; bits >>>= 1) {
      if (!(bits & 1)) continue;
      let size = 0, shift = 0, cursor = end;
      while (true) {
        if (cursor === 0 || shift >= 28) throw invalid();
        const value = record[--cursor]; size += (value & 0x7f) * 2 ** shift;
        if (value & 0x80) break;
        shift += 7;
      }
      if (size < end - cursor || size > end) throw invalid();
      end -= size;
    }
    if (flags & 1) { if (!end) throw invalid(); end -= (record[end - 1] & 3) + 1; }
    if (end < 0) throw invalid();
    record = record.subarray(0, end);
    const decoded = compression === 2 ? decompress(record, recordSize) : record;
    if (decoded.length > recordSize || written + decoded.length > textLength) throw invalid();
    output.set(decoded, written); written += decoded.length;
  }
  if (written !== textLength) throw invalid();
  let text: string;
  try { text = new TextDecoder(encoding, { fatal: true }).decode(output); } catch { throw invalid(); }
  if (signature === 'BOOKMOBI') {
    // Template content is inert, including images and scripts. Extract only readable text.
    const template = document.createElement('template'); template.innerHTML = text;
    template.content.querySelectorAll('script,style,head,title,meta,link,iframe,object,embed,form').forEach(node => node.remove());
    template.content.querySelectorAll('p,div,h1,h2,h3,h4,h5,h6,li,blockquote,br,hr,tr,mbp\\:pagebreak').forEach(node => node.after(document.createTextNode('\n')));
    text = template.content.textContent ?? '';
  }
  return textPublication(new TextEncoder().encode(text).buffer, `${title.replace(/[\u0000-\u001f]/g, '').trim() || 'Untitled book'}.txt`, id);
}
