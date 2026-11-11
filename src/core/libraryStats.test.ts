import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyDocument } from './document.ts';
import type { Book, Library } from './library.ts';
import { libraryWritingStats } from './libraryStats.ts';
import type { ManuscriptBlock } from './types.ts';

function prose(id: string, text: string, type: ManuscriptBlock['type'] = 'paragraph'): ManuscriptBlock {
  return { id, type, title: '', text: type === 'paragraph' ? text : '', marks: [] };
}

function book(id: string, title: string, blocks: ManuscriptBlock[], series?: { id: string; number: number }): Book {
  return {
    id,
    title,
    document: { ...emptyDocument(id), title, blocks },
    ...(series ? { seriesId: series.id, seriesBookNumber: series.number } : {}),
  };
}

test('library stats total every book and split series from standalone', () => {
  const library: Library = {
    version: 2,
    activeBookId: 'harbor-1',
    series: [{ id: 'harbor', name: 'Harbor Saga' }],
    books: [
      book('harbor-1', 'Tide', [prose('c1', 'One', 'chapter'), prose('p1', 'alpha beta')], { id: 'harbor', number: 2 }),
      book('harbor-2', 'Moon', [prose('c2', 'Two', 'chapter'), prose('p2', 'gamma delta epsilon')], { id: 'harbor', number: 1 }),
      book('alone', 'Notes', [prose('p3', 'solo line here')]),
    ],
  };

  const stats = libraryWritingStats(library);
  assert.equal(stats.totals.books, 3);
  assert.equal(stats.totals.words, 2 + 3 + 3);
  assert.equal(stats.totals.chapters, 2);
  assert.equal(stats.totals.certified, 0);
  assert.equal(stats.totals.uncertified, stats.totals.words);

  assert.equal(stats.series.length, 1);
  assert.equal(stats.series[0]!.name, 'Harbor Saga');
  assert.deepEqual(stats.series[0]!.books.map((item) => item.title), ['Moon', 'Tide']);
  assert.equal(stats.series[0]!.counts.books, 2);
  assert.equal(stats.series[0]!.counts.words, 5);
  assert.equal(stats.series[0]!.counts.chapters, 2);
  assert.equal(stats.series[0]!.books[0]!.seriesLabel, 'Book 1 of Harbor Saga');

  assert.equal(stats.standalone.length, 1);
  assert.equal(stats.standalone[0]!.title, 'Notes');
  assert.equal(stats.standalone[0]!.counts.words, 3);
  assert.equal(stats.standalone[0]!.seriesLabel, null);
  assert.equal(stats.standaloneCounts.books, 1);
  assert.equal(stats.standaloneCounts.words, 3);
});
