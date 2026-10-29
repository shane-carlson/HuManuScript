/**
 * readywriter.one account client.
 * Manuscript content is sent only to READYWRITER_SYNC_BASE_URL, and only after sign-in.
 * Seal hashes are copied as stored and are never rewritten here.
 */

import {
  READYWRITER_SYNC_PATHS,
  assertReadywriterSyncUrl,
  readywriterSyncUrl,
} from './syncEndpoint.ts';
import {
  SYNC_SNAPSHOT_BYTE_LIMIT,
  clockFromMerged,
  encodeSyncBody,
  ifMatchHeader,
  mergeAccountSnapshots,
  parseSyncPayload,
  revisionFromEtag,
  sealRecords,
  snapshotsMatch,
  type AccountSnapshot,
  type MergedAccount,
  type SyncClock,
} from './syncSnapshot.ts';
import type { Library } from './library.ts';
import { emptyVersionLedger, type VersionLedger } from './versions.ts';

export interface ReadywriterAccount {
  token: string;
  email: string;
  accountId: string;
  displayName: string;
}

export type AccountResult =
  | { ok: true; account: ReadywriterAccount }
  | { ok: false; pending: true; message: string }
  | { ok: false; pending?: false; message: string };

export type SyncResult =
  | {
      ok: true;
      library: Library;
      versions: VersionLedger;
      clock: SyncClock;
      syncedAt: string;
    }
  | { ok: false; message: string };

type FetchImpl = (input: string, init?: RequestInit) => Promise<Response>;

const FAILURE = 'Sync did not finish. Your books are still on this computer.';
const CONFIRM_EMAIL = 'Confirm your email, then sign in.';
const TOO_LARGE = `This library is too large to sync. The limit is ${SYNC_SNAPSHOT_BYTE_LIMIT.toLocaleString('en-US')} bytes. Your books are still on this computer.`;

export function validateAccountForm(
  kind: 'create' | 'sign-in',
  email: string,
  password: string,
  displayName = '',
): string | null {
  const trimmed = email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return 'Enter a valid email address.';
  }
  if (kind === 'sign-in') {
    return password.length === 0 ? 'Enter the password for that account.' : null;
  }
  const name = displayName.trim();
  if (!name) return 'Display name is required.';
  if (name.length > 40) return 'Use a name of 40 characters or fewer.';
  if (password.length < 12) return 'Password must be at least 12 characters.';
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)) {
    return 'Password needs both uppercase and lowercase letters.';
  }
  if (!/\d/.test(password)) return 'Password needs a number.';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Password needs a symbol.';
  return null;
}

function networkMessage(): string {
  return 'Could not reach readywriter.one. Check your connection and try again. Your books are still on this computer.';
}

function serverMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object') return fallback;
  const record = body as { error?: unknown; message?: unknown; code?: unknown };
  if (typeof record.error === 'string' && record.error.trim() && record.error !== 'unauthorized') {
    return record.error.trim();
  }
  if (typeof record.message === 'string' && record.message.trim()) return record.message.trim();
  if (record.code === 'EMAIL_NOT_VERIFIED') return CONFIRM_EMAIL;
  return fallback;
}

function readUser(value: unknown): { id: string; email: string; displayName: string } | null {
  if (!value || typeof value !== 'object') return null;
  const user = value as { id?: unknown; email?: unknown; displayName?: unknown };
  if (typeof user.id !== 'string' || !user.id || typeof user.email !== 'string' || !user.email) return null;
  return {
    id: user.id,
    email: user.email,
    displayName: typeof user.displayName === 'string' ? user.displayName : '',
  };
}

async function readJson(response: Response): Promise<unknown | null> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function accountFromLogin(body: unknown): ReadywriterAccount | null {
  if (!body || typeof body !== 'object') return null;
  const record = body as { token?: unknown; user?: unknown };
  const token = typeof record.token === 'string' ? record.token : '';
  const user = readUser(record.user);
  if (!token || !user) return null;
  return { token, email: user.email, accountId: user.id, displayName: user.displayName };
}

