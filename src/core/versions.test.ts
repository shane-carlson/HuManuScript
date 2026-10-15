import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyDocument } from './document.ts';
import { pushVersion, restoreBookVersion, emptyVersionLedger } from './versions.ts';
import { sequenceIds } from './uid.ts';

test('restore saves guard snapshot then returns target document', () => {
  const ids = sequenceIds('v');
  const bookId = 'book-1';
  let ledger = emptyVersionLedger();
  const v1 = emptyDocument(bookId);
  v1.title = 'First';
  ledger = pushVersion(ledger, {
    bookId,
    document: v1,
    label: 'Draft A',
    kind: 'manual',
    id: ids(),
  });
  const current = emptyDocument(bookId);
  current.title = 'Current';
  const restored = restoreBookVersion(ledger, bookId, ledger.byBookId[bookId]![0]!.id, current, ids);
  assert.ok(restored);
  assert.equal(restored!.document.title, 'First');
  assert.equal(restored!.ledger.byBookId[bookId]!.length, 2);
  assert.equal(restored!.ledger.byBookId[bookId]![0]!.kind, 'restore-guard');
  assert.equal(restored!.ledger.byBookId[bookId]![0]!.document.title, 'Current');
});
