import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyDocument } from './document.ts';
import { emptyBlock } from './manuscript.ts';
import { layoutPublication, publicationFormat, PUBLICATION_FORMATS } from './publication.ts';
import type { ManuscriptBlock } from './types.ts';

function book(blocks: ManuscriptBlock[], title = 'Harbor Light') {
  return { ...emptyDocument('book-1'), title, blocks };
}

function words(count: number): string {
  return Array.from({ length: count }, (_, index) => `word${index + 1}`).join(' ');
}

test('publication formats cover print books and reflowing readers', () => {
  assert.deepEqual(PUBLICATION_FORMATS.map((format) => format.id), [
    'trade',
    'hardcover',
    'mass-market',
    'ereader',
    'tablet',
  ]);
  assert.equal(publicationFormat('nope').id, 'trade');
  assert.equal(publicationFormat('ereader').kind, 'reflow');
});

test('a trade paperback opens on a title page and starts each chapter on its own page', () => {
  const doc = book([
    { ...emptyBlock('chapter', 'c1'), title: 'The Dock' },
    { ...emptyBlock('paragraph', 'p1'), text: 'The lamp was lit.' },
    { ...emptyBlock('chapter', 'c2'), title: 'The Road' },
    { ...emptyBlock('paragraph', 'p2'), text: 'She kept walking.' },
  ]);
  const layout = layoutPublication(doc, publicationFormat('trade'), {
    bookTitle: 'Harbor Light',
    seriesLabel: 'Book 2 of Harbor Saga',
  });
  assert.equal(layout.pages[0]?.kind, 'title');
  assert.equal(layout.pages[0]?.title, 'Harbor Light');
  assert.equal(layout.pages[0]?.seriesLabel, 'Book 2 of Harbor Saga');
  assert.equal(layout.pages[0]?.number, null);
  assert.equal(layout.pages.length, 3);
  assert.equal(layout.pages[1]?.number, 1);
  assert.equal(layout.pages[1]?.header, 'The Dock');
  assert.equal(layout.pages[1]?.nodes[0]?.kind, 'chapter');
  assert.equal(layout.pages[2]?.number, 2);
  assert.equal(layout.pages[2]?.header, 'Harbor Light');
  assert.equal(layout.pages[2]?.nodes[0]?.kind, 'chapter');
});

test('a page break starts the next prose on a new page and does not add a blank sheet', () => {
  const doc = book([
    { ...emptyBlock('chapter', 'c1'), title: 'One' },
    { ...emptyBlock('paragraph', 'p1'), text: 'Before the break.' },
    emptyBlock('pageBreak', 'b1'),
    emptyBlock('pageBreak', 'b2'),
    { ...emptyBlock('paragraph', 'p2'), text: 'After the break.' },
  ]);
  const pages = layoutPublication(doc, publicationFormat('hardcover')).pages.filter((page) => page.kind === 'text');
  assert.equal(pages.length, 2);
  assert.equal(pages[0]?.nodes.at(-1)?.kind, 'paragraph');
  assert.equal(pages[1]?.nodes[0]?.kind, 'paragraph');
  if (pages[1]?.nodes[0]?.kind === 'paragraph') assert.equal(pages[1].nodes[0].text, 'After the break.');
});

test('body text continues on the next page once the print page is full', () => {
  const format = { ...publicationFormat('mass-market'), wordsPerPage: 25 };
  const doc = book([
    { ...emptyBlock('chapter', 'c1'), title: 'Crowded' },
    { ...emptyBlock('paragraph', 'p1'), text: words(10) },
    { ...emptyBlock('paragraph', 'p2'), text: words(10) },
    { ...emptyBlock('paragraph', 'p3'), text: words(10) },
    { ...emptyBlock('paragraph', 'p4'), text: words(10) },
    { ...emptyBlock('paragraph', 'p5'), text: words(10) },
  ]);
  const pages = layoutPublication(doc, format).pages.filter((page) => page.kind === 'text');
  assert.equal(pages.length, 3);
  const firstParas = pages[0]?.nodes.filter((node) => node.kind === 'paragraph');
  const secondParas = pages[1]?.nodes.filter((node) => node.kind === 'paragraph');
  assert.equal(firstParas?.length, 2);
  assert.equal(secondParas?.length, 2);
  assert.equal(pages[0]?.nodes[0]?.kind, 'chapter');
  assert.equal(pages[1]?.header, 'Harbor Light');
  assert.equal(pages[2]?.header, 'Crowded');
});

test('an e-reader keeps chapters, scene breaks, lists, and quotes in one reflow', () => {
  const doc = book([
    { ...emptyBlock('chapter', 'c1'), title: 'Open' },
    { ...emptyBlock('paragraph', 'p1'), text: 'First line.', marks: [{ kind: 'italic', start: 0, end: 5 }] },
    { ...emptyBlock('paragraph', 'p2'), text: 'A bullet.', listStyle: 'bullet' },
    { ...emptyBlock('paragraph', 'p3'), text: 'Item one.', listStyle: 'number' },
    { ...emptyBlock('paragraph', 'p4'), text: 'Item two.', listStyle: 'number' },
    emptyBlock('scene', 's1'),
    { ...emptyBlock('blockquote', 'q1'), text: 'A quoted line.' },
    emptyBlock('pageBreak', 'b1'),
    { ...emptyBlock('chapter', 'c2'), title: 'Later' },
    { ...emptyBlock('paragraph', 'p5'), text: 'Second chapter.' },
  ], '');
  const layout = layoutPublication(doc, publicationFormat('ereader'), { bookTitle: 'Harbor Light' });
  assert.equal(layout.pages.length, 1);
  assert.equal(layout.pages[0]?.kind, 'screen');
  const kinds = layout.pages[0]?.nodes.map((node) => node.kind);
  assert.deepEqual(kinds, ['chapter', 'paragraph', 'paragraph', 'paragraph', 'paragraph', 'ornament', 'blockquote', 'gap', 'chapter', 'paragraph']);
  const numbered = layout.pages[0]?.nodes.filter((node) => node.kind === 'paragraph' && node.listIndex);
  assert.deepEqual(numbered?.map((node) => node.kind === 'paragraph' ? node.listIndex : null), [1, 2]);
});

test('an empty manuscript is a title page, or one empty reader', () => {
  const doc = book([]);
  const print = layoutPublication(doc, publicationFormat('trade'));
  assert.equal(print.pages.length, 1);
  assert.equal(print.pages[0]?.nodes[0]?.kind, 'note');
  const reader = layoutPublication(doc, publicationFormat('tablet'));
  assert.equal(reader.pages.length, 1);
  assert.equal(reader.pages[0]?.kind, 'screen');
  assert.equal(reader.pages[0]?.nodes[0]?.kind, 'note');
});
