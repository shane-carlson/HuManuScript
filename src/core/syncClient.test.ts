import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyDocument } from './document.ts';
import type { Library } from './library.ts';
import { emptyVersionLedger } from './versions.ts';
import {
  assertReadywriterSyncUrl,
  READYWRITER_ACCOUNT_PAGE,
  READYWRITER_SYNC_BASE_URL,
  READYWRITER_SYNC_PATHS,
} from './syncEndpoint.ts';
import {
  createReadywriterAccount,
  signInReadywriterAccount,
  signOutReadywriterAccount,
  syncWithAccount,
  validateAccountForm,
} from './syncClient.ts';
import {
  emptyAccountSnapshot,
  encodeSyncBody,
  mergeAccountSnapshots,
  observeLocalSnapshot,
  SYNC_SNAPSHOT_BYTE_LIMIT,
} from './syncSnapshot.ts';
import { clearSyncSession, loadSyncSession, saveSyncSession, type SyncStorage } from './syncSession.ts';
import { SYNC_COPY, syncStatusLine } from './syncStatus.ts';

const PASSWORD = 'Harbor-Key-1!';

function memoryStorage(): SyncStorage {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
    removeItem: (key) => {
      items.delete(key);
    },
  };
}

function libraryWithSeal(text = 'The tide wrote nothing back.'): Library {
  const id = 'book-1';
  const document = emptyDocument(id);
  document.title = 'Harbor';
  document.blocks = [{ id: 'p1', type: 'paragraph', title: '', text, marks: [] }];
  document.points = [
    {
      id: 'seal-1',
      blockId: 'p1',
      spanId: 'span-1',
      text,
      contentHash: 'seal-hash-do-not-recompute',
      sealedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      origin: 'keyboard',
      evidence: { inputTypes: ['insertText'], eventCount: 1, events: [] },
      priorHashes: [],
    },
  ];
  document.notes = {
    characters: [{ id: 'c1', name: 'Ada', body: 'Keeps the harbor key.' }],
    scenes: [],
  };
  return {
    version: 2,
    activeBookId: id,
    series: [],
    books: [{ id, title: 'Harbor', document }],
  };
}

function starter(): Library {
  const id = 'starter';
  const document = emptyDocument(id);
  document.title = 'Untitled book';
  return {
    version: 2,
    activeBookId: id,
    series: [],
    books: [{ id, title: 'Untitled book', document }],
  };
}

function wireOf(library: Library, times: Record<string, string>, now: string): Record<string, unknown> {
  const clock = observeLocalSnapshot(null, library, emptyVersionLedger(), now, times);
  const merged = mergeAccountSnapshots({
    localLibrary: library,
    localVersions: emptyVersionLedger(),
    remote: emptyAccountSnapshot(),
    clock,
  });
  return JSON.parse(encodeSyncBody(merged, null)) as Record<string, unknown>;
}

test('the sync host and paths stay on the live contract', () => {
  assert.equal(READYWRITER_SYNC_BASE_URL, 'https://www.readywriter.one');
  assert.equal(READYWRITER_ACCOUNT_PAGE, 'https://www.readywriter.one/account');
  assert.equal(READYWRITER_SYNC_PATHS.signup, '/api/account/signup');
  assert.equal(READYWRITER_SYNC_PATHS.login, '/api/account/login');
  assert.equal(READYWRITER_SYNC_PATHS.logout, '/api/account/logout');
  assert.equal(READYWRITER_SYNC_PATHS.me, '/api/account/me');
  assert.equal(READYWRITER_SYNC_PATHS.snapshot, '/api/humanuscript/sync');
  assert.equal(SYNC_SNAPSHOT_BYTE_LIMIT, 4_400_000);
  assert.throws(() => assertReadywriterSyncUrl('https://api.openai.com/v1/chat'), /readywriter\.one/);
  assert.throws(() => assertReadywriterSyncUrl('https://www.readywriter.one/api/sync'), /not a sync path/);
});

