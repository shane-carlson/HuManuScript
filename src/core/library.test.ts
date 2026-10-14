import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assignSeriesToBook, createBook, groupLibraryBooks, seriesMembershipLabel } from './library.ts';
import { emptyDocument } from './document.ts';
import { sequenceIds } from './uid.ts';

test('groups books under series headings', () => {
  const ids = sequenceIds('id');
  const docA = emptyDocument(ids());
  const docB = emptyDocument(ids());
  const seriesId = 'ser-1';
  const books = [
    { id: 'b1', title: 'Book One', seriesId, seriesBookNumber: 1, document: docA },
    { id: 'b2', title: 'Book Two', seriesId, seriesBookNumber: 2, document: docB },
    { id: 'b3', title: 'Standalone', document: emptyDocument(ids()) },
  ];
  const groups = groupLibraryBooks(books, [{ id: seriesId, name: 'The Cycle' }]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0]!.heading, 'The Cycle');
  assert.equal(groups[0]!.books.length, 2);
  assert.equal(groups[1]!.heading, null);
  assert.equal(groups[1]!.books[0]!.id, 'b3');
});

test('assignSeriesToBook creates or reuses a series by name', () => {
  const ids = sequenceIds('id');
  let library = createBook(
    { version: 2, activeBookId: 'x', series: [], books: [] },
    ids(),
    'First',
  );
  const bookId = library.activeBookId;
  library = assignSeriesToBook(library, bookId, 'Harbor Saga', ids);
  assert.equal(library.series.length, 1);
  assert.equal(library.books[0]!.seriesId, library.series[0]!.id);
  assert.equal(
    seriesMembershipLabel(library.books[0]!, 'Harbor Saga'),
    'Harbor Saga',
  );
});
