import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyDocument, type ManuscriptDocument } from './document.ts';
import type { Book, Library } from './library.ts';
import { emptyVersionLedger, type VersionLedger } from './versions.ts';
import {
  clockFromMerged,
  emptyAccountSnapshot,
  fingerprintBook,
  isUntouchedBook,
  encodeSyncBody,
  ifMatchHeader,
  mergeAccountSnapshots,
  observeLocalSnapshot,
  parseSyncPayload,
  revisionFromEtag,
  sealRecords,
  type AccountSnapshot,
  type SyncClock,
} from './syncSnapshot.ts';

const HASH = 'seal-hash-do-not-recompute';
const OTHER_HASH = 'other-seal-left-intact';

function sealedDoc(id: string, text: string, hash: string, note: string): ManuscriptDocument {
  const doc = emptyDocument(id);
  doc.title = 'Harbor';
  doc.blocks = [{ id: 'p1', type: 'paragraph', title: '', text, marks: [] }];
  doc.points = [
    {
      id: 'seal-1',
      blockId: 'p1',
      spanId: 'span-1',
      text,
      contentHash: hash,
      sealedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      origin: 'keyboard',
      evidence: { inputTypes: ['insertText'], eventCount: 1, events: [] },
      priorHashes: ['older-seal'],
    },
  ];
  doc.moves = [
    { id: 'move-1', at: '2026-01-02T00:00:00.000Z', blockIds: ['p1'], fromIndex: 1, toIndex: 0, label: 'Moved the paragraph' },
  ];
  doc.notes = {
    characters: [{ id: 'c1', name: 'Ada', body: note }],
    scenes: [{ id: 's1', blockId: 'p1', body: 'Night arrival' }],
  };
  return doc;
}

function libraryOf(books: Book[], activeId = books[0]!.id): Library {
  return { version: 2, activeBookId: activeId, series: [], books };
}

function snapshotOf(library: Library, versions: VersionLedger, times: Record<string, string>, revision = 'rev-1'): AccountSnapshot {
  return {
    revision,
    updatedAt: '2026-10-29T16:00:00.000Z',
    present: true,
    library,
    versions,
    bookUpdatedAt: times,
    versionsUpdatedAt: '2026-10-29T16:00:00.000Z',
    seriesUpdatedAt: '2026-10-29T16:00:00.000Z',
    raw: null,
  };
}

function starterLibrary(): Library {
  const id = 'starter';
  const document = emptyDocument(id);
  document.title = 'Untitled book';
  return libraryOf([{ id, title: 'Untitled book', document }]);
}

test('a blank install takes the account manuscripts, notes, and seal hashes', () => {
  const doc = sealedDoc('book-1', 'The harbor kept its own hours.', HASH, 'Keeps the harbor key.');
  const remote = libraryOf([{ id: 'book-1', title: 'Harbor', document: doc }]);
  const versions: VersionLedger = {
    version: 1,
    byBookId: {
      'book-1': [
        {
          id: 'ver-1',
          bookId: 'book-1',
          label: 'Dawn',
          savedAt: '2026-02-01T00:00:00.000Z',
          kind: 'manual',
          document: sealedDoc('book-1', 'The harbor kept its own hours.', HASH, 'Keeps the harbor key.'),
        },
      ],
    },
  };
  const local = starterLibrary();
  const clock = observeLocalSnapshot(null, local, emptyVersionLedger(), '2026-10-29T12:00:00.000Z');
  const merged = mergeAccountSnapshots({
    localLibrary: local,
    localVersions: emptyVersionLedger(),
    remote: snapshotOf(remote, versions, { 'book-1': '2026-10-28T00:00:00.000Z' }),
    clock,
  });

  assert.deepEqual(merged.library.books.map((book) => book.id), ['book-1']);
  assert.equal(merged.library.books[0]!.document.notes?.characters[0]?.body, 'Keeps the harbor key.');
  assert.equal(merged.library.books[0]!.document.points[0]?.contentHash, HASH);
  assert.equal(merged.library.books[0]!.document.points[0]?.priorHashes[0], 'older-seal');
  assert.equal(merged.library.books[0]!.document.moves[0]?.label, 'Moved the paragraph');
  assert.equal(merged.versions.byBookId['book-1']?.[0]?.document.points[0]?.contentHash, HASH);
  assert.deepEqual(sealRecords(merged.library, merged.versions), sealRecords(remote, versions));
  assert.equal(isUntouchedBook(local.books[0]!), true);
});