test('status copy covers signed out, syncing, success, and failure', () => {
  assert.match(SYNC_COPY.signedOut, /stay on this computer/i);
  assert.match(SYNC_COPY.signedOut, /same email and password/i);
  assert.match(SYNC_COPY.notSentToAi, /not sent to an AI/i);
  assert.match(SYNC_COPY.syncing, /notes, and certification/i);
  assert.match(SYNC_COPY.success, /same books, notes, and certification/i);
  assert.match(SYNC_COPY.passwordHint, /12 characters/);
  assert.equal(syncStatusLine({ phase: 'signed-out', email: null, lastSyncAt: null }), 'Not signed in');
  assert.equal(syncStatusLine({ phase: 'syncing', email: 'ada@example.com', lastSyncAt: null }), 'Syncing…');
  assert.equal(
    syncStatusLine({ phase: 'failure', email: 'ada@example.com', lastSyncAt: null }),
    'Signed in as ada@example.com. Sync did not finish.',
  );
  const success = syncStatusLine({
    phase: 'success',
    email: 'ada@example.com',
    lastSyncAt: '2026-10-29T16:05:00.000Z',
  });
  assert.match(success, /Signed in as ada@example.com/);
  assert.match(success, /Last sync/);
});

test('account forms reject a bad email, a missing name, and a short password before any request', async () => {
  assert.match(validateAccountForm('create', 'not-an-email', PASSWORD, 'Ada'), /email/i);
  assert.match(validateAccountForm('create', 'ada@example.com', PASSWORD, '  '), /display name/i);
  assert.match(validateAccountForm('create', 'ada@example.com', 'short', 'Ada'), /12 characters/i);
  assert.match(validateAccountForm('create', 'ada@example.com', 'lowercase-only1', 'Ada'), /uppercase/i);
  assert.match(validateAccountForm('sign-in', 'ada@example.com', ''), /password/i);
  assert.equal(validateAccountForm('sign-in', 'ada@example.com', 'x'), null);
  let called = false;
  const result = await createReadywriterAccount('nope', PASSWORD, 'Ada', async () => {
    called = true;
    return new Response('{}', { status: 500 });
  });
  assert.equal(called, false);
  assert.equal(result.ok, false);
});

test('creating an account waits for email confirmation and does not start a session', async () => {
  const created = await createReadywriterAccount('ada@example.com', PASSWORD, 'Ada', async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { email?: string; password?: string; displayName?: string };
    assert.equal(body.email, 'ada@example.com');
    assert.equal(body.displayName, 'Ada');
    assert.equal(JSON.stringify(body).includes('harbor'), false);
    return Response.json({
      needsVerification: true,
      email: 'ada@example.com',
      emailSent: true,
      user: { id: 'acct-1', email: 'ada@example.com', displayName: 'Ada', emailVerified: false },
    });
  });
  assert.equal(created.ok, false);
  if (created.ok) return;
  assert.equal(created.pending, true);
  assert.match(created.message, /confirm your email/i);
});

