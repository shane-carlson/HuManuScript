import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyDocument, type ManuscriptDocument } from './document.ts';
import { checkEpub } from './epubCheck.ts';
import { type EpubBuildOptions } from './epubExport.ts';
import type { ManuscriptBlock } from './types.ts';

const now = '2026-10-14T18:00:00.000Z';
const uuid = '123e4567-e89b-42d3-a456-426614174000';

function block(id: string, partial: Partial<ManuscriptBlock> & Pick<ManuscriptBlock, 'type'>): ManuscriptBlock {
  return { id, title: '', text: '', marks: [], ...partial };
}

function doc(): ManuscriptDocument {
  return {
    ...emptyDocument('m'),
    title: 'Harbor Light',
    blocks: [
      block('c', { type: 'chapter', title: 'Opening' }),
      block('p', { type: 'paragraph', text: 'Before the break' }),
    ],
  };
}

function options(over: Partial<EpubBuildOptions> = {}): EpubBuildOptions {
  return {
    author: 'Ada Harbor',
    language: 'en',
    isbn: '',
    epubUuid: uuid,
    cover: null,
    chapterPageBreaks: true,
    paragraphStyle: 'indent',
    textAlign: 'left',
    bodySize: 'medium',
    seriesLine: '',
    subtitle: '',
    imprint: '',
    copyrightYear: null,
    copyrightHolder: '',
    rightsLine: '',
    disclaimer: '',
    edition: '',
    dedication: '',
    epigraph: '',
    epigraphAttribution: '',
    alsoBy: [],
    aboutAuthor: '',
    includePublicationPages: false,
    ...over,
  };
}

test('a ready ebook reports no errors and warns when the cover is missing', async () => {
  const findings = await checkEpub({ doc: doc(), options: options(), paperbackIsbn: '', hardcoverIsbn: '' }, now);
  assert.deepEqual(findings.filter((item) => item.severity === 'error').map((item) => item.code), []);
  assert.ok(findings.some((item) => item.code === 'cover-missing' && item.focus === 'cover'));
  assert.match(findings.find((item) => item.code === 'cover-missing')?.fix ?? '', /cover/i);
});

test('missing author and copyright year are named in plain language', async () => {
  const findings = await checkEpub({
    doc: doc(),
    options: options({ author: ' ', includePublicationPages: true, copyrightYear: null }),
    paperbackIsbn: '9781861972713',
    hardcoverIsbn: '',
  }, now);
  const author = findings.find((item) => item.code === 'author-missing');
  const year = findings.find((item) => item.code === 'year-missing');
  const paperback = findings.find((item) => item.code === 'paperback-isbn-invalid');
  assert.equal(author?.focus, 'author');
  assert.match(author?.title ?? '', /author/i);
  assert.match(author?.fix ?? '', /Author/);
  assert.equal(year?.focus, 'copyright-year');
  assert.match(year?.detail ?? '', /year/i);
  assert.equal(paperback?.severity, 'error');
  assert.match(paperback?.detail ?? '', /not written into the EPUB/);
});

test('publication pages pass the local checks and a bad print isbn does not while the switch is off', async () => {
  const on = await checkEpub({
    doc: doc(),
    options: options({ includePublicationPages: true, copyrightYear: 2026, isbn: '9780306406157', dedication: 'For the harbor cats' }),
    paperbackIsbn: '9781861972712',
    hardcoverIsbn: '',
  }, now);
  assert.deepEqual(on.filter((item) => item.severity === 'error').map((item) => item.code), []);

  const off = await checkEpub({
    doc: doc(),
    options: options(),
    paperbackIsbn: '9781861972713',
    hardcoverIsbn: '',
  }, now);
  assert.equal(off.find((item) => item.code === 'paperback-isbn-invalid')?.severity, 'warning');
  assert.equal(off.some((item) => item.severity === 'error'), false);
});
