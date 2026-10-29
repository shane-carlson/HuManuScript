import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { appVersion } from 'virtual:app-version';
import logoUrl from '../build/icon.png';
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
  addRegistryReceipt,
  assignSeriesToBook,
  bookDisplayTitle,
  ensureBookEpubUuid,
  formatSeriesBookNumber,
  removeRegistryReceipt,
  saveBookEpubChoices,
  seriesMembershipLabel,
  setBookSeriesNumber,
  updateActiveBookDocument,
  type Library,
} from './core/library.ts';
import { formatAppVersion } from './core/appVersion.ts';
import { LAYOUT_PANE_LIMITS } from './core/layoutSession.ts';
import { displayTitle, reconcileLoadedDocument } from './core/document.ts';
import { SyncControl } from './components/SyncControl.tsx';
import {
  createReadywriterAccount,
  signInReadywriterAccount,
  signOutReadywriterAccount,
  syncWithAccount,
} from './core/syncClient.ts';
import {
  clearSyncSession,
  loadSyncClock,
  loadSyncSession,
  readStoredBookTimes,
  saveSyncClock,
  saveSyncSession,
  type SyncSession,
} from './core/syncSession.ts';
import {
  fingerprintLibrary,
  fingerprintVersions,
  observeLocalSnapshot,
  type SyncClock,
} from './core/syncSnapshot.ts';
import type { SyncPhase } from './core/syncStatus.ts';
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
  const [session, setSession] = useState<SyncSession | null>(() => loadSyncSession());
  const [syncPhase, setSyncPhase] = useState<SyncPhase>(() => (loadSyncSession() ? 'signed-in' : 'signed-out'));
  const [syncDetail, setSyncDetail] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const stored = localStorage.getItem(THEME_KEY);
    return stored === 'dark' ? 'dark' : 'light';
  });
  const ids = useRef(createIdFactory('hm'));
  const libraryRef = useRef(library);
  const versionsRef = useRef(versions);
  const sessionRef = useRef(session);
  const clockRef = useRef<SyncClock | null>(loadSyncClock());
  const syncingRef = useRef(false);
  libraryRef.current = library;
  versionsRef.current = versions;
  sessionRef.current = session;

  const rememberSession = useCallback((next: SyncSession | null) => {
    sessionRef.current = next;
    setSession(next);
    if (next) saveSyncSession(next);
    else clearSyncSession();
  }, []);

  const runSync = useCallback(async () => {
    const current = sessionRef.current;
    const lib = libraryRef.current;
    if (!current || !lib || syncingRef.current) return;
    syncingRef.current = true;
    setSyncPhase('syncing');
    setSyncDetail('');
    const now = () => new Date().toISOString();
    try {
      let clock = clockRef.current;
      if (!clock || clock.accountId !== current.accountId) {
        clock = observeLocalSnapshot(null, lib, versionsRef.current, now(), readStoredBookTimes());
        clock = { ...clock, accountId: current.accountId };
      } else {
        clock = observeLocalSnapshot(clock, lib, versionsRef.current, now());
      }
      clockRef.current = clock;
      const startedVersions = versionsRef.current;
      let result = await syncWithAccount({
        token: current.token,
        library: lib,
        versions: startedVersions,
        clock,
        now: now(),
      });
      if (!result.ok) {
        if (sessionRef.current?.token === current.token) {
          if (result.message.startsWith('Sign in again')) {
            rememberSession(null);
            setSyncPhase('signed-out');
          } else {
            setSyncPhase('failure');
          }
          setSyncDetail(result.message);
        }
        return;
      }
      const latestLib = libraryRef.current;
      const latestVersions = versionsRef.current;
      const editedDuringSync = Boolean(
        latestLib &&
          (fingerprintLibrary(latestLib) !== fingerprintLibrary(lib) ||
            fingerprintVersions(latestVersions) !== fingerprintVersions(startedVersions)),
      );
      if (latestLib && editedDuringSync && sessionRef.current?.token === current.token) {
        const followClock = observeLocalSnapshot(
          { ...result.clock, accountId: current.accountId },
          latestLib,
          latestVersions,
          now(),
        );
        result = await syncWithAccount({
          token: current.token,
          library: latestLib,
          versions: latestVersions,
          clock: followClock,
          now: now(),
        });
        if (!result.ok) {
          clockRef.current = { ...followClock, accountId: current.accountId };
          saveSyncClock(clockRef.current);
          if (result.message.startsWith('Sign in again')) {
            rememberSession(null);
            setSyncPhase('signed-out');
          } else {
            setSyncPhase('failure');
          }
          setSyncDetail(result.message);
          return;
        }
      }
      if (sessionRef.current?.token !== current.token) return;
      const nextClock = { ...result.clock, accountId: current.accountId };
      clockRef.current = nextClock;
      saveSyncClock(nextClock);
      const currentLib = libraryRef.current;
      const contentChanged =
        !currentLib ||
        fingerprintLibrary(currentLib) !== fingerprintLibrary(result.library) ||
        fingerprintVersions(versionsRef.current) !== fingerprintVersions(result.versions);
      if (contentChanged) {
        setLibrary(result.library);
        setVersions(result.versions);
      }
      const nextSession = { ...current, lastSyncAt: result.syncedAt };
      rememberSession(nextSession);
      setSyncPhase('success');
      setSyncDetail('');
    } finally {
      syncingRef.current = false;
    }
  }, [rememberSession]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const lib = await initialLibrary(ids.current);
        if (cancelled) return;
        const ledger = loadVersionLedger();
        const seeded = observeLocalSnapshot(loadSyncClock(), lib, ledger, new Date().toISOString(), readStoredBookTimes());
        clockRef.current = seeded;
        saveSyncClock(seeded);
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
    if (phase !== 'ready' || !library) return;
    const timer = window.setTimeout(() => {
      const current = libraryRef.current;
      if (!current) return;
      const observed = observeLocalSnapshot(clockRef.current, current, versionsRef.current, new Date().toISOString());
      clockRef.current = observed;
      saveSyncClock(observed);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [library, versions, phase]);

  const autoSyncStarted = useRef(false);
  useEffect(() => {
    if (phase !== 'ready' || autoSyncStarted.current) return;
    autoSyncStarted.current = true;
    if (sessionRef.current) void runSync();
  }, [phase, runSync]);

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

  const signInAndSync = useCallback(
    async (kind: 'create' | 'sign-in', email: string, password: string, displayName = '') => {
      const result =
        kind === 'create'
          ? await createReadywriterAccount(email, password, displayName)
          : await signInReadywriterAccount(email, password);
      if (!result.ok) return { message: result.message, pending: result.pending === true };
      rememberSession({
        token: result.account.token,
        email: result.account.email,
        accountId: result.account.accountId,
        ...(result.account.displayName ? { displayName: result.account.displayName } : {}),
        lastSyncAt: null,
      });
      setSyncPhase('signed-in');
      await runSync();
      return null;
    },
    [rememberSession, runSync],
  );

  const signOut = useCallback(() => {
    const token = sessionRef.current?.token;
    rememberSession(null);
    setSyncPhase('signed-out');
    setSyncDetail('');
    if (token) void signOutReadywriterAccount(token);
  }, [rememberSession]);

  const focusActive = manuscriptFocus && tab === 'manuscript';

  return (
    <div className={`app${focusActive ? ' is-manuscript-focus' : ''}`}>
      <header className="top app-chrome">
        <div className="brand">
          <span className="mark" aria-hidden="true">
            <img src={logoUrl} alt="" width={40} height={40} />
          </span>
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
        <div className="chrome-actions">
          <SyncControl
            phase={syncPhase}
            email={session?.email ?? null}
            lastSyncAt={session?.lastSyncAt ?? null}
            detail={syncDetail}
            onCreateAccount={(email, password, displayName) => signInAndSync('create', email, password, displayName)}
            onSignIn={(email, password) => signInAndSync('sign-in', email, password)}
            onSyncNow={() => void runSync()}
            onSignOut={signOut}
          />
          <button type="button" className="ghost" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
            {theme === 'light' ? 'Dark paper' : 'Light paper'}
          </button>
        </div>
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
                  registryReceipts={activeBook?.registryReceipts ?? []}
                  onSaveRegistryReceipt={(receipt) => {
                    const lib = libraryRef.current;
                    const bookId = activeBook?.id ?? lib?.activeBookId;
                    if (!lib || !bookId) return;
                    setLibrary(addRegistryReceipt(lib, bookId, receipt));
                  }}
                  onRemoveRegistryReceipt={(code) => {
                    const lib = libraryRef.current;
                    const bookId = activeBook?.id ?? lib?.activeBookId;
                    if (!lib || !bookId) return;
                    setLibrary(removeRegistryReceipt(lib, bookId, code));
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