test('sign-in and sync talk only to readywriter.one and a second install receives the seal', async () => {
  const calls: { url: string; method: string; body: string | null; auth: string | null; match: string | null }[] = [];
  let stored: Record<string, unknown> | null = null;
  const fetchImpl = async (url: string, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    calls.push({
      url,
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? init.body : null,
      auth: headers.get('Authorization'),
      match: headers.get('If-Match'),
    });
    assert.equal(new URL(url).origin, 'https://www.readywriter.one');
    const path = new URL(url).pathname;
    if (path === '/api/account/login' && init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as { email?: string; password?: string };
      assert.equal(body.email, 'ada@example.com');
      assert.equal(body.password, PASSWORD);
      return Response.json({
        token: 'token-1',
        tokenType: 'Bearer',
        user: { id: 'acct-1', email: 'ada@example.com', displayName: 'Ada' },
      });
    }
    if (path === '/api/humanuscript/sync' && (init?.method ?? 'GET') === 'GET') {
      if (!stored) return Response.json({ snapshot: null });
      return Response.json({ snapshot: stored, revision: 'rev-1', updatedAt: '2026-10-29T16:05:00.000Z' });
    }
    if (path === '/api/humanuscript/sync' && init?.method === 'PUT') {
      assert.equal(headers.get('Authorization'), 'Bearer token-1');
      assert.equal(headers.get('If-Match'), null);
      const body = JSON.parse(String(init.body)) as {
        version?: number;
        product?: string;
        manuscripts?: Record<string, { blocks?: Array<{ text?: string }> }>;
        notes?: Record<string, { characters?: Array<{ body?: string }> }>;
        certification?: Record<string, { points?: Array<{ contentHash?: string }> }>;
      };
      assert.equal(body.version, 1);
      assert.equal(body.product, undefined);
      assert.equal(body.manuscripts?.['book-1']?.blocks?.[0]?.text, 'The tide wrote nothing back.');
      assert.equal(body.notes?.['book-1']?.characters?.[0]?.body, 'Keeps the harbor key.');
      assert.equal(body.certification?.['book-1']?.points?.[0]?.contentHash, 'seal-hash-do-not-recompute');
      stored = body;
      return Response.json({ revision: 'rev-1', updatedAt: '2026-10-29T16:05:00.000Z' });
    }
    return new Response('missing', { status: 500 });
  };

  const signedIn = await signInReadywriterAccount('ada@example.com', PASSWORD, fetchImpl);
  assert.equal(signedIn.ok, true);
  if (!signedIn.ok) return;
  assert.equal(signedIn.account.token, 'token-1');
  assert.equal(signedIn.account.accountId, 'acct-1');

  const local = libraryWithSeal();
  const now = '2026-10-29T16:00:00.000Z';
  const first = await syncWithAccount({
    token: 'token-1',
    library: local,
    versions: emptyVersionLedger(),
    clock: observeLocalSnapshot(null, local, emptyVersionLedger(), now, { 'book-1': '2026-10-01T00:00:00.000Z' }),
    now,
    fetchImpl,
  });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(first.library.books[0]?.document.points[0]?.contentHash, 'seal-hash-do-not-recompute');

  const blank = starter();
  const second = await syncWithAccount({
    token: 'token-1',
    library: blank,
    versions: emptyVersionLedger(),
    clock: observeLocalSnapshot(null, blank, emptyVersionLedger(), '2026-10-29T17:00:00.000Z'),
    now: '2026-10-29T17:00:00.000Z',
    fetchImpl,
  });
  assert.equal(second.ok, true);
  if (!second.ok) return;
  assert.equal(second.library.books.length, 1);
  assert.equal(second.library.books[0]?.id, 'book-1');
  assert.equal(second.library.books[0]?.document.notes?.characters[0]?.body, 'Keeps the harbor key.');
  assert.equal(second.library.books[0]?.document.points[0]?.contentHash, 'seal-hash-do-not-recompute');
  assert.equal(second.library.books[0]?.document.blocks[0]?.text, 'The tide wrote nothing back.');

  const hosts = new Set(calls.map((call) => new URL(call.url).origin));
  assert.deepEqual([...hosts], ['https://www.readywriter.one']);
  const puts = calls.filter((call) => call.method === 'PUT');
  assert.equal(puts.length, 1);
  assert.equal(puts[0]!.match, null);
  assert.equal(calls.some((call) => call.method === 'DELETE'), false);
});

