import { afterEach, describe, expect, it, vi } from 'vitest';
import { IndexedLibrary, LibraryDatabase } from '../src/repository';
import { fixture } from './fixtures';
import { MAX_BYTES } from '../src/publication';
import { normalizeSettings } from '../src/types';

const databases: LibraryDatabase[] = [];
function repository() { const db = new LibraryDatabase(`test-${crypto.randomUUID()}`); databases.push(db); return new IndexedLibrary(db); }
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(databases.splice(0).map(db => db.delete())); });
describe('library import and persistence', () => {
  it('persists original bytes, metadata, state and cover, and deduplicates renamed files', async () => {
    const repo = repository(); const bytes = await fixture({ cover: true });
    const id = await repo.importBook(new File([bytes], 'garden.epub'));
    await repo.saveState({ bookId: id, cfi: 'epubcfi(/6/2!/4/2)', fraction: .4, updatedAt: 12 });
    expect(await repo.importBook(new File([bytes], 'renamed.epub'))).toBe(id);
    const books = await repo.list(); expect(books).toHaveLength(1);
    expect(books[0]).toMatchObject({ title: 'The Quiet Garden — 花园', author: 'Robin Page', progress: { fraction: .4 } });
    expect(await (await repo.getBytes(id))!.arrayBuffer()).toEqual(bytes);
    expect(await repo.getCover(id)).toBeInstanceOf(Blob);
    repo.db.close(); await repo.db.open(); expect((await repo.getState(id))?.cfi).toBe('epubcfi(/6/2!/4/2)');
  });
  it('falls back to filename and permits missing cover, metadata, and font obfuscation', async () => {
    const repo = repository(); const id = await repo.importBook(new File([await fixture({ missingMeta: true, obfuscated: true })], '花园.epub'));
    expect(await repo.get(id)).toMatchObject({ title: '花园', author: '', hasCover: false });
  });
  it.each([{ fixed: true }, { protected: true }])('rejects unsupported content without records: %j', async options => {
    const repo = repository(); await expect(repo.importBook(new File([await fixture(options)], 'book.epub'))).rejects.toThrow();
    expect(await repo.list()).toEqual([]); expect(await repo.db.assets.count()).toBe(0);
  });
  it('rejects invalid and oversized files before leaving partial records', async () => {
    const repo = repository(); await expect(repo.importBook(new File(['not a zip'], 'book.epub'))).rejects.toThrow(/not a readable EPUB/);
    const file = new File([], 'large.epub'); Object.defineProperty(file, 'size', { value: MAX_BYTES + 1 }); const read = vi.spyOn(file, 'arrayBuffer');
    await expect(repo.importBook(file)).rejects.toThrow(/100 MiB/); expect(read).not.toHaveBeenCalled(); expect(await repo.list()).toEqual([]);
  });
  it('rolls back metadata when asset storage fails and succeeds on retry', async () => {
    const repo = repository(); const file = new File([await fixture()], 'book.epub');
    const add = vi.spyOn(repo.db.assets, 'add').mockImplementationOnce(() => { throw new Error('Quota exceeded'); });
    await expect(repo.importBook(file)).rejects.toThrow(/could not be saved/);
    expect(await repo.db.books.count()).toBe(0); expect(await repo.db.states.count()).toBe(0);
    add.mockRestore(); await repo.importBook(file); expect(await repo.list()).toHaveLength(1);
  });
  it('atomically removes all records and does not resurrect state on a late save', async () => {
    const repo = repository(); const id = await repo.importBook(new File([await fixture({ cover: true })], 'book.epub'));
    await repo.saveLocations({ bookId: id, version: 1, locations: '[]' });
    const deletion = vi.spyOn(repo.db.assets, 'delete').mockImplementationOnce(() => { throw new Error('storage failure'); });
    await expect(repo.remove(id)).rejects.toThrow(); expect(await repo.get(id)).toBeDefined(); expect(await repo.getBytes(id)).toBeDefined();
    deletion.mockRestore(); await repo.remove(id);
    await repo.saveState({ bookId: id, cfi: 'late', fraction: .5, updatedAt: 1 });
    expect(await Promise.all([repo.db.books.count(), repo.db.assets.count(), repo.db.covers.count(), repo.db.states.count(), repo.db.locations.count()])).toEqual([0, 0, 0, 0, 0]);
  });
  it('orders by last opened and normalizes invalid settings', async () => {
    const repo = repository(); const first = await repo.importBook(new File([await fixture()], 'first.epub'));
    const second = await repo.importBook(new File([await fixture({ missingMeta: true })], 'second.epub'));
    await repo.markOpened(first); expect((await repo.list())[0].id).toBe(first);
    await repo.markOpened(second); expect((await repo.list())[0].id).toBe(second);
    await repo.saveSettings({ theme: 'dark', fontScale: 120 }); expect(await repo.getSettings()).toEqual({ theme: 'dark', fontScale: 120 });
    expect(normalizeSettings({ fontScale: 111 })).toEqual({ theme: 'light', fontScale: 100 });
  });
});
