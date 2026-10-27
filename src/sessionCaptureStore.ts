/**
 * Browser storage for session-capture settings and thumbnail files.
 *
 * The on/off setting is localStorage (`humanuscript.sessionCapture.v1`).
 * Thumbnail JPEGs and session rows are IndexedDB (`humanuscript.sessionCaptures.v1`).
 * Neither is written into the manuscript library.
 */

import {
  SESSION_CAPTURE_DB,
  SESSION_CAPTURE_SETTINGS_KEY,
  SESSION_STORE,
  THUMBNAIL_STORE,
  WRITING_SESSION_KEY,
  normalizeSessionCaptureSettings,
  readSessionCaptureSettings,
  readWritingSession,
  type CaptureKind,
  type CaptureReason,
  type SessionCaptureSettings,
  type WritingSessionState,
} from './core/sessionCapture.ts';

export interface StoredThumbnailRecord {
  id: string;
  sessionId: string;
  bookId: string;
  manuscriptId: string;
  at: string;
  reason: CaptureReason;
  kind: CaptureKind;
  windowStart: string;
  windowEnd: string;
  mime: 'image/jpeg';
  width: number;
  height: number;
  blob: Blob;
}

export function loadSessionCaptureSettings(): SessionCaptureSettings {
  try {
    return readSessionCaptureSettings(localStorage.getItem(SESSION_CAPTURE_SETTINGS_KEY));
  } catch {
    return { camera: false, screenshot: false };
  }
}

export function saveSessionCaptureSettings(settings: SessionCaptureSettings): void {
  const next = normalizeSessionCaptureSettings(settings);
  localStorage.setItem(SESSION_CAPTURE_SETTINGS_KEY, JSON.stringify(next));
}

export function loadWritingSession(): WritingSessionState | null {
  try {
    return readWritingSession(sessionStorage.getItem(WRITING_SESSION_KEY));
  } catch {
    return null;
  }
}

export function saveWritingSession(session: WritingSessionState | null): void {
  try {
    if (!session || session.endedAt) sessionStorage.removeItem(WRITING_SESSION_KEY);
    else sessionStorage.setItem(WRITING_SESSION_KEY, JSON.stringify(session));
  } catch {
    /* session storage may be unavailable */
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SESSION_CAPTURE_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SESSION_STORE)) {
        const sessions = db.createObjectStore(SESSION_STORE, { keyPath: 'id' });
        sessions.createIndex('manuscriptId', 'manuscriptId');
      }
      if (!db.objectStoreNames.contains(THUMBNAIL_STORE)) {
        const thumbs = db.createObjectStore(THUMBNAIL_STORE, { keyPath: 'id' });
        thumbs.createIndex('manuscriptId', 'manuscriptId');
        thumbs.createIndex('sessionId', 'sessionId');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Session thumbnails could not be opened in this browser.'));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('The thumbnail store failed.'));
    tx.onabort = () => reject(tx.error ?? new Error('The thumbnail store was aborted.'));
  });
}

export async function saveStoredSession(session: WritingSessionState): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(SESSION_STORE, 'readwrite');
    tx.objectStore(SESSION_STORE).put(session);
    await txDone(tx);
  } finally {
    db.close();
  }
}

export async function saveStoredThumbnail(record: StoredThumbnailRecord): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(THUMBNAIL_STORE, 'readwrite');
    tx.objectStore(THUMBNAIL_STORE).put(record);
    await txDone(tx);
  } finally {
    db.close();
  }
}

export async function listStoredSessions(manuscriptId: string): Promise<WritingSessionState[]> {
  const db = await openDb();
  try {
    const tx = db.transaction(SESSION_STORE, 'readonly');
    const done = txDone(tx);
    const rows = await new Promise<WritingSessionState[]>((resolve, reject) => {
      const request = tx.objectStore(SESSION_STORE).index('manuscriptId').getAll(manuscriptId);
      request.onsuccess = () => resolve((request.result ?? []) as WritingSessionState[]);
      request.onerror = () => reject(request.error);
    });
    await done;
    return rows;
  } finally {
    db.close();
  }
}

export async function listStoredThumbnails(manuscriptId: string): Promise<StoredThumbnailRecord[]> {
  const db = await openDb();
  try {
    const tx = db.transaction(THUMBNAIL_STORE, 'readonly');
    const done = txDone(tx);
    const rows = await new Promise<StoredThumbnailRecord[]>((resolve, reject) => {
      const request = tx.objectStore(THUMBNAIL_STORE).index('manuscriptId').getAll(manuscriptId);
      request.onsuccess = () => resolve((request.result ?? []) as StoredThumbnailRecord[]);
      request.onerror = () => reject(request.error);
    });
    await done;
    return rows;
  } finally {
    db.close();
  }
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the thumbnail.'));
    reader.readAsDataURL(blob);
  });
}