test('a later push sends If-Match and one 409 retries with the included snapshot', async () => {
  const remote = libraryWithSeal('Remote sentence.');
  const remoteWire = wireOf(remote, { 'book-1': '2026-10-01T00:00:00.000Z' }, '2026-10-01T00:00:00.000Z');
  const matches: Array<string | null> = [];
  let conflicted = false;
  const fetchImpl = async (url: string, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    const path = new URL(url).pathname;
    if (path === '/api/humanuscript/sync' && (init?.method ?? 'GET') === 'GET') {
      return Response.json({ snapshot: remoteWire, revision: 'rev-a', updatedAt: '2026-10-01T00:00:00.000Z' });
    }
    if (path === '/api/humanuscript/sync' && init?.method === 'PUT') {
      matches.push(headers.get('If-Match'));
      if (!conflicted) {
        conflicted = true;
        return Response.json(
          { revision: 'rev-b', snapshot: remoteWire, updatedAt: '2026-10-11T00:00:00.000Z' },
          { status: 409 },
        );
      }
      return Response.json({ revision: 'rev-b', updatedAt: '2026-10-20T00:00:00.000Z' });
    }
    return new Response('missing', { status: 500 });
  };

  const local = libraryWithSeal('Local sentence.');
  const result = await syncWithAccount({
    token: 'token-1',
    library: local,
    versions: emptyVersionLedger(),
    clock: observeLocalSnapshot(null, local, emptyVersionLedger(), '2026-10-20T00:00:00.000Z', {
      'book-1': '2026-10-20T00:00:00.000Z',
    }),
    now: '2026-10-20T00:00:00.000Z',
    fetchImpl,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.library.books[0]?.document.blocks[0]?.text, 'Local sentence.');
  assert.equal(result.library.books[0]?.document.points[0]?.contentHash, 'seal-hash-do-not-recompute');
  assert.deepEqual(matches, ['"rev-a"', '"rev-b"']);
  assert.equal(result.clock.revision, 'rev-b');
});

test('a failed sync reports the failure and does not replace the books', async () => {
  const local = libraryWithSeal();
  let puts = 0;
  const result = await syncWithAccount({
    token: 'token-1',
    library: local,
    versions: emptyVersionLedger(),
    clock: observeLocalSnapshot(null, local, emptyVersionLedger(), '2026-10-29T16:00:00.000Z'),
    now: '2026-10-29T16:00:00.000Z',
    fetchImpl: async (_url, init) => {
      if (init?.method === 'PUT') puts += 1;
      return new Response('no', { status: 500 });
    },
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.message, /still on this computer/i);
  assert.equal(puts, 0);
  assert.equal(local.books[0]?.document.points[0]?.contentHash, 'seal-hash-do-not-recompute');
});

test('an unauthorized read does not push manuscripts', async () => {
  let puts = 0;
  const local = libraryWithSeal();
  const result = await syncWithAccount({
    token: 'expired',
    library: local,
    versions: emptyVersionLedger(),
    clock: observeLocalSnapshot(null, local, emptyVersionLedger(), '2026-10-29T16:00:00.000Z'),
    now: '2026-10-29T16:00:00.000Z',
    fetchImpl: async (_url, init) => {
      if (init?.method === 'PUT') puts += 1;
      return Response.json({ error: 'unauthorized', code: 'UNAUTHORIZED', message: 'Sign in to continue.' }, { status: 401 });
    },
  });
  assert.equal(puts, 0);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.message, /Sign in again/);
});

test('a snapshot that is too large stays on this computer', async () => {
  const local = libraryWithSeal();
  const result = await syncWithAccount({
    token: 'token-1',
    library: local,
    versions: emptyVersionLedger(),
    clock: observeLocalSnapshot(null, local, emptyVersionLedger(), '2026-10-29T16:00:00.000Z'),
    now: '2026-10-29T16:00:00.000Z',
    fetchImpl: async (_url, init) => {
      if ((init?.method ?? 'GET') === 'GET') return Response.json({ snapshot: null });
      return new Response('too big', { status: 413 });
    },
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.message, /too large to sync/i);
  assert.equal(local.books[0]?.document.points[0]?.contentHash, 'seal-hash-do-not-recompute');
});

test('a missing account response does not start a session', async () => {
  const result = await createReadywriterAccount(
    'ada@example.com',
    PASSWORD,
    'Ada',
    async () => new Response('The page could not be found', { status: 404 }),
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.pending, undefined);
  assert.match(result.message, /did not work/i);
});

test('the wrong password stays on the sign-in form', async () => {
  const result = await signInReadywriterAccount(
    'ada@example.com',
    'wrong-password',
    async () => Response.json({ error: 'Email or password is incorrect.' }, { status: 401 }),
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.message, /incorrect/i);
});

test('an unconfirmed email does not sign in', async () => {
  const result = await signInReadywriterAccount(
    'ada@example.com',
    PASSWORD,
    async () =>
      Response.json(
        {
          error: 'Confirm your email before using this account. Check your inbox for a verification link.',
          code: 'EMAIL_NOT_VERIFIED',
          email: 'ada@example.com',
        },
        { status: 403 },
      ),
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.pending, true);
  assert.match(result.message, /Confirm your email/);
});

test('signing out tells the account and does not delete the snapshot', async () => {
  const methods: string[] = [];
  await signOutReadywriterAccount('token-1', async (url, init) => {
    methods.push(`${init?.method ?? 'GET'} ${new URL(url).pathname}`);
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer token-1');
    return Response.json({ ok: true });
  });
  assert.deepEqual(methods, ['POST /api/account/logout']);
  await signOutReadywriterAccount('token-1', async () => {
    throw new Error('offline');
  });
});

test('the saved session is the account, not the manuscript', () => {
  const storage = memoryStorage();
  saveSyncSession(
    { token: 'token-1', email: 'ada@example.com', accountId: 'acct-1', displayName: 'Ada', lastSyncAt: null },
    storage,
  );
  const loaded = loadSyncSession(storage);
  assert.equal(loaded?.email, 'ada@example.com');
  assert.equal(loaded?.displayName, 'Ada');
  assert.equal(JSON.stringify(loaded).includes('harbor'), false);
  clearSyncSession(storage);
  assert.equal(loadSyncSession(storage), null);
});