test('opening the library does not make an unchanged book look newly edited', () => {
  const doc = sealedDoc('book-1', 'Same page.', HASH, 'Note');
  const library = libraryOf([{ id: 'book-1', title: 'Harbor', document: doc }]);
  const seeded = observeLocalSnapshot(null, library, emptyVersionLedger(), '2026-10-29T12:00:00.000Z', {
    'book-1': '2026-01-15T00:00:00.000Z',
  });
  const again = observeLocalSnapshot(seeded, library, emptyVersionLedger(), '2026-10-29T18:00:00.000Z');
  assert.equal(again.books['book-1']?.updatedAt, '2026-01-15T00:00:00.000Z');
  assert.equal(again.books['book-1']?.fingerprint, fingerprintBook(library.books[0]!));
});

test('an edited book keeps its own seal when it is newer than the account', () => {
  const localDoc = sealedDoc('book-1', 'Local sentence.', HASH, 'Local note');
  const remoteDoc = sealedDoc('book-1', 'Remote sentence.', OTHER_HASH, 'Remote note');
  const local = libraryOf([{ id: 'book-1', title: 'Harbor', document: localDoc }]);
  const remote = libraryOf([{ id: 'book-1', title: 'Harbor', document: remoteDoc }]);
  let clock: SyncClock = observeLocalSnapshot(null, local, emptyVersionLedger(), '2026-10-01T00:00:00.000Z', {
    'book-1': '2026-10-01T00:00:00.000Z',
  });
  clock = { ...clockFromMerged(
    mergeAccountSnapshots({
      localLibrary: local,
      localVersions: emptyVersionLedger(),
      remote: emptyAccountSnapshot(),
      clock,
    }),
    'rev-0',
  ), books: { 'book-1': { fingerprint: 'stale', updatedAt: '2026-10-01T00:00:00.000Z', synced: true } } };
  const observed = observeLocalSnapshot(clock, local, emptyVersionLedger(), '2026-10-20T00:00:00.000Z');
  const merged = mergeAccountSnapshots({
    localLibrary: local,
    localVersions: emptyVersionLedger(),
    remote: snapshotOf(remote, emptyVersionLedger(), { 'book-1': '2026-10-10T00:00:00.000Z' }),
    clock: observed,
  });
  assert.equal(merged.library.books[0]!.document.blocks[0]?.text, 'Local sentence.');
  assert.equal(merged.library.books[0]!.document.points[0]?.contentHash, HASH);
  assert.equal(merged.library.books[0]!.document.notes?.characters[0]?.body, 'Local note');
});

test('a newer account copy replaces the book and keeps the account seal', () => {
  const localDoc = sealedDoc('book-1', 'Local sentence.', HASH, 'Local note');
  const remoteDoc = sealedDoc('book-1', 'Remote sentence.', OTHER_HASH, 'Remote note');
  const local = libraryOf([{ id: 'book-1', title: 'Harbor', document: localDoc }]);
  const remote = libraryOf([{ id: 'book-1', title: 'Harbor', document: remoteDoc }]);
  const base = observeLocalSnapshot(null, local, emptyVersionLedger(), '2026-10-01T00:00:00.000Z');
  const clock = clockFromMerged(
    {
      library: local,
      versions: emptyVersionLedger(),
      bookUpdatedAt: { 'book-1': '2026-10-01T00:00:00.000Z' },
      versionsUpdatedAt: '2026-10-01T00:00:00.000Z',
      seriesUpdatedAt: '2026-10-01T00:00:00.000Z',
    },
    'rev-0',
  );
  assert.equal(base.books['book-1']?.fingerprint, clock.books['book-1']?.fingerprint);
  const merged = mergeAccountSnapshots({
    localLibrary: local,
    localVersions: emptyVersionLedger(),
    remote: snapshotOf(remote, emptyVersionLedger(), { 'book-1': '2026-10-21T00:00:00.000Z' }),
    clock,
  });
  assert.equal(merged.library.books[0]!.document.blocks[0]?.text, 'Remote sentence.');
  assert.equal(merged.library.books[0]!.document.points[0]?.contentHash, OTHER_HASH);
  assert.notEqual(merged.library.books[0]!.document.points[0]?.contentHash, HASH);
});

