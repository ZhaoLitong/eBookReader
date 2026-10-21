import Dexie, { type EntityTable } from 'dexie';
import { defaultSettings, normalizeSettings, ReaderError, type Assets, type BookMeta, type BookSummary, type Cover, type LocationCache, type ReadingState, type Settings } from './types';
import { inspectPublication, MAX_BYTES } from './publication';

export class LibraryDatabase extends Dexie {
  books!: EntityTable<BookMeta, 'id'>;
  assets!: EntityTable<Assets, 'bookId'>;
  covers!: EntityTable<Cover, 'bookId'>;
  states!: EntityTable<ReadingState, 'bookId'>;
  locations!: EntityTable<LocationCache, 'bookId'>;
  preferences!: EntityTable<{ key: string; value: Settings }, 'key'>;
  constructor(name = 'epub-reader') {
    super(name);
    this.version(1).stores({ books: 'id,lastOpenedAt', assets: 'bookId', covers: 'bookId', states: 'bookId', locations: 'bookId', preferences: 'key' });
  }
}
export interface LibraryRepository {
  list(): Promise<BookSummary[]>;
  get(id: string): Promise<BookMeta | undefined>;
  getBytes(id: string): Promise<Blob | undefined>;
  getCover(id: string): Promise<Blob | undefined>;
  importBook(file: File): Promise<string>;
  remove(id: string): Promise<void>;
  getState(id: string): Promise<ReadingState | undefined>;
  saveState(state: ReadingState): Promise<void>;
  markOpened(id: string): Promise<void>;
  getSettings(): Promise<Settings>;
  saveSettings(settings: Settings): Promise<void>;
  getLocations(id: string): Promise<LocationCache | undefined>;
  saveLocations(cache: LocationCache): Promise<void>;
}
export class IndexedLibrary implements LibraryRepository {
  constructor(public readonly db = new LibraryDatabase()) {}
  async list(): Promise<BookSummary[]> {
    const [books, states] = await Promise.all([this.db.books.toArray(), this.db.states.toArray()]);
    const map = new Map(states.map(state => [state.bookId, state]));
    return books.map(book => ({ ...book, progress: map.get(book.id) ?? null }))
      .sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  }
  get(id: string) { return this.db.books.get(id); }
  async getBytes(id: string) { return (await this.db.assets.get(id))?.epub; }
  async getCover(id: string) { return (await this.db.covers.get(id))?.blob; }
  async importBook(file: File): Promise<string> {
    if (file.size > MAX_BYTES) throw new ReaderError('size', 'This file exceeds the 100 MiB limit. Choose a smaller EPUB.');
    let bytes: ArrayBuffer;
    try { bytes = await file.arrayBuffer(); } catch { throw new ReaderError('source', 'The selected file could not be read. Please select it again.'); }
    const id = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('');
    if (await this.get(id)) return id;
    const publication = await inspectPublication(bytes);
    const meta: BookMeta = {
      id, filename: file.name, title: publication.title || file.name.replace(/\.epub$/i, '') || 'Untitled book',
      author: publication.author, importedAt: Date.now(), lastOpenedAt: null, size: file.size, hasCover: !!publication.cover,
    };
    try {
      await this.db.transaction('rw', [this.db.books, this.db.assets, this.db.covers, this.db.states], async () => {
        if (await this.db.books.get(id)) return;
        await this.db.books.add(meta);
        await this.db.assets.add({ bookId: id, epub: new Blob([bytes], { type: 'application/epub+zip' }) });
        if (publication.cover) await this.db.covers.add({ bookId: id, blob: publication.cover });
        await this.db.states.add({ bookId: id, cfi: null, fraction: null, updatedAt: Date.now() });
      });
    } catch { throw new ReaderError('storage', 'The book could not be saved. Free some device storage and try importing again.'); }
    void navigator.storage?.persist?.().catch(() => false);
    return id;
  }
  async remove(id: string) {
    await this.db.transaction('rw', [this.db.books, this.db.assets, this.db.covers, this.db.states, this.db.locations], async () => {
      await Promise.all([this.db.books.delete(id), this.db.assets.delete(id), this.db.covers.delete(id), this.db.states.delete(id), this.db.locations.delete(id)]);
    });
  }
  getState(id: string) { return this.db.states.get(id); }
  async saveState(state: ReadingState) {
    await this.db.transaction('rw', [this.db.books, this.db.states], async () => {
      if (await this.db.books.get(state.bookId)) await this.db.states.put(state);
    });
  }
  async markOpened(id: string) { await this.db.books.update(id, { lastOpenedAt: Date.now() }); }
  async getSettings() { return normalizeSettings((await this.db.preferences.get('settings'))?.value ?? defaultSettings); }
  async saveSettings(settings: Settings) { await this.db.preferences.put({ key: 'settings', value: normalizeSettings(settings) }); }
  getLocations(id: string) { return this.db.locations.get(id); }
  async saveLocations(cache: LocationCache) {
    await this.db.transaction('rw', [this.db.books, this.db.locations], async () => {
      if (await this.db.books.get(cache.bookId)) await this.db.locations.put(cache);
    });
  }
}
export const library = new IndexedLibrary();
