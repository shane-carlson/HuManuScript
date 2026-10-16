import { useCallback, useEffect, useRef, useState } from 'react';
import { Editor } from './components/Editor.tsx';
import { ExportPane } from './components/ExportPane.tsx';
import { ManuscriptStatsBar } from './components/ManuscriptStatsBar.tsx';
import { WorkspaceSidebar } from './components/WorkspaceSidebar.tsx';
import {
  assignSeriesToBook,
  formatSeriesBookNumber,
  seriesMembershipLabel,
  setBookSeriesNumber,
  updateActiveBookDocument,
  type Library,
} from './core/library.ts';
import { displayTitle, reconcileLoadedDocument } from './core/document.ts';
import {
  listBookVersions,
  loadVersionLedger,
  maybeAutoVersion,
  pushVersion,
  restoreBookVersion,
  saveVersionLedger,
  type VersionLedger,
} from './core/versions.ts';
import { createIdFactory } from './core/uid.ts';
import {
  clearLibrary,
  freshDocument,
  loadLibrary,
  loadManuscriptFocus,
  loadSidebarCollapsed,
  loadWorkspaceTab,
  saveLibrary,
  saveManuscriptFocus,
  saveSidebarCollapsed,
  saveWorkspaceTab,
  THEME_KEY,
  type WorkspaceTab,
} from './storage.ts';

type Phase = 'loading' | 'ready' | 'error';

async function initialLibrary(ids: () => string): Promise<Library> {
  const loaded = loadLibrary();
  if (!loaded.ok) throw new Error(loaded.error);
  if (loaded.library) {
    const lib = loaded.library;
    const active = lib.books.find((b) => b.id === lib.activeBookId) ?? lib.books[0]!;
    const reconciled = await reconcileLoadedDocument(active.document, new Date().toISOString(), ids);
    return {
      ...lib,
      books: lib.books.map((b) => (b.id === active.id ? { ...b, document: reconciled } : b)),
    };
  }
  const bookId = ids();
  const document = freshDocument(bookId);
  return {
    version: 2,
    activeBookId: bookId,
    series: [],
    books: [{ id: bookId, title: 'Untitled book', document }],
  };
}