async function postJson(url: string, body: unknown, fetchImpl: FetchImpl, token?: string): Promise<Response> {
  assertReadywriterSyncUrl(url);
  const headers: Record<string, string> = { Accept: 'application/json', 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetchImpl(url, {
    method: 'POST',
    credentials: 'omit',
    cache: 'no-store',
    headers,
    body: JSON.stringify(body),
  });
}

export async function createReadywriterAccount(
  email: string,
  password: string,
  displayName: string,
  fetchImpl: FetchImpl = fetch,
): Promise<AccountResult> {
  const invalid = validateAccountForm('create', email, password, displayName);
  if (invalid) return { ok: false, message: invalid };
  const url = readywriterSyncUrl(READYWRITER_SYNC_PATHS.signup);
  let response: Response;
  try {
    response = await postJson(url, { email: email.trim(), password, displayName: displayName.trim() }, fetchImpl);
  } catch {
    return { ok: false, message: networkMessage() };
  }
  const body = await readJson(response);
  if (response.status === 403 && isUnverified(body)) {
    return { ok: false, pending: true, message: serverMessage(body, CONFIRM_EMAIL) };
  }
  if (!response.ok) return { ok: false, message: serverMessage(body, 'That did not work. Check the details and try again.') };
  if (needsConfirmation(body)) {
    return { ok: false, pending: true, message: CONFIRM_EMAIL };
  }
  return { ok: false, pending: true, message: CONFIRM_EMAIL };
}

export async function signInReadywriterAccount(
  email: string,
  password: string,
  fetchImpl: FetchImpl = fetch,
): Promise<AccountResult> {
  const invalid = validateAccountForm('sign-in', email, password);
  if (invalid) return { ok: false, message: invalid };
  const url = readywriterSyncUrl(READYWRITER_SYNC_PATHS.login);
  let response: Response;
  try {
    response = await postJson(url, { email: email.trim(), password }, fetchImpl);
  } catch {
    return { ok: false, message: networkMessage() };
  }
  const body = await readJson(response);
  if (response.status === 403 && isUnverified(body)) {
    return { ok: false, pending: true, message: serverMessage(body, CONFIRM_EMAIL) };
  }
  if (!response.ok) return { ok: false, message: serverMessage(body, 'Email or password is incorrect.') };
  const account = accountFromLogin(body);
  if (!account) {
    return { ok: false, message: 'readywriter.one did not return a sign-in token. Your books were not changed.' };
  }
  return { ok: true, account };
}

function isUnverified(body: unknown): boolean {
  return Boolean(body && typeof body === 'object' && (body as { code?: unknown }).code === 'EMAIL_NOT_VERIFIED');
}

function needsConfirmation(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  const record = body as { needsVerification?: unknown; user?: { emailVerified?: unknown } };
  if (record.needsVerification === true) return true;
  if (record.user && record.user.emailVerified === false) return true;
  return false;
}

export async function readReadywriterAccount(
  token: string,
  fetchImpl: FetchImpl = fetch,
): Promise<{ ok: true; account: Omit<ReadywriterAccount, 'token'> } | { ok: false; unauthorized: boolean; message: string }> {
  const url = readywriterSyncUrl(READYWRITER_SYNC_PATHS.me);
  assertReadywriterSyncUrl(url);
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      credentials: 'omit',
      cache: 'no-store',
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    });
  } catch {
    return { ok: false, unauthorized: false, message: networkMessage() };
  }
  const body = await readJson(response);
  if (response.status === 401 || response.status === 403) {
    return { ok: false, unauthorized: true, message: 'Sign in again to sync. Your books are still on this computer.' };
  }
  if (!response.ok) return { ok: false, unauthorized: false, message: serverMessage(body, FAILURE) };
  const user = readUser(body && typeof body === 'object' && 'user' in body ? (body as { user?: unknown }).user : body);
  if (!user) return { ok: false, unauthorized: false, message: 'readywriter.one did not return this account. Your books were not changed.' };
  return { ok: true, account: { email: user.email, accountId: user.id, displayName: user.displayName } };
}

export async function signOutReadywriterAccount(token: string, fetchImpl: FetchImpl = fetch): Promise<void> {
  const url = readywriterSyncUrl(READYWRITER_SYNC_PATHS.logout);
  assertReadywriterSyncUrl(url);
  try {
    await fetchImpl(url, {
      method: 'POST',
      credentials: 'omit',
      cache: 'no-store',
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    });
  } catch {
    /* Signing out locally is enough. The books stay on this computer. */
  }
}

function sameSealSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const a = [...left].sort();
  const b = [...right].sort();
  return a.every((seal, index) => seal === b[index]);
}

async function pullSnapshot(
  token: string,
  fetchImpl: FetchImpl,
): Promise<{ ok: true; snapshot: AccountSnapshot } | { ok: false; message: string }> {
  const url = readywriterSyncUrl(READYWRITER_SYNC_PATHS.snapshot);
  assertReadywriterSyncUrl(url);
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      credentials: 'omit',
      cache: 'no-store',
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    });
  } catch {
    return { ok: false, message: networkMessage() };
  }
  if (response.status === 401 || response.status === 403) {
    return { ok: false, message: 'Sign in again to sync. Your books are still on this computer.' };
  }
  if (!response.ok) return { ok: false, message: serverMessage(await readJson(response), FAILURE) };
  const body = await readJson(response);
  return parseSyncPayload(body, response.headers.get('ETag'));
}

