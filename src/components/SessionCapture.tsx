/**
 * Writing-session pictures. The setting and the timer live above the manuscript
 * and export tabs so a session keeps its five-minute cadence while you export.
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { publishCaptureGrant } from '../captureGrant.ts';
import { createSessionMedia, type SessionMedia } from '../captureStill.ts';
import {
  buildSessionCaptureSchema,
  captureSessionComposite,
  nextCaptureAt,
  nextIntervalDue,
  sessionCaptureConfigured,
  type CapturePermissionDuration,
  type SealSource,
  type SessionCaptureSchema,
  type SessionCaptureSettings,
  type WritingSessionState,
} from '../core/sessionCapture.ts';
import { certificationExport, type ManuscriptDocument } from '../core/document.ts';
import { renderSessionCapturePdf, sessionCaptureFilename } from '../core/sessionCaptureExport.ts';
import { createIdFactory } from '../core/uid.ts';
import {
  blobToDataUrl,
  listStoredSessions,
  listStoredThumbnails,
  loadSessionCaptureSettings,
  loadWritingSession,
  saveSessionCaptureSettings,
  saveStoredSession,
  saveStoredThumbnail,
  saveWritingSession,
  type StoredThumbnailRecord,
} from '../sessionCaptureStore.ts';

interface PreviewThumb {
  id: string;
  url: string;
  kind: StoredThumbnailRecord['kind'];
  at: string;
}

interface SessionCaptureApi {
  settings: SessionCaptureSettings;
  setCamera: (on: boolean) => void;
  setScreenshot: (on: boolean) => void;
  setPermission: (permission: CapturePermissionDuration) => void;
  session: WritingSessionState | null;
  busy: boolean;
  notice: { tone: 'ok' | 'error'; text: string } | null;
  thumbnailCount: number;
  previews: PreviewThumb[];
  /** True when the open session belongs to the book on screen. */
  ownsSession: boolean;
  startSession: () => void;
  endSession: () => void;
  certificationRecord: (doc: ManuscriptDocument) => Promise<ReturnType<typeof certificationExport>>;
  capturePdf: (doc: ManuscriptDocument, title: string) => Promise<{ filename: string; blob: Blob }>;
}

const SessionCaptureContext = createContext<SessionCaptureApi | null>(null);

