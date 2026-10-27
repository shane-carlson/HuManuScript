import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyDocument } from './document.ts';
import { emptyBlock } from './manuscript.ts';
import { layoutPublication, otherBindingSizes, packPublication, publicationFormat, PUBLICATION_FORMATS, wordsForPage, type PublicationNode } from './publication.ts';
import type { ManuscriptBlock } from './types.ts';

function book(blocks: ManuscriptBlock[], title = 'Harbor Light') {
  return { ...emptyDocument('book-1'), title, blocks };
}

function words(count: number): string {
  return Array.from({ length: count }, (_, index) => `word${index + 1}`).join(' ');
}

function proseWords(page: { nodes: Array<{ kind: string; text?: string }> }): number {
  return page.nodes.reduce((sum, node) => {
    if ((node.kind === 'paragraph' || node.kind === 'blockquote') && node.text) {
      return sum + node.text.trim().split(/\s+/).length;
    }
    return sum;
  }, 0);
}

test('publication formats cover print books and fixed reader pages', () => {
  assert.deepEqual(PUBLICATION_FORMATS.filter((format) => format.button).map((format) => format.id), [
    'trade',
    'hardcover',
    'mass-market',
    'ereader',
    'tablet',
  ]);
  assert.deepEqual(otherBindingSizes('paperback').map((format) => format.trim), [
    '5 × 8 in',
    '5.25 × 8 in',
    '5.5 × 8.5 in',
    '6.14 × 9.21 in',
    '7 × 10 in',
  ]);
  assert.deepEqual(otherBindingSizes('hardcover').map((format) => format.trim), [
    '5.5 × 8.5 in',
    '6 × 9 in',
    '6.14 × 9.21 in',
    '7 × 10 in',
    '8.5 × 11 in',
  ]);
  assert.equal(publicationFormat('nope').id, 'trade');
  assert.equal(publicationFormat('paperback-5x8').widthIn, 5);
  assert.equal(publicationFormat('paperback-5x8').heightIn, 8);
  assert.equal(publicationFormat('hardcover-8-5x11').widthIn, 8.5);
  assert.equal(publicationFormat('hardcover-8-5x11').heightIn, 11);
  assert.equal(publicationFormat('ereader').kind, 'reader');
  assert.equal(publicationFormat('tablet').widthIn, 6);
  assert.equal(publicationFormat('tablet').heightIn, 8);
  assert.ok(publicationFormat('mass-market').marginXIn < publicationFormat('trade').marginXIn);
  assert.ok(publicationFormat('mass-market').marginXIn <= 0.5);
  assert.ok(otherBindingSizes('paperback').every((format) => format.wordsPerPage >= 40));
  assert.ok(otherBindingSizes('hardcover').every((format) => format.wordsPerPage >= 40));
  assert.ok(wordsForPage(publicationFormat('ereader'), 26) < wordsForPage(publicationFormat('ereader'), 13));
});

test('each chapter starts on a new page, and a short last page stays short', () => {
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
  const text = layout.pages.filter((page) => page.kind === 'text');
  assert.equal(text.length, 2);
  assert.deepEqual(text[0]?.nodes.map((node) => node.kind), ['chapter', 'paragraph']);
  assert.deepEqual(text[1]?.nodes.map((node) => node.kind), ['chapter', 'paragraph']);
  assert.equal(text[0]?.header, 'The Dock');
  assert.equal(text[1]?.header, 'Harbor Light');
  assert.ok(proseWords(text[0]!) < 20);
  if (text[1]?.nodes[1]?.kind === 'paragraph') assert.equal(text[1].nodes[1].text, 'She kept walking.');
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

test('a long chapter flows onto the next page of the same size', () => {
  const format = { ...publicationFormat('mass-market'), wordsPerPage: 40 };
  const doc = book([
    { ...emptyBlock('chapter', 'c1'), title: 'Crowded' },
    { ...emptyBlock('paragraph', 'p1'), text: words(20) },
    { ...emptyBlock('paragraph', 'p2'), text: words(20) },
    { ...emptyBlock('paragraph', 'p3'), text: words(20) },
    { ...emptyBlock('paragraph', 'p4'), text: words(20) },
  ]);
  const pages = layoutPublication(doc, format).pages.filter((page) => page.kind === 'text');
  assert.ok(pages.length >= 3);
  assert.equal(pages[0]?.nodes[0]?.kind, 'chapter');
  assert.equal(pages[1]?.nodes[0]?.kind, 'paragraph');
  assert.equal(pages.find((page) => page.number != null && page.number % 2 === 1 && page.nodes.some((node) => node.kind === 'paragraph'))?.header, 'Crowded');
  for (const page of pages) assert.ok(proseWords(page) <= format.wordsPerPage);
});

test('an e-reader turns fixed pages and keeps lists, quotes, and scene breaks', () => {
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
    { ...emptyBlock('paragraph', 'p5'), text: words(80) },
  ], '');
  const layout = layoutPublication(doc, publicationFormat('ereader'), { bookTitle: 'Harbor Light' });
  const text = layout.pages.filter((page) => page.kind === 'text');
  assert.ok(text.length >= 2);
  assert.equal(layout.pages.some((page) => page.kind === 'screen'), false);
  const kinds = text.flatMap((page) => page.nodes.map((node) => node.kind));
  assert.ok(kinds.includes('chapter'));
  assert.ok(kinds.includes('ornament'));
  assert.ok(kinds.includes('blockquote'));
  const numbered = text.flatMap((page) => page.nodes).filter((node) => node.kind === 'paragraph' && node.listIndex);
  assert.deepEqual(numbered.map((node) => node.kind === 'paragraph' ? node.listIndex : null), [1, 2]);
  const limit = wordsForPage(publicationFormat('ereader'));
  for (const page of text) assert.ok(proseWords(page) <= limit);
});

