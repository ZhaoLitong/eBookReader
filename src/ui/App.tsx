import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { library } from '../repository';
import { defaultSettings, errorMessage, type BookMeta, type BookSummary, type Settings } from '../types';
import { Dialog } from './Dialog';
import { Reader } from './Reader';

function currentId() { return /^#\/read\/([a-f0-9]{64})$/.exec(window.location.hash)?.[1] ?? null; }
function BookCover({ book }: { book: BookSummary }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let alive = true, objectUrl = '';
    if (book.hasCover) void library.getCover(book.id).then(blob => { if (alive && blob) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); } }).catch(() => {});
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [book.id, book.hasCover]);
  return url ? <img className="cover" src={url} alt="" loading="lazy" onError={() => setUrl('')} /> : <div className={`cover cover-placeholder color-${parseInt(book.id.slice(0, 2), 16) % 4}`} aria-hidden="true"><div className="cover-rule" /><span>{book.title}</span><small>{book.author || (/\.txt$/i.test(book.filename) ? 'TXT' : 'EPUB')}</small><div className="cover-emblem">❧</div></div>;
}
export function App() {
  const [id, setId] = useState(currentId);
  const [books, setBooks] = useState<BookSummary[]>([]);
  const [selected, setSelected] = useState<BookMeta | null>(null);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [storageError, setStorageError] = useState(false);
  const [notice, setNotice] = useState('');
  const [settingsError, setSettingsError] = useState('');
  const [importing, setImporting] = useState(false);
  const [removing, setRemoving] = useState<BookSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const settingsWrite = useRef(Promise.resolve());
  const shelf = useCallback(() => { window.location.hash = '/'; }, []);
  const refresh = useCallback(async () => {
    setLoading(true); setStorageError(false);
    try { const [items, preferences] = await Promise.all([library.list(), library.getSettings()]); setBooks(items); setSettings(preferences); }
    catch { setStorageError(true); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { const changed = () => setId(currentId()); window.addEventListener('hashchange', changed); return () => window.removeEventListener('hashchange', changed); }, []);
  useEffect(() => { void refresh(); }, [refresh, id]);
  useEffect(() => {
    if (id) return;
    const saved = () => { void library.list().then(setBooks).catch(() => setStorageError(true)); };
    window.addEventListener('reader:progress-saved', saved);
    return () => window.removeEventListener('reader:progress-saved', saved);
  }, [id]);
  useEffect(() => {
    let alive = true; setSelected(null);
    if (id) void library.get(id).then(book => { if (!alive) return; if (book) setSelected(book); else { setNotice('That book is no longer on your shelf.'); shelf(); } }).catch(() => { if (alive) setStorageError(true); });
    return () => { alive = false; };
  }, [id, shelf]);
  useEffect(() => { document.documentElement.dataset.theme = settings.theme; document.querySelector('meta[name="theme-color"]')?.setAttribute('content', settings.theme === 'dark' ? '#18211e' : '#f5f2eb'); }, [settings]);
  const changeSettings = (next: Settings) => {
    setSettings(next);
    settingsWrite.current = settingsWrite.current.then(() => library.saveSettings(next)).then(() => setSettingsError('')).catch(() => setSettingsError('Reading settings could not be saved. Check your available storage.'));
  };
  const importBook = async (file?: File) => {
    if (!file || importing) return;
    setImporting(true); setNotice('');
    try { const bookId = await library.importBook(file); window.location.hash = '/read/' + bookId; }
    catch (error) { setNotice(errorMessage(error)); }
    finally { setImporting(false); if (picker.current) picker.current.value = ''; }
  };
  const closeRemove = useCallback(() => { if (!deleting) setRemoving(null); }, [deleting]);
  const remove = async () => {
    if (!removing || deleting) return;
    setDeleting(true);
    try { await library.remove(removing.id); setRemoving(null); await refresh(); }
    catch { setNotice('This book could not be removed. Please try again.'); }
    finally { setDeleting(false); }
  };
  if (id && selected && !storageError && !loading) return <Reader key={selected.id} book={selected} settings={settings} onSettings={changeSettings} onExit={shelf} settingsError={settingsError} />;
  return <div className="shelf-screen">
    <header className="shelf-header"><a className="brand" href="#/" aria-label="EPUB Reader home"><span className="brand-mark">▤</span><span>EPUB Reader<span className="brand-caption">A PLACE FOR YOUR PAGES</span></span></a><button className="theme-toggle" aria-label={settings.theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'} onClick={() => changeSettings({ ...settings, theme: settings.theme === 'light' ? 'dark' : 'light' })}>{settings.theme === 'light' ? '☾' : '☀'}</button></header>
    <main className="shelf-main">
      <div className="shelf-intro"><div><p className="eyebrow">YOUR PERSONAL LIBRARY</p><h1>A little room<br />for your next chapter.</h1><p className="intro-copy">Your books, your pace. Pick up right where you left off.</p></div><div className="intro-art" aria-hidden="true"><div className="sun" /><div className="art-book one" /><div className="art-book two" /><div className="art-book three" /><div className="art-shelf" /></div></div>
      <section aria-labelledby="shelf-title"><div className="section-heading"><div><h2 id="shelf-title">On your shelf <span className="book-count">{books.length}</span></h2><p>{books.length ? 'A good story is always within reach.' : 'Good things begin with an open book.'}</p></div><button className="primary" disabled={importing || storageError || loading} onClick={() => picker.current?.click()}>{importing ? 'Importing…' : '+ Import book'}</button></div>
        {/* Android providers may label EPUBs as ZIPs or generic files. Validate their contents after selection. */}
        <input ref={picker} type="file" accept={Capacitor.getPlatform() === 'android' ? '*/*' : '.epub,.txt,application/epub+zip,text/plain'} aria-label="Choose EPUB or TXT file" hidden onChange={event => void importBook(event.target.files?.[0])} />
        {notice && <div className="notice" role="alert"><span>{notice}</span><button aria-label="Dismiss notice" onClick={() => setNotice('')}>×</button></div>}
        {settingsError && <div className="notice error" role="alert"><span>{settingsError}</span><button onClick={() => changeSettings(settings)}>Retry settings save</button></div>}
        {storageError ? <div className="empty-state" role="alert"><h3>Your library couldn’t be opened</h3><p>Make sure this app can store data on your device, then try again.</p><button className="primary" onClick={() => void refresh()}>Retry</button></div> : loading ? <div className="empty-state" role="status"><div className="spinner" /><p>Opening your library…</p></div> : books.length ? <div className="book-grid">{books.map(book => <article className="book-card" key={book.id}>
          <button className="book-open" aria-label={`Read ${book.title}`} onClick={() => { window.location.hash = '/read/' + book.id; }}><BookCover book={book} /><h3 title={book.title}>{book.title}</h3><p title={book.author}>{book.author || 'Unknown author'}</p></button>
          <div className="book-details"><span>{book.progress?.fraction != null ? `${Math.round(book.progress.fraction * 100)}% read` : book.progress?.cfi ? 'Continue reading' : 'Ready to begin'}</span><button className="remove-button" aria-label={`Remove ${book.title}`} onClick={() => setRemoving(book)}>Remove</button></div>
          <div className="progress-track" aria-hidden="true"><div style={{ width: `${(book.progress?.fraction ?? 0) * 100}%` }} /></div>
        </article>)}</div> : <div className="empty-state"><div className="empty-symbol" aria-hidden="true">▤</div><h3>Your next chapter starts here.</h3><p>Import a DRM-free EPUB or a TXT file from your device.<br />We’ll keep your place, so you can just keep reading.</p><button onClick={() => picker.current?.click()} disabled={importing}>Choose your first book <span aria-hidden="true">→</span></button></div>}
      </section>
      <footer className="shelf-footer"><span>LOCAL BOOKS. QUIET MOMENTS.</span><span>Saved on this device · No account needed</span></footer>
    </main>
    {removing && <Dialog title="Remove this book?" onClose={closeRemove}><p><strong>{removing.title}</strong> and its saved reading position will be removed from this device. Your original file will stay where it is.</p><div className="actions"><button onClick={closeRemove} disabled={deleting}>Keep book</button><button className="danger" onClick={() => void remove()} disabled={deleting}>{deleting ? 'Removing…' : 'Remove book'}</button></div></Dialog>}
  </div>;
}