export default function App() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [library, setLibrary] = useState<Library | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<WorkspaceTab>(() => loadWorkspaceTab());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => loadSidebarCollapsed());
  const [manuscriptFocus, setManuscriptFocus] = useState(() => loadManuscriptFocus());
  const [versions, setVersions] = useState<VersionLedger>(() => loadVersionLedger());
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const stored = localStorage.getItem(THEME_KEY);
    return stored === 'dark' ? 'dark' : 'light';
  });
  const ids = useRef(createIdFactory('hm'));
  const libraryRef = useRef(library);
  const versionsRef = useRef(versions);
  libraryRef.current = library;
  versionsRef.current = versions;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const lib = await initialLibrary(ids.current);
        if (cancelled) return;
        setLibrary(lib);
        setPhase('ready');
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Could not open library.');
        setPhase('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.mode = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    saveWorkspaceTab(tab);
  }, [tab]);

  useEffect(() => {
    saveSidebarCollapsed(sidebarCollapsed);
  }, [sidebarCollapsed]);

  useEffect(() => {
    saveManuscriptFocus(manuscriptFocus);
  }, [manuscriptFocus]);

  useEffect(() => {
    if (tab !== 'manuscript' && manuscriptFocus) setManuscriptFocus(false);
  }, [tab, manuscriptFocus]);

  useEffect(() => {
    if (phase !== 'ready' || !library) return;
    const timer = window.setTimeout(() => saveLibrary(library), 200);
    return () => window.clearTimeout(timer);
  }, [library, phase]);

  useEffect(() => {
    saveVersionLedger(versions);
  }, [versions]);

  useEffect(() => {
    if (phase !== 'ready' || !library?.activeBookId) return;
    const book = library.books.find((b) => b.id === library.activeBookId);
    if (!book) return;
    const timer = window.setTimeout(() => {
      setVersions((ledger) => maybeAutoVersion(ledger, book.id, book.document, ids.current));
    }, 10_000);
    return () => window.clearTimeout(timer);
  }, [library, phase]);

  const activeBook = library?.books.find((b) => b.id === library.activeBookId) ?? null;
  const doc = activeBook?.document ?? null;
  const seriesName = activeBook?.seriesId
    ? library?.series.find((series) => series.id === activeBook.seriesId)?.name ?? ''
    : '';
  const seriesKey = `${activeBook?.id ?? ''}|${seriesName}|${activeBook?.seriesBookNumber ?? ''}`;
  const [seriesState, setSeriesState] = useState(() => ({
    key: seriesKey,
    draft: seriesName,
    number: activeBook?.seriesBookNumber != null ? formatSeriesBookNumber(activeBook.seriesBookNumber) : '',
  }));
  if (seriesState.key !== seriesKey) {
    setSeriesState({
      key: seriesKey,
      draft: seriesName,
      number: activeBook?.seriesBookNumber != null ? formatSeriesBookNumber(activeBook.seriesBookNumber) : '',
    });
  }
  const seriesDraft = seriesState.draft;
  const numberDraft = seriesState.number;

  const setDoc = useCallback((next: typeof doc) => {
    if (!next || !libraryRef.current) return;
    setLibrary(updateActiveBookDocument(libraryRef.current, next));
  }, []);

  const handleSaveVersion = useCallback(
    (label: string) => {
      const lib = libraryRef.current;
      const book = lib?.books.find((b) => b.id === lib.activeBookId);
      if (!book) return;
      setVersions((ledger) =>
        pushVersion(ledger, {
          bookId: book.id,
          document: book.document,
          label,
          kind: 'manual',
          id: ids.current(),
        }),
      );
    },
    [],
  );

  const handleRestoreVersion = useCallback(async (versionId: string) => {
    const lib = libraryRef.current;
    const book = lib?.books.find((b) => b.id === lib?.activeBookId);
    if (!book || !lib) return;
    const result = restoreBookVersion(versionsRef.current, book.id, versionId, book.document, ids.current);
    if (!result) return;
    setVersions(result.ledger);
    const reconciled = await reconcileLoadedDocument(result.document, new Date().toISOString(), ids.current);
    setLibrary(updateActiveBookDocument(lib, reconciled));
  }, []);

  const handleImportBackup = useCallback(async (nextLibrary: Library, nextVersions: VersionLedger) => {
    const reconciledBooks = await Promise.all(
      nextLibrary.books.map(async (b) => ({
        ...b,
        document: await reconcileLoadedDocument(b.document, new Date().toISOString(), ids.current),
      })),
    );
    setVersions(nextVersions);
    setLibrary({ ...nextLibrary, books: reconciledBooks });
  }, []);

  const handleLibraryChange = useCallback(async (next: Library) => {
    const prev = libraryRef.current;
    if (prev && next.activeBookId !== prev.activeBookId) {
      const book = next.books.find((b) => b.id === next.activeBookId);
      if (book) {
        const reconciled = await reconcileLoadedDocument(book.document, new Date().toISOString(), ids.current);
        next = {
          ...next,
          books: next.books.map((b) => (b.id === next.activeBookId ? { ...b, document: reconciled } : b)),
        };
      }
    }
    setLibrary(next);
  }, []);

  const focusActive = manuscriptFocus && tab === 'manuscript';

  return (
    <div className={`app${focusActive ? ' is-manuscript-focus' : ''}`}>
      <header className="top app-chrome">
        <div className="brand">
          <span className="mark" aria-hidden="true">H</span>
          <div>
            <p className="wordmark">HuManuScript</p>
            <p className="tag">Helping authors document the humanity of their prose.</p>
          </div>
        </div>
        {phase === 'ready' && doc && library && activeBook && (
          <div className="book-identity">
            <label className="title-field">
              <span>Title</span>
              <input
                value={doc.title}
                placeholder="Untitled manuscript"
                aria-label="Book title"
                onChange={(e) => setDoc({ ...doc, title: e.target.value })}
              />
            </label>
            <label className="title-field title-field--series">
              <span>Series</span>
              <input
                list="humanuscript-series"
                value={seriesDraft}
                aria-label="Series"
                placeholder="Standalone"
                onChange={(e) => setSeriesState((current) => ({ ...current, draft: e.target.value }))}
                onBlur={() => handleLibraryChange(assignSeriesToBook(library, activeBook.id, seriesDraft, ids.current))}
              />
              <datalist id="humanuscript-series">
                {library.series.map((series) => (
                  <option key={series.id} value={series.name} />
                ))}
              </datalist>
            </label>
            {activeBook.seriesId ? (
              <label className="title-field title-field--number">
                <span>Number</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={numberDraft}
                  aria-label="Book number in series"
                  placeholder="1"
                  onChange={(e) => setSeriesState((current) => ({ ...current, number: e.target.value }))}
                  onBlur={() => handleLibraryChange(setBookSeriesNumber(library, activeBook.id, numberDraft))}
                />
              </label>
            ) : null}
          </div>
        )}
        <button type="button" className="ghost" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
          {theme === 'light' ? 'Dark paper' : 'Light paper'}
        </button>
      </header>
      <p className="purpose-banner app-chrome">HuManuScript tracks and certifies how a manuscript is written — typed versus pasted — as evidence of human-written content. It does not guarantee the work is human-generated. It shows how much was typed in and how much was pasted in.</p>
      {phase === 'loading' && (
        <section className="status" aria-live="polite">
          <h1>Opening the library…</h1>
          <p>Reading books saved in this browser.</p>
        </section>
      )}
      {phase === 'error' && (
        <section className="status error" role="alert">
          <h1>This saved library could not be opened.</h1>
          <p>{error}</p>
          <div className="status-actions">
            <button
              type="button"
              className="primary"
              onClick={() => {
                clearLibrary();
                void initialLibrary(ids.current).then((lib) => {
                  setLibrary(lib);
                  setPhase('ready');
                });
              }}
            >
              Start a fresh library
            </button>
          </div>
        </section>
      )}
      {phase === 'ready' && library && doc && (
        <div className={`workspace-layout${sidebarCollapsed ? ' is-sidebar-collapsed' : ''}`}>
          <WorkspaceSidebar
            library={library}
            tab={tab}
            collapsed={sidebarCollapsed}
            onToggleCollapsed={() => setSidebarCollapsed((c) => !c)}
            onTabChange={setTab}
            onLibraryChange={(next) => void handleLibraryChange(next)}
            newId={ids.current}
            bookVersions={activeBook ? listBookVersions(versions, activeBook.id) : []}
            onSaveVersion={handleSaveVersion}
            onRestoreVersion={(id) => void handleRestoreVersion(id)}
            versions={versions}
            onImportBackup={(lib, v) => void handleImportBackup(lib, v)}
          />
          <div className="workspace-main">
            {tab === 'export' ? (
              <div className="workspace-panel">
                <ExportPane
                  doc={doc}
                  bookTitle={activeBook?.title}
                  seriesLabel={
                    activeBook
                      ? seriesMembershipLabel(
                          activeBook,
                          activeBook.seriesId
                            ? library.series.find((series) => series.id === activeBook.seriesId)?.name
                            : undefined,
                        )
                      : null
                  }
                />
              </div>
            ) : (
              <>
                <p className="sr-only">Editing {displayTitle(doc)}</p>
                <ManuscriptStatsBar doc={doc} compact={focusActive} />
                <Editor
                  key={library.activeBookId}
                  doc={doc}
                  onChange={setDoc}
                  focusMode={focusActive}
                  onFocusModeChange={setManuscriptFocus}
                  bookTitle={activeBook?.title}
                  seriesLabel={
                    activeBook
                      ? seriesMembershipLabel(
                          activeBook,
                          activeBook.seriesId
                            ? library.series.find((series) => series.id === activeBook.seriesId)?.name
                            : undefined,
                        )
                      : null
                  }
                />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
