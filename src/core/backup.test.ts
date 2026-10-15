import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildLibraryBackup, mergeBackupIntoLibrary, parseLibraryBackup } from './backup.ts';
import { createBook } from './library.ts';
import { emptyVersionLedger } from './versions.ts';
import { sequenceIds } from './uid.ts';

test('backup round-trip merges books and versions', () => {
  const ids = sequenceIds('b');
  let library = createBook({ version: 2, activeBookId: 'x', series: [], books: [] }, ids(), 'One');
  const bookId = library.activeBookId;
  library = createBook(library, ids(), 'Two');
  const backup = buildLibraryBackup({
    library,
    bookIds: [bookId],
    versions: emptyVersionLedger(),
    exportedAt: new Date().toISOString(),
  });
  const raw = JSON.stringify(backup);
  const parsed = parseLibraryBackup(raw);
  assert.equal(parsed.books.length, 1);
  const empty = createBook({ version: 2, activeBookId: 'z', series: [], books: [] }, ids(), 'Other');
  const merged = mergeBackupIntoLibrary(empty, parsed, emptyVersionLedger());
  assert.equal(merged.library.books.length, 2);
  assert.ok(merged.library.books.some((b) => b.id === bookId));
});