test('books that exist on only one install are both kept', () => {
  const left = sealedDoc('left', 'Left page.', HASH, 'Left note');
  const right = sealedDoc('right', 'Right page.', OTHER_HASH, 'Right note');
  const local = libraryOf([{ id: 'left', title: 'Left', document: left }]);
  const remote = libraryOf([
    { id: 'left', title: 'Left', document: left },
    { id: 'right', title: 'Right', document: right },
  ]);
  const clock = observeLocalSnapshot(null, local, emptyVersionLedger(), '2026-10-01T00:00:00.000Z', {
    left: '2026-10-01T00:00:00.000Z',
  });
  const merged = mergeAccountSnapshots({
    localLibrary: local,
    localVersions: emptyVersionLedger(),
    remote: snapshotOf(remote, emptyVersionLedger(), { left: '2026-10-01T00:00:00.000Z', right: '2026-10-02T00:00:00.000Z' }),
    clock,
  });
  assert.deepEqual(merged.library.books.map((book) => book.id), ['left', 'right']);
  assert.equal(merged.library.books[1]!.document.points[0]?.contentHash, OTHER_HASH);
});

test('a snapshot that would drop a seal is refused', () => {
  const parsed = parseSyncPayload(
    {
      revision: 'rev',
      snapshot: {
        version: 1,
        manuscripts: {
          'book-1': {
            version: 1,
            manuscriptId: 'book-1',
            title: 'Harbor',
            blocks: [{ id: 'p1', type: 'paragraph', title: '', text: 'Page.', marks: [] }],
            bookTitle: 'Harbor',
          },
        },
        notes: { 'book-1': { characters: [], scenes: [] } },
        certification: {
          'book-1': {
            provenance: {},
            points: [{ id: 'seal-1', origin: 'keyboard', text: 'Page.', contentHash: '' }],
            moves: [],
          },
        },
      },
    },
    null,
  );
  assert.equal(parsed.ok, false);
});

test('a null snapshot means nothing has been pushed yet', () => {
  const parsed = parseSyncPayload({ snapshot: null }, 'W/"rev-1"');
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.snapshot.present, false);
  assert.equal(parsed.snapshot.library, null);
  assert.equal(parsed.snapshot.revision, 'rev-1');
  assert.equal(ifMatchHeader('rev-1'), '"rev-1"');
  assert.equal(revisionFromEtag('W/"rev-1"'), 'rev-1');
});

test('the wire snapshot keeps seals, notes, and extra keys', () => {
  const doc = sealedDoc('book-1', 'The harbor kept its own hours.', HASH, 'Keeps the harbor key.');
  const library = libraryOf([{ id: 'book-1', title: 'Harbor', document: doc }]);
  const clock = observeLocalSnapshot(null, library, emptyVersionLedger(), '2026-10-01T00:00:00.000Z', {
    'book-1': '2026-10-01T00:00:00.000Z',
  });
  const merged = mergeAccountSnapshots({
    localLibrary: library,
    localVersions: emptyVersionLedger(),
    remote: emptyAccountSnapshot(),
    clock,
  });
  const body = JSON.parse(encodeSyncBody(merged, { widget: { keep: true } })) as {
    version: number;
    widget?: { keep?: boolean };
    certification: Record<string, { points: Array<{ contentHash: string }> }>;
  };
  assert.equal(body.version, 1);
  assert.equal(body.widget?.keep, true);
  assert.equal(body.certification['book-1']?.points[0]?.contentHash, HASH);
  const parsed = parseSyncPayload({ snapshot: body, revision: 'rev-9' }, 'W/"rev-etag"');
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.snapshot.present, true);
  assert.equal(parsed.snapshot.revision, 'rev-9');
  assert.equal(parsed.snapshot.library?.books[0]?.document.points[0]?.contentHash, HASH);
  assert.equal(parsed.snapshot.library?.books[0]?.document.notes?.characters[0]?.body, 'Keeps the harbor key.');
  assert.equal((parsed.snapshot.raw?.widget as { keep?: boolean } | undefined)?.keep, true);
});

test('no account snapshot leaves the local books in place', () => {
  const doc = sealedDoc('book-1', 'Stay.', HASH, 'Note');
  const local = libraryOf([{ id: 'book-1', title: 'Harbor', document: doc }]);
  const clock = observeLocalSnapshot(null, local, emptyVersionLedger(), '2026-10-01T00:00:00.000Z', {
    'book-1': '2026-10-01T00:00:00.000Z',
  });
  const merged = mergeAccountSnapshots({
    localLibrary: local,
    localVersions: emptyVersionLedger(),
    remote: emptyAccountSnapshot(),
    clock,
  });
  assert.equal(merged.library.books[0]!.document.points[0]?.contentHash, HASH);
  assert.equal(merged.library.books[0]!.document.notes?.scenes[0]?.body, 'Night arrival');
});