export function useSessionCapture(): SessionCaptureApi {
  const value = useContext(SessionCaptureContext);
  if (!value) throw new Error('Session capture is only available inside the workspace.');
  return value;
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function SessionCaptureProvider({
  bookId,
  manuscriptId,
  children,
}: {
  bookId: string;
  manuscriptId: string;
  children: ReactNode;
}) {
  const [settings, setSettings] = useState<SessionCaptureSettings>(() => loadSessionCaptureSettings());
  const [session, setSession] = useState<WritingSessionState | null>(() => loadWritingSession());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [thumbnailCount, setThumbnailCount] = useState(0);
  const [previews, setPreviews] = useState<PreviewThumb[]>([]);
  const settingsRef = useRef(settings);
  const sessionRef = useRef(session);
  const bookRef = useRef(bookId);
  const manuscriptRef = useRef(manuscriptId);
  const chain = useRef(Promise.resolve());
  const sessionIds = useRef(createIdFactory('ses'));
  const captureIds = useRef(createIdFactory('cap'));
  const mediaRef = useRef<SessionMedia | null>(null);

  useEffect(() => {
    settingsRef.current = settings;
    sessionRef.current = session;
    bookRef.current = bookId;
    manuscriptRef.current = manuscriptId;
  });

  useEffect(() => {
    void publishCaptureGrant(settings);
  }, [settings]);

  const refreshThumbnails = useCallback(async () => {
    try {
      const rows = await listStoredThumbnails(manuscriptRef.current);
      setThumbnailCount(rows.length);
    } catch {
      setThumbnailCount(0);
    }
  }, []);

  useEffect(() => {
    void refreshThumbnails();
  }, [manuscriptId, refreshThumbnails]);

  useEffect(() => {
    let cancelled = false;
    const created: string[] = [];
    void listStoredThumbnails(manuscriptId)
      .then((rows) => {
        if (cancelled) return;
        const recent = [...rows].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);
        setPreviews(
          recent.map((row) => {
            const url = URL.createObjectURL(row.blob);
            created.push(url);
            return { id: row.id, url, kind: row.kind, at: row.at };
          }),
        );
      })
      .catch(() => {
        if (!cancelled) setPreviews([]);
      });
    return () => {
      cancelled = true;
      for (const url of created) URL.revokeObjectURL(url);
      setPreviews([]);
    };
  }, [manuscriptId, thumbnailCount]);

  const persistSession = useCallback(async (next: WritingSessionState | null) => {
    sessionRef.current = next;
    setSession(next);
    saveWritingSession(next);
    if (next) await saveStoredSession(next);
  }, []);

  const takeCapture = useCallback(
    async (live: WritingSessionState, reason: 'start' | 'interval' | 'end') => {
      if (!sessionCaptureConfigured(settingsRef.current)) return;
      if (live.bookId !== bookRef.current) return;
      setBusy(true);
      const windowStart = live.lastWindowEnd;
      try {
        if (!mediaRef.current) mediaRef.current = createSessionMedia(() => settingsRef.current);
        const grabbed = await captureSessionComposite(() => settingsRef.current, () => mediaRef.current!.composite());
        const windowEnd = new Date().toISOString();
        const stored = Boolean(grabbed.image);
        if (grabbed.image) {
          await saveStoredThumbnail({
            id: captureIds.current(),
            sessionId: live.id,
            bookId: live.bookId,
            manuscriptId: live.manuscriptId,
            at: windowEnd,
            reason,
            kind: 'composite',
            windowStart,
            windowEnd,
            mime: 'image/jpeg',
            width: grabbed.image.width,
            height: grabbed.image.height,
            blob: grabbed.image.blob,
          });
        }
        const updated: WritingSessionState = {
          ...live,
          lastAttemptAt: windowEnd,
          lastWindowEnd: stored ? windowEnd : live.lastWindowEnd,
        };
        await persistSession(updated);
        if (stored) {
          setNotice({ tone: 'ok', text: 'Stored one session picture.' });
        } else if (!sessionCaptureConfigured(settingsRef.current)) {
          setNotice({ tone: 'ok', text: 'Pictures are off, so nothing was captured.' });
        } else {
          setNotice({
            tone: 'error',
            text: grabbed.failure ?? 'No picture was stored. Allow the camera or screen for the span you chose, or leave the setting off.',
          });
        }
        await refreshThumbnails();
      } catch (error) {
        const windowEnd = new Date().toISOString();
        await persistSession({ ...live, lastAttemptAt: windowEnd }).catch(() => undefined);
        setNotice({
          tone: 'error',
          text: error instanceof Error ? error.message : 'The session picture could not be saved in this browser.',
        });
      } finally {
        setBusy(false);
      }
    },
    [persistSession, refreshThumbnails],
  );

  const enqueue = useCallback((task: () => Promise<void>) => {
    chain.current = chain.current.then(task, task);
    return chain.current;
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const live = sessionRef.current;
      if (!live || live.endedAt) return;
      if (live.bookId !== bookRef.current) return;
      if (!sessionCaptureConfigured(settingsRef.current)) return;
      if (!nextIntervalDue(live, Date.now())) return;
      void enqueue(async () => {
        const current = sessionRef.current;
        if (!current || current.id !== live.id || current.endedAt) return;
        if (current.bookId !== bookRef.current) return;
        if (!sessionCaptureConfigured(settingsRef.current)) return;
        if (!nextIntervalDue(current, Date.now())) return;
        await takeCapture(current, 'interval');
      });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [enqueue, takeCapture]);

  useEffect(() => () => mediaRef.current?.release(), []);

  const applySettings = (next: SessionCaptureSettings) => {
    settingsRef.current = next;
    setSettings(next);
    saveSessionCaptureSettings(next);
    mediaRef.current?.sync();
    void publishCaptureGrant(next);
  };

  const setCamera = (camera: boolean) => {
    applySettings({ ...settingsRef.current, camera });
  };

  const setScreenshot = (screenshot: boolean) => {
    applySettings({ ...settingsRef.current, screenshot });
  };

  const setPermission = (permission: CapturePermissionDuration) => {
    applySettings({ ...settingsRef.current, permission });
  };

  const startSession = () => {
    if (sessionRef.current && !sessionRef.current.endedAt) return;
    void enqueue(async () => {
      if (sessionRef.current && !sessionRef.current.endedAt) return;
      const startedAt = new Date().toISOString();
      const next: WritingSessionState = {
        id: sessionIds.current(),
        bookId: bookRef.current,
        manuscriptId: manuscriptRef.current,
        startedAt,
        lastAttemptAt: startedAt,
        lastWindowEnd: startedAt,
        endedAt: null,
      };
      try {
        await persistSession(next);
      } catch (error) {
        sessionRef.current = null;
        setSession(null);
        saveWritingSession(null);
        setNotice({
          tone: 'error',
          text: error instanceof Error ? error.message : 'The writing session could not be saved in this browser.',
        });
        return;
      }
      if (!sessionCaptureConfigured(settingsRef.current)) {
        setNotice({ tone: 'ok', text: 'Writing session started. Pictures are off, so nothing is captured.' });
        return;
      }
      const span = settingsRef.current.permission === 'permanent' ? 'remembered on this device' : 'this writing session';
      setNotice({
        tone: 'ok',
        text: `Writing session started. Allow the camera and screen once for ${span}. Later pictures in that span reuse the allow.`,
      });
      await takeCapture(next, 'start');
    });
  };

  const endSession = () => {
    const current = sessionRef.current;
    if (!current || current.bookId !== bookRef.current) return;
    void enqueue(async () => {
      const live = sessionRef.current;
      if (!live || live.id !== current.id) return;
      if (sessionCaptureConfigured(settingsRef.current)) await takeCapture(live, 'end');
      const finished: WritingSessionState = {
        ...(sessionRef.current ?? live),
        endedAt: new Date().toISOString(),
      };
      try {
        await saveStoredSession(finished);
      } catch (error) {
        setNotice({
          tone: 'error',
          text: error instanceof Error ? error.message : 'The session could not be closed in this browser.',
        });
        return;
      }
      sessionRef.current = null;
      setSession(null);
      saveWritingSession(null);
      mediaRef.current?.release();
      if (settingsRef.current.permission === 'session') await publishCaptureGrant(settingsRef.current);
      setNotice((current) =>
        current?.tone === 'error'
          ? { tone: 'error', text: `${current.text} The writing session has ended.` }
          : { tone: 'ok', text: 'Writing session ended.' },
      );
    });
  };

  const schemaFor = useCallback(async (doc: ManuscriptDocument): Promise<SessionCaptureSchema | null> => {
    if (!sessionCaptureConfigured(settingsRef.current)) return null;
    const [sessions, thumbs] = await Promise.all([
      listStoredSessions(doc.manuscriptId),
      listStoredThumbnails(doc.manuscriptId),
    ]);
    const thumbnails = await Promise.all(
      thumbs.map(async (thumb) => ({
        id: thumb.id,
        sessionId: thumb.sessionId,
        at: thumb.at,
        reason: thumb.reason,
        kind: thumb.kind,
        windowStart: thumb.windowStart,
        windowEnd: thumb.windowEnd,
        mime: 'image/jpeg' as const,
        width: thumb.width,
        height: thumb.height,
        dataUrl: await blobToDataUrl(thumb.blob),
      })),
    );
    const points: SealSource[] = doc.points.map((point) => ({
      id: point.id,
      blockId: point.blockId,
      contentHash: point.contentHash,
      origin: point.origin,
      sealedAt: point.sealedAt,
      updatedAt: point.updatedAt,
    }));
    return buildSessionCaptureSchema({
      settings: settingsRef.current,
      manuscriptId: doc.manuscriptId,
      sessions,
      thumbnails,
      points,
    });
  }, []);

  const certificationRecord = useCallback(
    async (doc: ManuscriptDocument) => {
      const schema = await schemaFor(doc);
      return certificationExport(doc, new Date().toISOString(), schema);
    },
    [schemaFor],
  );

  const capturePdf = useCallback(
    async (doc: ManuscriptDocument, title: string) => {
      if (!sessionCaptureConfigured(settingsRef.current)) {
        throw new Error('Turn on camera pictures or screenshots before downloading the session capture.');
      }
      const schema = await schemaFor(doc);
      if (!schema) throw new Error('Session pictures are off.');
      const bytes = renderSessionCapturePdf({ title, manuscriptId: doc.manuscriptId, schema });
      const buffer = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(buffer).set(bytes);
      return {
        filename: sessionCaptureFilename(title),
        blob: new Blob([buffer], { type: 'application/pdf' }),
      };
    },
    [schemaFor],
  );

  const api: SessionCaptureApi = {
    settings,
    setCamera,
    setScreenshot,
    setPermission,
    session,
    busy,
    notice,
    thumbnailCount,
    previews,
    ownsSession: Boolean(session && session.bookId === bookId),
    startSession,
    endSession,
    certificationRecord,
    capturePdf,
  };

  return <SessionCaptureContext.Provider value={api}>{children}</SessionCaptureContext.Provider>;
}

/** Camera, screen, and how long the allow lasts. Off until the writer turns a device on. */
export function SessionCaptureControls() {
  const api = useSessionCapture();
  return (
    <div className="session-capture-controls" aria-label="Session pictures">
      <span className="session-capture-controls__label">Pictures</span>
      <label className="session-capture-controls__check">
        <input
          type="checkbox"
          checked={api.settings.camera}
          onChange={(event) => api.setCamera(event.target.checked)}
        />
        <span>Camera</span>
      </label>
      <label className="session-capture-controls__check">
        <input
          type="checkbox"
          checked={api.settings.screenshot}
          onChange={(event) => api.setScreenshot(event.target.checked)}
        />
        <span>Screen</span>
      </label>
      <fieldset className="session-capture-controls__permission">
        <legend className="sr-only">How long camera and screen permission lasts</legend>
        <label>
          <input
            type="radio"
            name="session-capture-permission"
            checked={api.settings.permission === 'session'}
            onChange={() => api.setPermission('session')}
          />
          <span>This session</span>
        </label>
        <label>
          <input
            type="radio"
            name="session-capture-permission"
            checked={api.settings.permission === 'permanent'}
            onChange={() => api.setPermission('permanent')}
          />
          <span>Remember</span>
        </label>
      </fieldset>
    </div>
  );
}

export function SessionCapturePanel() {
  const api = useSessionCapture();
  const mine = api.ownsSession ? api.session : null;
  const nextAt = mine ? nextCaptureAt(mine) : null;

  return (
    <section className="session-capture" aria-label="Session pictures">
      <h3>Session pictures</h3>
      <p className="session-capture__lead">
        Camera, screen, and permission are in the session bar with the word goal and timer. They stay off until you
        turn them on. A writing session then stores one picture at the start, every five minutes, and at the end.
      </p>
      {api.session && !api.ownsSession && (
        <p className="session-capture__status">
          A writing session is still open on another book. Switch back to that book to end it and take the closing picture.
        </p>
      )}
      <div className="session-capture__actions">
        {mine ? (
          <button type="button" onClick={api.endSession} disabled={api.busy}>
            {api.busy ? 'Capturing…' : 'End writing session'}
          </button>
        ) : (
          <button type="button" className="primary" onClick={api.startSession} disabled={api.busy || Boolean(api.session)}>
            Start writing session
          </button>
        )}
      </div>
      {mine && nextAt && (
        <p className="session-capture__status">
          {sessionCaptureConfigured(api.settings)
            ? `Session started ${formatWhen(mine.startedAt)}. Next picture at ${formatWhen(nextAt)}.`
            : `Session started ${formatWhen(mine.startedAt)}. Pictures are off, so nothing is being captured.`}
        </p>
      )}
      {api.notice && (
        <p className={`session-capture__notice${api.notice.tone === 'error' ? ' is-error' : ''}`} role={api.notice.tone === 'error' ? 'alert' : 'status'}>
          {api.notice.text}
        </p>
      )}
      {api.previews.length > 0 && (
        <ul className="session-capture__thumbs">
          {api.previews.map((thumb) => (
            <li key={thumb.id}>
              <img src={thumb.url} alt="Session picture: screenshot with the camera in the upper left" />
              <span>Picture · {formatWhen(thumb.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function SessionCaptureExport({
  doc,
  title,
}: {
  doc: ManuscriptDocument;
  title: string;
}) {
  const api = useSessionCapture();
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const enabled = sessionCaptureConfigured(api.settings);

  const download = async () => {
    setExporting(true);
    setError('');
    try {
      const file = await api.capturePdf(doc, title);
      const url = URL.createObjectURL(file.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The session capture could not be downloaded.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <section className="session-capture-export" aria-label="Session capture document">
      <h3>Session capture record</h3>
      <p>
        A separate PDF from the certification summary that leads the manuscript download. Each page shows two pictures
        across and three down, with the certification details for that window under each picture.
      </p>
      {!enabled && (
        <p className="session-capture-export__hint">
          Camera and screen are off. Turn them on in the session bar, next to the word goal and timer. Nothing is
          captured, and this document stays out of the certification record, until you do.
        </p>
      )}
      {enabled && api.thumbnailCount === 0 && (
        <p className="session-capture-export__hint">
          No pictures yet. Start a writing session on the manuscript. The PDF will say so until a picture is stored.
        </p>
      )}
      {enabled && api.thumbnailCount > 0 && (
        <p className="session-capture-export__hint">
          {api.thumbnailCount} session picture{api.thumbnailCount === 1 ? '' : 's'} stored for this manuscript.
        </p>
      )}
      {api.ownsSession && (
        <button type="button" onClick={api.endSession} disabled={api.busy}>
          {api.busy ? 'Capturing…' : 'End writing session'}
        </button>
      )}
      <button type="button" className="primary" disabled={!enabled || exporting} onClick={() => void download()}>
        {exporting ? 'Preparing…' : 'Download session capture PDF'}
      </button>
      {error && (
        <p className="session-capture__notice is-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