test('a full page takes text up to the budget, then the next chapter opens on its own page', () => {
  const format = { ...publicationFormat('trade'), wordsPerPage: 100 };
  const doc = book([
    { ...emptyBlock('chapter', 'c1'), title: 'One' },
    { ...emptyBlock('paragraph', 'p1'), text: words(80) },
    { ...emptyBlock('chapter', 'c2'), title: 'Two' },
    { ...emptyBlock('paragraph', 'p2'), text: 'End.' },
  ]);
  const pages = layoutPublication(doc, format).pages.filter((page) => page.kind === 'text');
  assert.equal(pages[0]?.nodes[0]?.kind, 'chapter');
  assert.equal(proseWords(pages[0]!), 64);
  assert.equal(proseWords(pages[1]!), 16);
  assert.equal(pages[1]?.nodes.some((node) => node.kind === 'chapter'), false);
  assert.equal(pages[2]?.nodes[0]?.kind, 'chapter');
  if (pages[2]?.nodes[0]?.kind === 'chapter') assert.equal(pages[2].nodes[0].title, 'Two');
});

test('measured lines fill the page except the short close of a chapter', () => {
  const format = publicationFormat('trade');
  const doc = book([
    { ...emptyBlock('chapter', 'c1'), title: 'Harbor' },
    { ...emptyBlock('paragraph', 'p1'), text: words(250) },
    { ...emptyBlock('chapter', 'c2'), title: 'Road' },
    { ...emptyBlock('paragraph', 'p2'), text: 'She kept walking.' },
  ]);
  const wordsPerLine = 10;
  const maxLines = 20;
  const lines = (node: PublicationNode) => {
    if (node.kind === 'chapter') return 3;
    if (node.kind === 'paragraph' || node.kind === 'blockquote') {
      const count = node.text.trim() ? node.text.trim().split(/\s+/).length : 0;
      return Math.ceil(count / wordsPerLine);
    }
    return 1;
  };
  const layout = packPublication(doc, format, undefined, (nodes) => {
    const used = nodes.reduce((sum, node) => sum + lines(node), 0);
    return used <= maxLines;
  });
  const pages = layout.pages.filter((page) => page.kind === 'text');
  assert.ok(pages.length >= 3);
  const nextChapter = pages.findIndex((page) => page.nodes[0]?.kind === 'chapter' && page !== pages[0]);
  assert.ok(nextChapter > 1);
  for (const page of pages.slice(0, nextChapter)) {
    const used = page.nodes.reduce((sum, node) => sum + lines(node), 0);
    const lastOfChapter = page === pages[nextChapter - 1];
    if (lastOfChapter) assert.ok(used < maxLines);
    else assert.equal(used, maxLines);
  }
  assert.equal(pages[nextChapter]?.nodes[0]?.kind, 'chapter');
  assert.equal(pages[nextChapter]?.nodes.some((node) => node.kind === 'paragraph' && node.text === 'She kept walking.'), true);
});

test('a split paragraph keeps every word and does not repeat a list number', () => {
  const format = { ...publicationFormat('ereader'), wordsPerPage: 20 };
  const doc = book([
    { ...emptyBlock('paragraph', 'p'), text: words(45), listStyle: 'number' },
  ]);
  const pages = layoutPublication(doc, format).pages.filter((page) => page.kind === 'text');
  const paras = pages.flatMap((page) => page.nodes).filter((node) => node.kind === 'paragraph');
  assert.equal(paras.map((node) => node.kind === 'paragraph' ? node.text : '').join(' '), words(45));
  assert.equal(paras[0]?.kind === 'paragraph' ? paras[0].listIndex : null, 1);
  assert.equal(paras[1]?.kind === 'paragraph' ? paras[1].continued : null, true);
  assert.equal(paras[1]?.kind === 'paragraph' ? paras[1].listStyle : null, null);
  assert.equal(paras.at(-1)?.kind === 'paragraph' ? paras.at(-1)?.continued : null, true);
});

test('an empty manuscript is one title page in print and on a reader', () => {
  const doc = book([]);
  const print = layoutPublication(doc, publicationFormat('trade'));
  assert.equal(print.pages.length, 1);
  assert.equal(print.pages[0]?.nodes[0]?.kind, 'note');
  const reader = layoutPublication(doc, publicationFormat('tablet'));
  assert.equal(reader.pages.length, 1);
  assert.equal(reader.pages[0]?.kind, 'title');
  assert.equal(reader.pages[0]?.nodes[0]?.kind, 'note');
});
