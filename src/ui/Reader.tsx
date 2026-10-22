import { useCallback, useEffect, useRef, useState } from 'react';
import { EpubEngine } from '../engine';
import { ProgressWriter } from '../progress';
import { library } from '../repository';
import { errorMessage, type BookMeta, type ReaderLocation, type Settings, type TocEntry } from '../types';
import { Dialog } from './Dialog';
import { LanguagePicker, useTranslation } from './Language';

function ContentsList({ entries, onSelect }: { entries: TocEntry[]; onSelect: (href: string) => void }) {
  const t = useTranslation();
  return <ol className="contents-list">{entries.map((entry, index) => <li key={entry.id || `${entry.href}-${index}`}><button onClick={() => onSelect(entry.href)}>{entry.label || t('Untitled chapter')}</button>{entry.children.length > 0 && <ContentsList entries={entry.children} onSelect={onSelect} />}</li>)}</ol>;
}
export function Reader({ book, settings, onSettings, onExit, settingsError }: { book: BookMeta; settings: Settings; onSettings: (settings: Settings) => void; onExit: () => void; settingsError: string }) {
  const t = useTranslation();
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<EpubEngine | null>(null);
  const writer = useRef<ProgressWriter | null>(null);
  const [location, setLocation] = useState<ReaderLocation | null>(null);
  const [contents, setContents] = useState<TocEntry[]>([]);
  const [panel, setPanel] = useState<'contents' | 'settings' | null>(null);
  const [busy, setBusy] = useState(true);
  const [failure, setFailure] = useState('');
  const [notice, setNotice] = useState('');
  const [unsaved, setUnsaved] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const latestSettings = useRef(settings); latestSettings.current = settings;
  const closePanel = useCallback(() => setPanel(null), []);
  const exit = useCallback(async () => { await writer.current?.flush(); onExit(); }, [onExit]);
  useEffect(() => {
    let alive = true;
    setBusy(true); setFailure(''); setLocation(null);
    const progress = new ProgressWriter(library, book.id, failed => { if (alive) setUnsaved(failed); });
    writer.current = progress;
    const reader = new EpubEngine(book.id, library, next => {
      if (!alive) return;
      setLocation(next); progress.update(next);
    }, message => { if (alive) setNotice(message); }, () => { if (alive) setFailure('This page could not be displayed. Retry opening the book.'); });
    engine.current = reader;
    void (async () => {
      try {
        const [bytes, state] = await Promise.all([library.getBytes(book.id), library.getState(book.id)]);
        if (!alive) return;
        if (!bytes) throw new Error('Missing file');
        const toc = await reader.open(host.current!, bytes, state?.cfi ?? null, latestSettings.current);
        if (!alive) return;
        await library.markOpened(book.id);
        if (alive) { setContents(toc); setBusy(false); }
      } catch (error) {
        if (alive) { setFailure(errorMessage(error) === 'Something went wrong. Please try again.' ? 'This book could not be opened. Retry or return to your shelf.' : errorMessage(error)); setBusy(false); }
        reader.destroy();
      }
    })();
    const flush = () => { void progress.flush(); };
    const visibility = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('reader:inactive', flush); window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      alive = false;
      window.removeEventListener('reader:inactive', flush); window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', visibility);
      reader.destroy(); void progress.dispose().then(() => window.dispatchEvent(new Event('reader:progress-saved')));
      if (engine.current === reader) engine.current = null;
    };
  }, [book.id, attempt]);
  useEffect(() => { if (!busy && !failure) void engine.current?.applySettings(settings).catch(() => setFailure('Reading settings could not be applied. Retry opening the book.')); }, [settings, busy, failure]);
  useEffect(() => { engine.current?.setInteractionEnabled(!panel); }, [panel]);
  useEffect(() => {
    // Dialog handles native Back itself while open.
    if (panel) return;
    const back = (event: Event) => { event.preventDefault(); void exit(); };
    window.addEventListener('reader:back', back);
    return () => window.removeEventListener('reader:back', back);
  }, [panel, exit]);
  const navigate = (forward: boolean) => { void (forward ? engine.current?.next() : engine.current?.previous())?.catch(() => setFailure('This page could not be displayed. Retry opening the book.')); };
  return <main className="reader-screen">
    <header className="reader-header">
      <button className="back-button" onClick={() => void exit()} aria-label={t('Back to shelf')}>← <span>{t('Shelf')}</span></button>
      <div className="reader-title"><span className="eyebrow">{t('NOW READING')}</span><h1 title={book.title}>{book.title}</h1></div>
      <div className="reader-tools"><button aria-label={t('Table of contents')} title={t('Table of contents')} onClick={() => setPanel('contents')} disabled={busy || !!failure}>☷</button><button aria-label={t('Reading settings')} title={t('Reading settings')} onClick={() => setPanel('settings')} disabled={busy || !!failure}>Aa</button></div>
    </header>
    {notice && <div className="notice" role="status"><span>{t(notice)}</span><button aria-label={t('Dismiss notice')} onClick={() => setNotice('')}>×</button></div>}
    {settingsError && <div className="notice error" role="alert"><span>{t(settingsError)}</span><button onClick={() => onSettings(settings)}>{t('Retry settings save')}</button></div>}
    {unsaved && <div className="notice error" role="alert"><span>{t('Progress has not been saved. Check available storage.')}</span><button onClick={() => void writer.current?.flush()}>{t('Retry save')}</button></div>}
    <section className="reading-paper" aria-label={t('EPUB reader')}>
      <div ref={host} className="book-viewport" tabIndex={0} aria-label={t('Book pages')} onKeyDown={event => {
        if (panel || busy || failure || !['ArrowLeft', 'ArrowRight'].includes(event.key) || (event.target as HTMLElement).closest('button,input')) return;
        event.preventDefault(); void engine.current?.physicalArrow(event.key === 'ArrowRight').catch(() => setFailure('This page could not be displayed. Retry opening the book.'));
      }} />
      {busy && !failure && <div className="reader-overlay" role="status"><div className="spinner" /><p>{t('Opening your book…')}</p></div>}
      {failure && <div className="reader-overlay" role="alert"><h2>{t('Couldn’t open this page')}</h2><p>{t(failure)}</p><div className="actions"><button className="primary" onClick={() => setAttempt(n => n + 1)}>{t('Retry')}</button><button onClick={() => void exit()}>{t('Return to shelf')}</button></div></div>}
    </section>
    <footer className="reader-footer" onKeyDown={event => { if (!panel && ['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); void engine.current?.physicalArrow(event.key === 'ArrowRight').catch(() => setFailure('This page could not be displayed. Retry opening the book.')); } }}>
      <button onClick={() => navigate(false)} disabled={busy || !!failure || !!location?.atStart} aria-label={t('Previous page')}>← <span>{t('Previous')}</span></button>
      <div className="reading-progress"><span>{location?.fraction != null ? `${Math.round(location.fraction * 100)}%` : '—'}</span><small>{t('estimated progress')}</small></div>
      <button onClick={() => navigate(true)} disabled={busy || !!failure || !!location?.atEnd} aria-label={t('Next page')}><span>{t('Next')}</span> →</button>
    </footer>
    {panel && <Dialog title={t(panel === 'contents' ? 'Contents' : 'Reading settings')} onClose={closePanel}>
      {panel === 'contents' ? (contents.length ? <ContentsList entries={contents} onSelect={href => { setPanel(null); void engine.current?.navigate(href).catch(() => setNotice('This chapter could not be opened.')); }} /> : <p>{t('This book doesn’t include a table of contents. Use Previous and Next to keep reading.')}</p>) : <div className="settings">
        <div className="setting-row"><LanguagePicker settings={settings} onChange={onSettings} /></div>
        <div className="setting-row"><div><h3>{t('Text size')}</h3><p>{t('Make yourself comfortable.')}</p></div><div className="font-controls"><button aria-label={t('Decrease font size')} disabled={settings.fontScale <= 80} onClick={() => onSettings({ ...settings, fontScale: settings.fontScale - 10 })}>A−</button><output aria-label={t('Font size')}>{settings.fontScale}%</output><button aria-label={t('Increase font size')} disabled={settings.fontScale >= 160} onClick={() => onSettings({ ...settings, fontScale: settings.fontScale + 10 })}>A+</button></div></div>
        <div className="setting-row"><div><h3>{t('Appearance')}</h3><p>{t('A little light, or a quiet night.')}</p></div><div className="theme-controls"><button aria-pressed={settings.theme === 'light'} onClick={() => onSettings({ ...settings, theme: 'light' })}>{t('☀ Light')}</button><button aria-pressed={settings.theme === 'dark'} onClick={() => onSettings({ ...settings, theme: 'dark' })}>{t('☾ Dark')}</button></div></div>
      </div>}
    </Dialog>}
  </main>;
}
