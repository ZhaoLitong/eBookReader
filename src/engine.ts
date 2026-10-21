import { Book } from 'epubjs';
import type Rendition from 'epubjs/types/rendition';
import type { Location } from 'epubjs/types/rendition';
import type Contents from 'epubjs/types/contents';
import type { NavItem } from 'epubjs/types/navigation';
import type { LibraryRepository } from './repository';
import { preparePublication } from './publication';
import { ReaderError, type ReaderLocation, type Settings, type TocEntry } from './types';

const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
export function withTimeout<T>(promise: Promise<T>, label: string, milliseconds = 20000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([promise, new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new ReaderError('render', `${label} took too long. Try again or choose a smaller EPUB.`)), milliseconds); })]).finally(() => clearTimeout(timer));
}
export interface ReaderEngine {
  open(host: HTMLElement, bytes: Blob, cfi: string | null, settings: Settings): Promise<TocEntry[]>;
  next(): Promise<void>; previous(): Promise<void>; navigate(target: string): Promise<void>;
  applySettings(settings: Settings): Promise<void>; destroy(): void;
}
export class EpubEngine implements ReaderEngine {
  private book?: Book;
  private rendition?: Rendition;
  private dead = false;
  private suppressed = true;
  private ready = false;
  private queue: Promise<void> = Promise.resolve();
  private location: Location | null = null;
  private direction: 'ltr' | 'rtl' = 'ltr';
  private observer?: ResizeObserver;
  private resizeTimer?: ReturnType<typeof setTimeout>;
  private cleanups: (() => void)[] = [];
  private settings!: Settings;
  private host?: HTMLElement;
  private interactionEnabled = true;
  constructor(private id: string, private repository: LibraryRepository, private onLocation: (location: ReaderLocation) => void, private onNotice: (message: string) => void, private onError: (error: unknown) => void) {}
  setInteractionEnabled(enabled: boolean) { this.interactionEnabled = enabled; }
  async open(host: HTMLElement, blob: Blob, cfi: string | null, settings: Settings) {
    this.host = host; this.settings = settings;
    const prepared = await withTimeout(preparePublication(await blob.arrayBuffer()), 'Preparing this book');
    if (this.dead) return [];
    this.direction = prepared.direction;
    const book = this.book = new Book({ replacements: 'blobUrl', requestMethod: async () => { throw new Error('External book requests are blocked'); } });
    await withTimeout(book.open(prepared.bytes, 'binary'), 'Opening this book');
    await withTimeout(book.opened, 'Preparing book resources');
    if (this.dead) return [];
    const navigation = await withTimeout(book.loaded.navigation, 'Loading contents');
    const toEntries = (items: NavItem[]): TocEntry[] => items.filter(item => !/^[a-z][\w+.-]*:|^\/\//i.test(item.href)).map(item => ({ id: item.id, label: item.label.trim(), href: item.href, children: toEntries(item.subitems ?? []) }));
    const rendition = this.rendition = book.renderTo(host, { width: host.clientWidth, height: host.clientHeight, flow: 'paginated', spread: 'none', allowScriptedContent: false, resizeOnOrientationChange: false, defaultDirection: this.direction });
    rendition.hooks.content.register((contents: Contents) => this.wireDocument(contents));
    rendition.on('relocated', (location: Location) => {
      if (this.dead || this.suppressed || !location?.start?.cfi) return;
      this.location = location; this.emitLocation();
    });
    rendition.on('displayError', (error: unknown) => { if (!this.dead && !this.suppressed) this.onError(error); });
    this.style();
    try {
      if (cfi && !/^epubcfi\(.+\)$/.test(cfi)) throw new Error('Invalid CFI');
      await withTimeout(rendition.display(cfi ?? undefined), 'Restoring this book');
    } catch (error) {
      if (this.dead) return [];
      if (!cfi) throw error;
      this.onNotice('Your saved location could not be restored. Opened the beginning of the book.');
      await withTimeout(rendition.display(), 'Opening the beginning');
    }
    await frame(); await frame();
    if (this.dead) return [];
    this.ready = true; this.suppressed = false;
    this.capture();
    let width = host.clientWidth, height = host.clientHeight;
    this.observer = new ResizeObserver(() => {
      if (width === host.clientWidth && height === host.clientHeight) return;
      width = host.clientWidth; height = host.clientHeight;
      clearTimeout(this.resizeTimer);
      this.resizeTimer = setTimeout(() => { void this.enqueue(async () => {
        const target = this.location?.start.cfi;
        this.rendition?.resize(width, height);
        if (target) await this.rendition?.display(target);
      }).catch(this.onError); }, 120);
    });
    this.observer.observe(host);
    void this.loadLocations();
    return toEntries(navigation.toc);
  }
  private capture() {
    if (!this.rendition || this.dead) return;
    const location = this.rendition.currentLocation() as unknown as Location;
    if (location?.start?.cfi) { this.location = location; this.emitLocation(); }
  }
  private emitLocation() {
    if (!this.location || this.dead) return;
    let fraction: number | null = null;
    if (this.book?.locations.length()) {
      const value = this.book.locations.percentageFromCfi(this.location.start.cfi);
      if (Number.isFinite(value)) fraction = Math.max(0, Math.min(1, value));
    }
    this.onLocation({ cfi: this.location.start.cfi, fraction, atStart: this.location.atStart, atEnd: this.location.atEnd });
  }
  private async loadLocations() {
    const book = this.book;
    if (!book) return;
    try {
      const cache = await this.repository.getLocations(this.id);
      if (this.dead) return;
      let loaded = false;
      if (cache?.version === 1) {
        try { book.locations.load(cache.locations); loaded = book.locations.length() > 0; } catch { /* regenerate invalid cache */ }
      }
      if (!loaded) {
        await book.locations.generate(1024);
        if (this.dead) return;
        await this.repository.saveLocations({ bookId: this.id, version: 1, locations: book.locations.save() });
      }
      if (!this.dead) this.emitLocation();
    } catch { /* Reading and CFI restoration work without estimated percentages. */ }
  }
  private enqueue(operation: () => Promise<unknown>) {
    const next = this.queue.then(async () => {
      if (this.dead || !this.ready) return;
      this.suppressed = true;
      try { await withTimeout(operation(), 'Updating the page'); await frame(); await frame(); }
      finally { this.suppressed = false; if (!this.dead) this.capture(); }
    });
    this.queue = next.catch(() => {});
    return next;
  }
  next() { return this.enqueue(async () => { if (!this.location?.atEnd) await this.rendition?.next(); }); }
  previous() { return this.enqueue(async () => { if (!this.location?.atStart) await this.rendition?.prev(); }); }
  physicalArrow(right: boolean) { return right === (this.direction === 'ltr') ? this.next() : this.previous(); }
  navigate(target: string) {
    if (/^[a-z][\w+.-]*:|^\/\//i.test(target) && !target.startsWith('epubcfi(')) { this.onNotice('External links are unavailable offline.'); return Promise.resolve(); }
    return this.enqueue(async () => this.rendition?.display(target));
  }
  applySettings(settings: Settings) {
    return this.enqueue(async () => {
      const target = this.location?.start.cfi; this.settings = settings; this.style();
      await frame();
      if (target) await this.rendition?.display(target);
    });
  }
  private style() {
    const dark = this.settings.theme === 'dark';
    this.rendition?.themes.default({
      'html': { background: `${dark ? '#1b2422' : '#fffdf7'} !important`, color: `${dark ? '#e8ebe4' : '#28352f'} !important` },
      'body': { color: `${dark ? '#e8ebe4' : '#28352f'} !important`, background: 'transparent !important', 'line-height': '1.65 !important', padding: '0 14px !important' },
      'p, div, span, li, h1, h2, h3, h4, blockquote': { color: 'inherit !important', 'background-color': 'transparent !important' },
      'a': { color: `${dark ? '#a8d1ba' : '#267151'} !important` },
      'img, svg': { 'max-width': '100% !important', 'max-height': '90% !important', 'object-fit': 'contain' },
    });
    this.rendition?.themes.fontSize(this.settings.fontScale + '%');
  }
  private wireDocument(contents: Contents) {
    if (this.dead) return;
    const doc = contents.document;
    const iframe = contents.window.frameElement as HTMLIFrameElement | null;
    iframe?.setAttribute('title', 'Book content');
    let start: { x: number; y: number } | null = null;
    // Elements in an iframe have a different realm; instanceof Element would miss them.
    const interactive = (target: EventTarget | null) => !!(target as Element | null)?.closest?.('a,button,input,textarea,select,[contenteditable]');
    const click = (event: MouseEvent) => {
      const target = event.target as Element;
      const link = target.closest('a');
      if (!link) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (!this.interactionEnabled) return;
      if (link.hasAttribute('data-blocked-link')) { this.onNotice('External links are unavailable offline.'); return; }
      const href = link.getAttribute('href');
      if (!href) return;
      const section = this.book?.spine.get(contents.sectionIndex);
      const resolved = href.startsWith('#') ? (section?.href ?? '') + href : new URL(href, 'https://epub.invalid/' + (section?.href ?? '')).pathname.slice(1) + (new URL(href, 'https://epub.invalid/' + (section?.href ?? '')).hash);
      void this.navigate(resolved).catch(this.onError);
    };
    const key = (event: KeyboardEvent) => {
      if (!this.interactionEnabled || interactive(event.target) || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        const forward = (event.key === 'ArrowRight') === (this.direction === 'ltr');
        void (forward ? this.next() : this.previous()).catch(this.onError);
      }
    };
    const touchStart = (event: TouchEvent) => {
      start = this.interactionEnabled && event.touches.length === 1 && !interactive(event.target) ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null;
    };
    const touchMove = (event: TouchEvent) => { if (event.touches.length !== 1) start = null; };
    const touchCancel = () => { start = null; };
    const touchEnd = (event: TouchEvent) => {
      if (!start || !this.interactionEnabled || doc.getSelection()?.toString()) { start = null; return; }
      const touch = event.changedTouches[0]; if (!touch) return;
      const dx = touch.clientX - start.x, dy = touch.clientY - start.y; start = null;
      if (Math.abs(dx) < 50 || Math.abs(dx) <= Math.abs(dy) * 1.5) return;
      const forward = (dx < 0) === (this.direction === 'ltr');
      void (forward ? this.next() : this.previous()).catch(this.onError);
    };
    doc.addEventListener('click', click, true); doc.addEventListener('keydown', key);
    doc.addEventListener('touchstart', touchStart, { passive: true }); doc.addEventListener('touchmove', touchMove, { passive: true }); doc.addEventListener('touchend', touchEnd); doc.addEventListener('touchcancel', touchCancel);
    this.cleanups.push(() => { doc.removeEventListener('click', click, true); doc.removeEventListener('keydown', key); doc.removeEventListener('touchstart', touchStart); doc.removeEventListener('touchmove', touchMove); doc.removeEventListener('touchend', touchEnd); doc.removeEventListener('touchcancel', touchCancel); });
  }
  destroy() {
    this.dead = true; this.ready = false; clearTimeout(this.resizeTimer); this.observer?.disconnect();
    this.cleanups.forEach(cleanup => cleanup()); this.cleanups = [];
    // epub.js destroys its rendition, location queue and resource blob URLs with the book.
    this.book?.destroy(); this.book = undefined; this.rendition = undefined; this.host?.replaceChildren();
  }
}
