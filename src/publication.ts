import JSZip from 'jszip';
import { ReaderError } from './types';

export const MAX_BYTES = 100 * 1024 * 1024;
const MAX_EXPANDED = 250 * 1024 * 1024;
export const BOOK_CSP = "default-src 'none'; script-src 'none'; style-src 'unsafe-inline' blob: data:; img-src blob: data:; font-src blob: data:; media-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
const xmlExtensions = /\.(?:xhtml|html|htm|svg|xml|opf|ncx)$/i;
const invalid = () => new ReaderError('invalid', 'This file is not a readable EPUB. Choose a valid, DRM-free EPUB.');
function parseXml(text: string): Document {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) {
    // A simple XHTML doctype is common; external/internal entities are never needed.
    if (/<!ENTITY|<!DOCTYPE[^>]*\[/i.test(text)) throw invalid();
    text = text.replace(/<!DOCTYPE[^>]*>/gi, '');
  }
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw invalid();
  return doc;
}
const elements = (root: Document | Element, name: string) => Array.from(root.getElementsByTagNameNS('*', name));
function resolvePath(base: string, reference: string): string {
  if (!reference || /^[a-z][\w+.-]*:|^\/\//i.test(reference) || reference.includes('\\')) throw invalid();
  const decoded = decodeURIComponent(reference.split(/[?#]/)[0]);
  if (decoded.startsWith('/')) throw invalid();
  const path = base.split('/').slice(0, -1);
  for (const part of decoded.split('/')) {
    if (part === '..') { if (!path.length) throw invalid(); path.pop(); }
    else if (part && part !== '.') path.push(part);
  }
  return path.join('/');
}
function safeReference(value: string, allowData = true): boolean {
  const normalized = value.replace(/[\u0000-\u0020]/g, '');
  if (normalized.startsWith('//') || normalized.startsWith('/') || normalized.includes('\\')) return false;
  if (/^[a-z][\w+.-]*:/i.test(normalized)) return allowData && /^data:image\/(?:png|jpeg|gif|webp|avif);base64,/i.test(normalized);
  return true;
}
function safeCss(text: string) {
  // CSP is the enforcement boundary, including escaped CSS URLs and nested imports.
  return text.replace(/@import\s+[^;]+;?/gi, '').replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (_all, _quote, url: string) => safeReference(url) ? `url("${url.replace(/"/g, '')}")` : 'url("")');
}
function sanitizeDocument(doc: Document) {
  for (const node of Array.from(doc.getElementsByTagName('*'))) {
    const name = node.localName.toLowerCase();
    if (['script', 'iframe', 'object', 'embed', 'base', 'form', 'input', 'button', 'textarea', 'select', 'audio', 'video', 'animate', 'animatetransform', 'set'].includes(name) ||
        (name === 'meta' && node.hasAttribute('http-equiv'))) { node.remove(); continue; }
    for (const attr of Array.from(node.attributes)) {
      const key = attr.localName.toLowerCase();
      if (key.startsWith('on') || ['srcdoc', 'srcset', 'ping', 'action', 'formaction', 'target', 'download', 'xml:base'].includes(key) || (key === 'base' && attr.prefix === 'xml')) node.removeAttributeNode(attr);
      else if (['href', 'src', 'poster', 'data'].includes(key) && !safeReference(attr.value, name !== 'a')) {
        if (name === 'a') node.setAttribute('data-blocked-link', 'true');
        node.removeAttributeNode(attr);
      } else if (key === 'style') node.setAttribute('style', safeCss(attr.value));
    }
    if (name === 'style') node.textContent = safeCss(node.textContent ?? '');
  }
  const head = elements(doc, 'head')[0];
  if (head) {
    const meta = doc.createElementNS(head.namespaceURI, 'meta');
    meta.setAttribute('http-equiv', 'Content-Security-Policy'); meta.setAttribute('content', BOOK_CSP);
    head.insertBefore(meta, head.firstChild);
  }
}

export interface InspectedPublication { title: string; author: string; cover: Blob | null; zip: JSZip; direction: 'ltr' | 'rtl' }
export async function inspectPublication(bytes: ArrayBuffer): Promise<InspectedPublication> {
  try {
    const zip = await JSZip.loadAsync(bytes);
    const entries = Object.values(zip.files);
    if (entries.length > 10000) throw invalid();
    let expanded = 0;
    for (const entry of entries) {
      const original = (entry as JSZip.JSZipObject & { unsafeOriginalName?: string }).unsafeOriginalName ?? entry.name;
      if (original.startsWith('/') || original.includes('\\') || original.split('/').includes('..') || original.includes('\0')) throw invalid();
      // Bound declared decompression work before handing the archive to the renderer.
      expanded += (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0;
      if (expanded > MAX_EXPANDED) throw new ReaderError('size', 'This EPUB expands beyond the 250 MiB safety limit. Choose a smaller book.');
    }
    if ((await zip.file('mimetype')?.async('string'))?.trim() !== 'application/epub+zip') throw invalid();
    const containerText = await zip.file('META-INF/container.xml')?.async('string');
    if (!containerText) throw invalid();
    const container = parseXml(containerText);
    const rootPath = elements(container, 'rootfile')[0]?.getAttribute('full-path');
    if (!rootPath) throw invalid();
    const opfPath = resolvePath('', rootPath);
    const opfText = await zip.file(opfPath)?.async('string');
    if (!opfText) throw invalid();
    const opf = parseXml(opfText);
    const items = elements(opf, 'item');
    const manifest = new Map(items.map(item => [item.getAttribute('id'), item]));
    const spine = elements(opf, 'spine')[0];
    if (!spine) throw invalid();
    const refs = elements(spine, 'itemref');
    if (!refs.some(ref => ref.getAttribute('linear') !== 'no')) throw invalid();
    for (const node of [...elements(opf, 'meta'), ...refs]) {
      if ((node.getAttribute('property') === 'rendition:layout' && node.textContent?.trim() === 'pre-paginated') ||
          /(?:^|\s)rendition:layout-pre-paginated(?:\s|$)/.test(node.getAttribute('properties') ?? '') ||
          (node.getAttribute('name') === 'fixed-layout' && node.getAttribute('content') === 'true'))
        throw new ReaderError('layout', 'Fixed-layout EPUBs are not supported. Choose a reflowable EPUB.');
    }
    const appleOptions = await zip.file('META-INF/com.apple.ibooks.display-options.xml')?.async('string');
    if (appleOptions && elements(parseXml(appleOptions), 'option').some(node => node.getAttribute('name') === 'fixed-layout' && node.textContent === 'true'))
      throw new ReaderError('layout', 'Fixed-layout EPUBs are not supported. Choose a reflowable EPUB.');
    const encryption = await zip.file('META-INF/encryption.xml')?.async('string');
    if (encryption) {
      const encryptionDoc = parseXml(encryption);
      const algorithms = elements(encryptionDoc, 'EncryptionMethod').map(node => node.getAttribute('Algorithm'));
      if (!algorithms.length || algorithms.some(algorithm => !['http://www.idpf.org/2008/embedding', 'http://ns.adobe.com/pdf/enc#RC'].includes(algorithm ?? '')))
        throw new ReaderError('protected', 'This EPUB contains protected content. Only DRM-free books are supported.');
    }
    for (const item of items) resolvePath(opfPath, item.getAttribute('href') ?? '');
    for (const ref of refs) {
      const item = manifest.get(ref.getAttribute('idref'));
      if (!item || !['application/xhtml+xml', 'text/html'].includes(item.getAttribute('media-type') ?? '')) throw invalid();
      const path = resolvePath(opfPath, item.getAttribute('href') ?? '');
      if (!zip.file(path)) throw invalid();
    }
    const legacyCover = elements(opf, 'meta').find(node => node.getAttribute('name') === 'cover')?.getAttribute('content');
    const coverItem = items.find(item => item.getAttribute('properties')?.split(/\s+/).includes('cover-image')) ?? manifest.get(legacyCover ?? '');
    let cover: Blob | null = null;
    if (coverItem && /^image\/(?:png|jpeg|gif|webp|avif)$/.test(coverItem.getAttribute('media-type') ?? '')) {
      const entry = zip.file(resolvePath(opfPath, coverItem.getAttribute('href') ?? ''));
      if (entry) { try { cover = new Blob([await entry.async('arraybuffer')], { type: coverItem.getAttribute('media-type')! }); } catch { /* cover is optional */ } }
    }
    return { title: elements(opf, 'title')[0]?.textContent?.trim() ?? '', author: elements(opf, 'creator').map(node => node.textContent?.trim()).filter(Boolean).join(', '), cover, zip, direction: spine.getAttribute('page-progression-direction') === 'rtl' ? 'rtl' : 'ltr' };
  } catch (error) { if (error instanceof ReaderError) throw error; throw invalid(); }
}

/** Rebuild an ephemeral safe archive. Stored original bytes are never modified. */
export async function preparePublication(bytes: ArrayBuffer): Promise<{ bytes: ArrayBuffer; direction: 'ltr' | 'rtl' }> {
  const publication = await inspectPublication(bytes);
  for (const entry of Object.values(publication.zip.files)) {
    if (entry.dir) continue;
    if (xmlExtensions.test(entry.name)) {
      const doc = parseXml(await entry.async('string'));
      sanitizeDocument(doc);
      publication.zip.file(entry.name, new XMLSerializer().serializeToString(doc));
    } else if (/\.css$/i.test(entry.name)) publication.zip.file(entry.name, safeCss(await entry.async('string')));
  }
  return { bytes: await publication.zip.generateAsync({ type: 'arraybuffer', compression: 'STORE' }), direction: publication.direction };
}
