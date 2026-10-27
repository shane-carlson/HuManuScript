import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { appVersion } from 'virtual:app-version';
import { AppVersionLabel } from './components/AppVersionLabel.tsx';
import { UpdateAvailableNotice } from './components/UpdateAvailableNotice.tsx';
import { Editor } from './components/Editor.tsx';
import { PaneGrab } from './components/PaneGrab.tsx';
import { SessionCaptureProvider } from './components/SessionCapture.tsx';
import { ExportPane } from './components/ExportPane.tsx';
import { VersionHistoryPane } from './components/VersionHistoryPane.tsx';
import { LicenseGate } from './components/LicenseGate.tsx';
import { WorkspaceSidebar } from './components/WorkspaceSidebar.tsx';
import { epubChoicesFromBook } from './core/epubSettings.ts';
import {
  assignSeriesToBook,
  bookDisplayTitle,
  ensureBookEpubUuid,
  formatSeriesBookNumber,
  saveBookEpubChoices,
  seriesMembershipLabel,
  setBookSeriesNumber,
  updateActiveBookDocument,
  type Library,
} from './core/library.ts';
import { formatAppVersion } from './core/appVersion.ts';
import { LAYOUT_PANE_LIMITS } from './core/layoutSession.ts';
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
import { useLicense } from './hooks/useLicense.ts';
import {
  clearLibrary,
  freshDocument,
  loadLibrary,
  loadManuscriptFocus,
  loadSidebarCollapsed,
  loadSidebarWidth,
  loadWorkspaceTab,
  saveLibrary,
  saveManuscriptFocus,
  saveSidebarCollapsed,
  saveSidebarWidth,
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
  const license = useLicense();
  const mayWriteRef = useRef(license.mayWrite);
  useEffect(() => {
    mayWriteRef.current = license.mayWrite;
  }, [license.mayWrite]);
  const [phase, setPhase] = useState<Phase>('loading');
  const [library, setLibrary] = useState<Library | null>(null);
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [tab, setTab] = useState<WorkspaceTab>(() => loadWorkspaceTab());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => loadSidebarCollapsed());
  const [sidebarWidth, setSidebarWidth] = useState(() => loadSidebarWidth());
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
    document.title = `HuManuScript ${formatAppVersion(appVersion)}`;
  }, []);

  useEffect(() => {
    saveWorkspaceTab(tab);
  }, [tab]);

  useEffect(() => {
    saveSidebarCollapsed(sidebarCollapsed);
  }, [sidebarCollapsed]);

  useEffect(() => {
    saveSidebarWidth(sidebarWidth);
  }, [sidebarWidth]);

  useEffect(() => {
    saveManuscriptFocus(manuscriptFocus);
  }, [manuscriptFocus]);

  useEffect(() => {
    if (tab !== 'manuscript' && manuscriptFocus) setManuscriptFocus(false);
  }, [tab, manuscriptFocus]);

  useEffect(() => {
    if (phase !== 'ready' || !library) return;
    const timer = window.setTimeout(() => {
      try {
        saveLibrary(library);
        setSaveError('');
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : 'The book could not be saved in this browser.');
      }
    }, 200);
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
    if (!mayWriteRef.current || !next || !libraryRef.current) return;
    setLibrary(updateActiveBookDocument(libraryRef.current, next));
  }, []);

  const handleSaveVersion = useCallback(
    (label: string) => {
      if (!mayWriteRef.current) return;
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
    if (!mayWriteRef.current) return;
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
            <p className="tag">Proof of humanity in Prose.</p>
            <AppVersionLabel />
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
                disabled={!license.mayWrite}
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
                disabled={!license.mayWrite}
                onChange={(e) => setSeriesState((current) => ({ ...current, draft: e.target.value }))}
                onBlur={() => {
                  if (!mayWriteRef.current) return;
                  handleLibraryChange(assignSeriesToBook(library, activeBook.id, seriesDraft, ids.current));
                }}
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
                  disabled={!license.mayWrite}
                  onChange={(e) => setSeriesState((current) => ({ ...current, number: e.target.value }))}
                  onBlur={() => {
                    if (!mayWriteRef.current) return;
                    handleLibraryChange(setBookSeriesNumber(library, activeBook.id, numberDraft));
                  }}
                />
              </label>
            ) : null}
          </div>
        )}
        <button type="button" className="ghost" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
          {theme === 'light' ? 'Dark paper' : 'Light paper'}
        </button>
      </header>
      <UpdateAvailableNotice />
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
        <SessionCaptureProvider bookId={library.activeBookId} manuscriptId={doc.manuscriptId}>
        <div
          className={`workspace-layout${sidebarCollapsed ? ' is-sidebar-collapsed' : ''}`}
          style={{ '--pane-sidebar': `${sidebarWidth}px` } as CSSProperties}
        >
          <WorkspaceSidebar
            library={library}
            tab={tab}
            collapsed={sidebarCollapsed}
            onToggleCollapsed={() => setSidebarCollapsed((c) => !c)}
            onTabChange={setTab}
            onLibraryChange={(next) => void handleLibraryChange(next)}
            newId={ids.current}
            license={license}
          />
          {!sidebarCollapsed && !focusActive && (
            <PaneGrab
              label="Resize library pane"
              className="pane-grab--sidebar"
              value={sidebarWidth}
              min={LAYOUT_PANE_LIMITS.sidebarWidth.min}
              max={LAYOUT_PANE_LIMITS.sidebarWidth.max}
              direction={1}
              onChange={setSidebarWidth}
              onCommit={saveSidebarWidth}
            />
          )}
          <div className="workspace-main">
            {tab === 'export' ? (
              <div className="workspace-panel">
                <ExportPane
                  doc={doc}
                  bookId={activeBook?.id ?? library.activeBookId}
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
                  epubChoices={epubChoicesFromBook(activeBook ?? {})}
                  onEnsureEpubUuid={() => {
                    const lib = libraryRef.current;
                    const bookId = activeBook?.id ?? lib?.activeBookId;
                    if (!lib || !bookId) return '';
                    const next = ensureBookEpubUuid(lib, bookId);
                    if (next.library !== lib) setLibrary(next.library);
                    return next.uuid;
                  }}
                  onSaveEpubChoices={(patch) => {
                    const lib = libraryRef.current;
                    const bookId = activeBook?.id ?? lib?.activeBookId;
                    if (!lib || !bookId) return;
                    setLibrary(saveBookEpubChoices(lib, bookId, patch));
                  }}
                />
              </div>
            ) : tab === 'history' ? (
              <div className="workspace-panel">
                <VersionHistoryPane
                  bookTitle={activeBook ? bookDisplayTitle(activeBook) : displayTitle(doc)}
                  versions={activeBook ? listBookVersions(versions, activeBook.id) : []}
                  onSaveVersion={handleSaveVersion}
                  onRestoreVersion={(id) => void handleRestoreVersion(id)}
                  library={library}
                  ledger={versions}
                  onImportBackup={(lib, v) => void handleImportBackup(lib, v)}
                />
              </div>
            ) : (
              <>
                {!license.mayWrite && <LicenseGate license={license} />}
                <div className={license.mayWrite ? 'editor-shell' : 'editor-shell writing-locked'} inert={license.mayWrite ? undefined : true}>
                <p className="sr-only">Editing {displayTitle(doc)}</p>
                <Editor
                  key={library.activeBookId}
                  doc={doc}
                  bookId={library.activeBookId}
                  saveError={saveError}
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
                </div>
              </>
            )}
          </div>
        </div>
        </SessionCaptureProvider>
      )}
    </div>
  );
}
