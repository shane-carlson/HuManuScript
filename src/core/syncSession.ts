/**
 * This install’s readywriter.one session and the clock used to merge snapshots.
 * The session stores the bearer token, not manuscripts.
 */

import { LIBRARY_KEY } from '../storage.ts';
import type { SyncClock } from './syncSnapshot.ts';

export interface SyncSession {
  token: string;
  email: string;
  accountId: string;
  displayName?: string;
  lastSyncAt: string | null;
}

const SESSION_KEY = 'humanuscript.sync.session.v1';
const CLOCK_KEY = 'humanuscript.sync.clock.v1';

export interface SyncStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function browserStorage(): SyncStorage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

function storeOf(storage?: SyncStorage | null): SyncStorage | null {
  if (storage) return storage;
  return browserStorage();
}

export function loadSyncSession(storage?: SyncStorage | null): SyncSession | null {
  const store = storeOf(storage);
  if (!store) return null;
  try {
    const raw = store.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SyncSession>;
    if (typeof parsed.token !== 'string' || !parsed.token) return null;
    if (typeof parsed.email !== 'string' || !parsed.email) return null;
    if (typeof parsed.accountId !== 'string' || !parsed.accountId) return null;
    return {
      token: parsed.token,
      email: parsed.email,
      accountId: parsed.accountId,
      ...(typeof parsed.displayName === 'string' && parsed.displayName ? { displayName: parsed.displayName } : {}),
      lastSyncAt: typeof parsed.lastSyncAt === 'string' ? parsed.lastSyncAt : null,
    };
  } catch {
    return null;
  }
}

export function saveSyncSession(session: SyncSession, storage?: SyncStorage | null): void {
  const store = storeOf(storage);
  if (!store) return;
  store.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSyncSession(storage?: SyncStorage | null): void {
  storeOf(storage)?.removeItem(SESSION_KEY);
}

export function loadSyncClock(storage?: SyncStorage | null): SyncClock | null {
  const store = storeOf(storage);
  if (!store) return null;
  try {
    const raw = store.getItem(CLOCK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SyncClock;
    if (!parsed || typeof parsed !== 'object' || !parsed.books) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSyncClock(clock: SyncClock, storage?: SyncStorage | null): void {
  const store = storeOf(storage);
  if (!store) return;
  store.setItem(CLOCK_KEY, JSON.stringify(clock));
}

export function readStoredBookTimes(storage?: SyncStorage | null): Record<string, string> {
  const store = storeOf(storage);
  if (!store) return {};
  try {
    const raw = store.getItem(LIBRARY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as {
      books?: Array<{ id?: string; document?: { savedAt?: string } }>;
    };
    const times: Record<string, string> = {};
    for (const book of parsed.books ?? []) {
      if (typeof book.id === 'string' && typeof book.document?.savedAt === 'string') {
        times[book.id] = book.document.savedAt;
      }
    }
    return times;
  } catch {
    return {};
  }
}
