import JSZip from 'jszip';
import { ReaderError } from './types';

const escapeXml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** Convert plain text into a local publication so pagination and saved positions share the EPUB reader. */
export async function textPublication(bytes: ArrayBuffer, filename: string, id: string): Promise<ArrayBuffer> {
  const raw = new Uint8Array(bytes);
  const encoding = raw[0] === 0xff && raw[1] === 0xfe ? 'utf-16le' : raw[0] === 0xfe && raw[1] === 0xff ? 'utf-16be' : 'utf-8';
  let text: string;
  try { text = new TextDecoder(encoding, { fatal: true }).decode(bytes); }
  catch { throw new ReaderError('encoding', 'This TXT file uses an unsupported encoding. Save it as UTF-8 or UTF-16 with a BOM, then try again.'); }
  text = text.replace(/\r\n?/g, '\n');
  if (!text.trim()) throw new ReaderError('empty', 'This TXT file is empty. Choose a file with text to read.');
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/u.test(text))
    throw new ReaderError('invalid', 'This file contains binary data. Choose a plain-text TXT file.');
  const title = escapeXml(filename.replace(/\.txt$/i, '') || 'Untitled book');
  // Bound section size, prefer line boundaries, and never split a surrogate pair.
  const sections: string[] = [];
  for (let start = 0; start < text.length;) {
    let end = Math.min(start + 32000, text.length);
    if (end < text.length) {
      const newline = text.lastIndexOf('\n', end - 1);
      if (newline > start + 16000) end = newline + 1;
      else if (/[\uD800-\uDBFF]/.test(text[end - 1])) end--;
    }
    sections.push(text.slice(start, end)); start = end;
  }
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file('META-INF/container.xml', '<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
  const html = (body: string) => `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>${title}</title><style>p{white-space:pre-wrap;overflow-wrap:anywhere;margin:0;min-height:1.65em}</style></head><body>${body}</body></html>`;
  sections.forEach((section, i) => zip.file(`EPUB/part-${i}.xhtml`, html(section.split('\n').map(line => `<p>${escapeXml(line) || '<br/>'}</p>`).join(''))));
  zip.file('EPUB/nav.xhtml', html(`<nav epub:type="toc" id="toc"><h1>Contents</h1><ol>${sections.map((_section, i) => `<li><a href="part-${i}.xhtml">${sections.length === 1 ? title : `Part ${i + 1}`}</a></li>`).join('')}</ol></nav>`));
  zip.file('EPUB/package.opf', `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">urn:sha256:${id}</dc:identifier><dc:title>${title}</dc:title><dc:language>und</dc:language><meta property="dcterms:modified">2020-01-01T00:00:00Z</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>${sections.map((_section, i) => `<item id="part-${i}" href="part-${i}.xhtml" media-type="application/xhtml+xml"/>`).join('')}</manifest><spine>${sections.map((_section, i) => `<itemref idref="part-${i}"/>`).join('')}</spine></package>`);
  return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
}
