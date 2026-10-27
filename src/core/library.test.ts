import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assignSeriesToBook, createBook, ensureBookEpubUuid, groupLibraryBooks, saveBookEpubChoices, seriesMembershipLabel } from './library.ts';
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

test('the epub id is minted once and later downloads keep it', () => {
  const ids = sequenceIds('id');
  let library = createBook({ version: 2, activeBookId: 'x', series: [], books: [] }, ids(), 'Harbor');
  const bookId = library.activeBookId;
  const first = ensureBookEpubUuid(library, bookId);
  const second = ensureBookEpubUuid(first.library, bookId);
  assert.equal(second.uuid, first.uuid);
  assert.equal(second.library, first.library);
  assert.match(first.uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  library = saveBookEpubChoices(first.library, bookId, {
    author: 'Ada Harbor',
    language: 'en-us',
    isbn: '978-0-306-40615-7',
    chapterPageBreaks: false,
    paragraphStyle: 'spacing',
    textAlign: 'justify',
    bodySize: 'large',
  });
  const book = library.books[0]!;
  assert.equal(book.epubUuid, first.uuid);
  assert.equal(book.epubAuthor, 'Ada Harbor');
  assert.equal(book.epubLanguage, 'en-US');
  assert.equal(book.epubIsbn, '9780306406157');
  assert.equal(book.epubChapterBreaks, false);
  assert.equal(book.epubParagraphStyle, 'spacing');
  assert.equal(book.epubTextAlign, 'justify');
  assert.equal(book.epubBodySize, 'large');
  const kept = saveBookEpubChoices(library, bookId, {
    author: 'Ada Harbor',
    language: 'not-a-tag',
    isbn: '123',
    chapterPageBreaks: true,
    paragraphStyle: 'indent',
    textAlign: 'left',
    bodySize: 'small',
  });
  assert.equal(kept.books[0]!.epubLanguage, 'en-US');
  assert.equal(kept.books[0]!.epubIsbn, '9780306406157');
  assert.equal(kept.books[0]!.epubUuid, first.uuid);
  const cleared = saveBookEpubChoices(kept, bookId, {
    author: '',
    language: 'fr',
    isbn: '',
    chapterPageBreaks: true,
    paragraphStyle: 'indent',
    textAlign: 'left',
    bodySize: 'medium',
  });
  assert.equal(cleared.books[0]!.epubAuthor, undefined);
  assert.equal(cleared.books[0]!.epubIsbn, undefined);
  assert.equal(cleared.books[0]!.epubLanguage, 'fr');
  assert.equal(cleared.books[0]!.epubUuid, first.uuid);
});