async function pushSnapshot(
  token: string,
  merged: MergedAccount,
  remote: AccountSnapshot,
  fetchImpl: FetchImpl,
): Promise<
  | { ok: true; revision: string | null; syncedAt: string }
  | { ok: false; message: string; conflict?: boolean; snapshot?: AccountSnapshot }
> {
  const url = readywriterSyncUrl(READYWRITER_SYNC_PATHS.snapshot);
  assertReadywriterSyncUrl(url);
  const json = encodeSyncBody(merged, remote.raw);
  const bytes = new TextEncoder().encode(json).length;
  if (bytes > SYNC_SNAPSHOT_BYTE_LIMIT) return { ok: false, message: TOO_LARGE };
  const sentSeals = sealRecords(merged.library, merged.versions);
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
  if (remote.present && remote.revision) headers['If-Match'] = ifMatchHeader(remote.revision);
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'PUT',
      credentials: 'omit',
      cache: 'no-store',
      headers,
      body: json,
    });
  } catch {
    return { ok: false, message: networkMessage() };
  }
  const body = await readJson(response);
  if (response.status === 409) {
    const parsed = parseSyncPayload(body, response.headers.get('ETag'));
    if (!parsed.ok) return { ok: false, message: parsed.message };
    return { ok: false, message: FAILURE, conflict: true, snapshot: parsed.snapshot };
  }
  if (response.status === 413) return { ok: false, message: TOO_LARGE };
  if (response.status === 401 || response.status === 403) {
    return { ok: false, message: 'Sign in again to sync. Your books are still on this computer.' };
  }
  if (!response.ok) return { ok: false, message: serverMessage(body, FAILURE) };
  const etag = revisionFromEtag(response.headers.get('ETag'));
  if (body && typeof body === 'object' && ('snapshot' in body || 'manuscripts' in body)) {
    const parsed = parseSyncPayload(body, response.headers.get('ETag'));
    if (!parsed.ok) return parsed;
    if (parsed.snapshot.library) {
      const got = sealRecords(parsed.snapshot.library, parsed.snapshot.versions);
      const sent = sentSeals;
      if (!sameSealSet(sent, got)) {
        return {
          ok: false,
          message: 'readywriter.one changed a certification seal. This install kept your books and did not replace them.',
        };
      }
    }
    return {
      ok: true,
      revision: parsed.snapshot.revision ?? etag ?? remote.revision,
      syncedAt: parsed.snapshot.updatedAt ?? new Date().toISOString(),
    };
  }
  const revision =
    (body && typeof body === 'object' && typeof (body as { revision?: unknown }).revision === 'string'
      ? (body as { revision: string }).revision
      : null) ?? etag ?? remote.revision;
  const updatedAt =
    body && typeof body === 'object' && typeof (body as { updatedAt?: unknown }).updatedAt === 'string'
      ? (body as { updatedAt: string }).updatedAt
      : new Date().toISOString();
  return { ok: true, revision, syncedAt: updatedAt };
}

export async function syncWithAccount(args: {
  token: string;
  library: Library;
  versions: VersionLedger;
  clock: SyncClock;
  now: string;
  fetchImpl?: FetchImpl;
}): Promise<SyncResult> {
  const fetchImpl = args.fetchImpl ?? fetch;
  let remoteResult = await pullSnapshot(args.token, fetchImpl);
  if (!remoteResult.ok) return remoteResult;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const merged = mergeAccountSnapshots({
      localLibrary: args.library,
      localVersions: args.versions,
      remote: remoteResult.snapshot,
      clock: args.clock,
    });
    if (snapshotsMatch(merged, remoteResult.snapshot)) {
      const syncedAt = remoteResult.snapshot.updatedAt ?? args.now;
      return {
        ok: true,
        library: merged.library,
        versions: merged.versions,
        clock: clockFromMerged(merged, remoteResult.snapshot.revision, args.clock.accountId),
        syncedAt,
      };
    }
    const pushed = await pushSnapshot(args.token, merged, remoteResult.snapshot, fetchImpl);
    if (!pushed.ok && pushed.conflict && pushed.snapshot && attempt === 0) {
      remoteResult = { ok: true, snapshot: pushed.snapshot };
      continue;
    }
    if (!pushed.ok) return { ok: false, message: pushed.message };
    return {
      ok: true,
      library: merged.library,
      versions: merged.versions,
      clock: clockFromMerged(merged, pushed.revision, args.clock.accountId),
      syncedAt: pushed.syncedAt,
    };
  }
  return { ok: false, message: FAILURE };
}

export { emptyVersionLedger };
