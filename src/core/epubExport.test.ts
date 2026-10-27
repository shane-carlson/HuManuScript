import assert from 'node:assert/strict';
import { test } from 'node:test';
import JSZip from 'jszip';
import { emptyDocument, type ManuscriptDocument } from './document.ts';
import {
  buildEpubBlob,
  EpubExportError,
  epubStylesheet,
  type EpubBuildOptions,
} from './epubExport.ts';
import { exportManuscriptBlob } from './exportManuscript.ts';
import { createBook, ensureBookEpubUuid } from './library.ts';
import { loadLibrary, saveLibrary } from '../storage.ts';
import type { ManuscriptBlock } from './types.ts';
import { setManuscriptTypography } from './typography.ts';
import { sequenceIds } from './uid.ts';

const now = '2026-10-14T18:00:00.000Z';
const uuid = '123e4567-e89b-42d3-a456-426614174000';

function pngBytes(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(26);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  bytes[11] = 13;
  bytes.set([73, 72, 68, 82], 12);
  bytes[16] = (width >>> 24) & 255;
  bytes[17] = (width >>> 16) & 255;
  bytes[18] = (width >>> 8) & 255;
  bytes[19] = width & 255;
  bytes[20] = (height >>> 24) & 255;
  bytes[21] = (height >>> 16) & 255;
  bytes[22] = (height >>> 8) & 255;
  bytes[23] = height & 255;
  bytes[24] = 8;
  bytes[25] = 2;
  return bytes;
}

function block(id: string, partial: Partial<ManuscriptBlock> & Pick<ManuscriptBlock, 'type'>): ManuscriptBlock {
  return { id, title: '', text: '', marks: [], ...partial };
}

function sample(): ManuscriptDocument {
  const ids = sequenceIds('b');
  const png = `data:image/png;base64,${Buffer.from(pngBytes(1, 1)).toString('base64')}`;
  const doc: ManuscriptDocument = {
    ...emptyDocument(ids()),
    title: 'Harbor Light',
    blocks: [
      block(ids(), { type: 'chapter', title: 'Opening' }),
      block(ids(), { type: 'paragraph', text: 'Before the break' }),
      block(ids(), { type: 'paragraph', text: 'Bold sea', marks: [{ kind: 'bold', start: 0, end: 4 }] }),
      block(ids(), { type: 'paragraph', text: 'First', listStyle: 'bullet' }),
      block(ids(), { type: 'paragraph', text: 'Second', listStyle: 'bullet' }),
      block(ids(), { type: 'paragraph', text: 'One', listStyle: 'number' }),
      block(ids(), { type: 'section', title: 'The dock' }),
      block(ids(), { type: 'scene' }),
      block(ids(), { type: 'blockquote', text: 'A quoted line' }),
      block(ids(), { type: 'divider', dividerStyle: 'line' }),
      block(ids(), { type: 'pageBreak' }),
      block(ids(), { type: 'table', tableRows: [['Name', 'Role'], ['Ada', 'Pilot']] }),
      block(ids(), { type: 'image', imageSrc: png, imageAlt: 'Harbor chart', imageCaption: 'Chart of the harbor' }),
      block(ids(), { type: 'chapter', title: 'Second watch' }),
      block(ids(), { type: 'paragraph', text: 'After the chapter' }),
    ],
  };
  return setManuscriptTypography(doc, { fontFamily: 'times', fontSize: 18 });
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

async function unzip(blob: Blob): Promise<JSZip> {
  return JSZip.loadAsync(Buffer.from(await blob.arrayBuffer()));
}

function assertStoredMimetype(buf: Buffer) {
  assert.equal(buf.readUInt32LE(0), 0x04034b50);
  assert.equal(buf.readUInt16LE(8), 0, 'mimetype must be stored, not deflated');
  const nameLen = buf.readUInt16LE(26);
  const extraLen = buf.readUInt16LE(28);
  assert.equal(buf.subarray(30, 30 + nameLen).toString('utf8'), 'mimetype');
  const start = 30 + nameLen + extraLen;
  assert.equal(buf.subarray(start, start + 20).toString('utf8'), 'application/epub+zip');
}

test('epub is a stored-mimetype epub 3 with no certification page and no embedded font', async () => {
  const blob = await buildEpubBlob(sample(), options(), now);
  const buf = Buffer.from(await blob.arrayBuffer());
  assertStoredMimetype(buf);
  const zip = await JSZip.loadAsync(buf);
  assert.equal(Object.keys(zip.files)[0], 'mimetype');
  assert.equal(await zip.file('mimetype')!.async('string'), 'application/epub+zip');
  const opf = await zip.file('OEBPS/content.opf')!.async('string');
  const nav = await zip.file('OEBPS/nav.xhtml')!.async('string');
  const ncx = await zip.file('OEBPS/toc.ncx')!.async('string');
  const css = await zip.file('OEBPS/style.css')!.async('string');
  const ch1 = await zip.file('OEBPS/ch-0001.xhtml')!.async('string');
  const ch2 = await zip.file('OEBPS/ch-0002.xhtml')!.async('string');
  const joined = [opf, nav, ncx, css, ch1, ch2].join('\n');

  assert.match(opf, /version="3\.0"/);
  assert.match(opf, /unique-identifier="book-id"/);
  assert.equal(opf.match(/<dc:title>/g)?.length, 1);
  assert.match(opf, /<dc:title>Harbor Light<\/dc:title>/);
  assert.match(opf, /<dc:language>en<\/dc:language>/);
  assert.match(opf, /<dc:creator id="creator">Ada Harbor<\/dc:creator>/);
  assert.match(opf, /<dc:identifier id="book-id">urn:uuid:123e4567-e89b-42d3-a456-426614174000<\/dc:identifier>/);
  assert.match(opf, /<meta property="dcterms:modified">2026-10-14T18:00:00Z<\/meta>/);
  assert.equal(opf.includes('dc:publisher'), false);
  assert.equal(opf.includes('identifier-type'), false);
  assert.match(opf, /properties="nav"/);
  assert.match(opf, /<itemref idref="nav"\/>/);
  assert.equal(opf.includes('cover'), false);
  assert.match(ncx, /content="urn:uuid:123e4567-e89b-42d3-a456-426614174000"/);

  assert.match(nav, /epub:type="toc"/);
  assert.match(nav, /<a href="ch-0001.xhtml">Opening<\/a>/);
  assert.match(nav, /<a href="ch-0001.xhtml#sec-1">The dock<\/a>/);
  assert.match(nav, /<a href="ch-0002.xhtml">Second watch<\/a>/);
  assert.equal(nav.includes('* * *'), false);
  assert.equal(ncx.includes('* * *'), false);
  assert.match(ncx, /<text>Opening<\/text>/);
  assert.match(ncx, /<text>The dock<\/text>/);
  assert.match(ncx, /src="ch-0001.xhtml#sec-1"/);

  assert.equal(ch1.includes('chapter-break'), false);
  assert.match(ch2, /class="chapter-break"/);
  assert.match(ch1, /<hr class="page-break"\/>/);
  assert.match(ch1, /<strong>Bold<\/strong>/);
  assert.match(ch1, /<ul><li>First<\/li><li>Second<\/li><\/ul>/);
  assert.match(ch1, /<ol><li>One<\/li><\/ol>/);
  assert.match(ch1, /<p class="scene">\* \* \*<\/p>/);
  assert.match(ch1, /<blockquote><p>A quoted line<\/p><\/blockquote>/);
  assert.match(ch1, /<hr class="scene-rule"\/>/);
  assert.match(ch1, /<th>Name<\/th>/);
  assert.match(ch1, /<td>Ada<\/td>/);
  assert.match(ch1, /alt="Harbor chart"/);
  assert.match(ch1, /<figcaption>Chart of the harbor<\/figcaption>/);
  assert.ok(zip.file('OEBPS/images/img-001.png'));
  assert.match(ch2, /After the chapter/);
  assert.match(ch1, /epub:type="bodymatter"/);
  assert.equal(ch2.includes('bodymatter'), false);

  assert.match(css, /font-size:\s*1em/);
  assert.match(css, /text-indent:\s*1\.5em/);
  assert.match(css, /text-align:\s*left/);
  assert.match(css, /h1, h2 \{\s*text-align: left/);
  assert.match(css, /break-before:\s*page/);
  assert.equal(css.includes('position'), false);
  assert.equal(css.includes('line-height'), false);
  assert.equal(css.includes('font-family'), false);
  assert.equal(css.includes('@font-face'), false);
  assert.equal(css.includes('18pt'), false);
  assert.doesNotMatch(css, /margin(?:-[a-z]+)?\s*:\s*-/);
  assert.equal(joined.includes('Times New Roman'), false);
  assert.equal(joined.includes('.ttf'), false);
  assert.equal(joined.includes('<script'), false);
  assert.equal(joined.includes('HuManuScript certification summary'), false);
  assert.equal(zip.file('OEBPS/certification.xhtml'), null);
});

test('the same stored uuid is the identifier on every build, and an isbn replaces it', async () => {
  const doc = sample();
  const first = await unzip(await buildEpubBlob(doc, options(), now));
  const second = await unzip(await buildEpubBlob(doc, options(), '2026-11-01T00:00:00.000Z'));
  const id = (zip: JSZip) => zip.file('OEBPS/content.opf')!.async('string');
  const a = await id(first);
  const b = await id(second);
  assert.match(a, /urn:uuid:123e4567-e89b-42d3-a456-426614174000/);
  assert.match(b, /urn:uuid:123e4567-e89b-42d3-a456-426614174000/);
  const withIsbn = await unzip(await buildEpubBlob(doc, options({ isbn: '978-0-306-40615-7', language: 'en-us' }), now));
  const opf = await withIsbn.file('OEBPS/content.opf')!.async('string');
  const ncx = await withIsbn.file('OEBPS/toc.ncx')!.async('string');
  assert.match(opf, /<dc:identifier id="book-id">9780306406157<\/dc:identifier>/);
  assert.match(opf, /scheme="onix:codelist5">15<\/meta>/);
  assert.match(opf, /<dc:language>en-US<\/dc:language>/);
  assert.equal(opf.includes('urn:uuid'), false);
  assert.match(ncx, /content="9780306406157"/);
});

test('formatting choices change the stylesheet and chapter breaks, not the manuscript font', async () => {
  const css = epubStylesheet({ paragraphStyle: 'spacing', textAlign: 'justify', bodySize: 'large' });
  assert.match(css, /font-size:\s*1\.15em/);
  assert.match(css, /text-indent:\s*0/);
  assert.match(css, /margin:\s*0 0 0\.75em 0/);
  assert.doesNotMatch(css, /text-indent:\s*1\.5em/);
  assert.match(css, /text-align:\s*justify/);
  assert.match(css, /h1, h2 \{\s*text-align: left/);
  assert.equal(css.includes('position'), false);
  const small = epubStylesheet({ paragraphStyle: 'indent', textAlign: 'left', bodySize: 'small' });
  assert.match(small, /font-size:\s*0\.9em/);
  const xlarge = epubStylesheet({ paragraphStyle: 'indent', textAlign: 'left', bodySize: 'xlarge' });
  assert.match(xlarge, /font-size:\s*1\.3em/);

  const zip = await unzip(await buildEpubBlob(sample(), options({
    chapterPageBreaks: false,
    paragraphStyle: 'spacing',
    textAlign: 'justify',
    bodySize: 'xlarge',
  }), now));
  const ch2 = await zip.file('OEBPS/ch-0002.xhtml')!.async('string');
  const style = await zip.file('OEBPS/style.css')!.async('string');
  assert.equal(ch2.includes('chapter-break'), false);
  assert.match(await zip.file('OEBPS/ch-0001.xhtml')!.async('string'), /<hr class="page-break"\/>/);
  assert.match(style, /font-size:\s*1\.3em/);
  assert.match(style, /text-align:\s*justify/);
  assert.equal(style.includes('Times'), false);
});

test('a cover is the first spine item and a preface stays out of the chapter list', async () => {
  const jpeg = Uint8Array.from([
    0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00,
  ]);
  const ids = sequenceIds('p');
  const doc: ManuscriptDocument = {
    ...emptyDocument(ids()),
    title: 'Harbor Light',
    blocks: [
      block(ids(), { type: 'paragraph', text: 'Preface line' }),
      block(ids(), { type: 'chapter', title: 'Opening' }),
      block(ids(), { type: 'paragraph', text: 'Body line' }),
    ],
  };
  const zip = await unzip(await buildEpubBlob(doc, options({ cover: { bytes: jpeg, mediaType: 'image/jpeg' } }), now));
  const opf = await zip.file('OEBPS/content.opf')!.async('string');
  assert.match(opf, /properties="cover-image"/);
  assert.match(opf, /<itemref idref="cover"\/>\s*<itemref idref="nav"\/>\s*<itemref idref="front"\/>\s*<itemref idref="ch-0001"\/>/);
  assert.ok(zip.file('OEBPS/images/cover.jpg'));
  assert.match(await zip.file('OEBPS/cover.xhtml')!.async('string'), /src="images\/cover\.jpg"/);
  assert.match(await zip.file('OEBPS/front.xhtml')!.async('string'), /Preface line/);
  assert.equal((await zip.file('OEBPS/nav.xhtml')!.async('string')).includes('Preface'), false);
  assert.match(await zip.file('OEBPS/ch-0001.xhtml')!.async('string'), /Body line/);
  assert.match(await zip.file('OEBPS/nav.xhtml')!.async('string'), /epub:type="cover"/);
});

test('a linked picture, a non jpeg-png, a bad isbn, and a missing author fail the export', async () => {
  const ids = sequenceIds('e');
  const linked: ManuscriptDocument = {
    ...emptyDocument(ids()),
    title: 'Harbor Light',
    blocks: [block(ids(), { type: 'image', imageSrc: 'https://example.com/chart.png', imageAlt: 'Chart' })],
  };
  await assert.rejects(() => buildEpubBlob(linked, options(), now), /saved file/);
  const svg: ManuscriptDocument = {
    ...emptyDocument('svg'),
    title: 'Harbor Light',
    blocks: [block('img', { type: 'image', imageSrc: `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64')}` })],
  };
  await assert.rejects(() => buildEpubBlob(svg, options(), now), /JPEG or PNG/);
  const huge: ManuscriptDocument = {
    ...emptyDocument('huge'),
    title: 'Harbor Light',
    blocks: [block('img', {
      type: 'image',
      imageSrc: `data:image/png;base64,${Buffer.from(pngBytes(2000, 2000)).toString('base64')}`,
      imageAlt: 'Too big',
    })],
  };
  await assert.rejects(() => buildEpubBlob(huge, options(), now), /3\.2 million/);
  await assert.rejects(() => buildEpubBlob(sample(), options({ author: '  ' }), now), /author name/);
  await assert.rejects(() => buildEpubBlob(sample(), options({ isbn: '9780306406158' }), now), /ISBN/);
  await assert.rejects(() => buildEpubBlob(sample(), options({ language: 'english' }), now), /BCP 47/);
  await assert.rejects(() => buildEpubBlob(sample(), options({ epubUuid: 'fresh-each-download' }), now), /saved id/);
});

test('the manuscript exporter builds the epub and still omits the certification summary', async () => {
  const blob = await exportManuscriptBlob(sample(), 'epub', now, { bookTitle: 'Harbor Light', seriesLabel: 'Book 2 of Harbor Saga' }, options());
  const zip = await unzip(blob);
  const ch1 = await zip.file('OEBPS/ch-0001.xhtml')!.async('string');
  const opf = await zip.file('OEBPS/content.opf')!.async('string');
  assert.match(ch1, /Before the break/);
  assert.equal(ch1.includes('certification summary'), false);
  assert.equal(opf.includes('Book 2 of Harbor Saga'), false);
  assert.equal(opf.includes('dc:publisher'), false);
  await assert.rejects(() => exportManuscriptBlob(sample(), 'epub', now), /export form/);
});

test('a saved epub id survives a library reload and a bad id is dropped', async () => {
  const memory = new Map<string, string>();
  const previous = globalThis.localStorage;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value);
      },
      removeItem: (key: string) => {
        memory.delete(key);
      },
    },
  });
  try {
    const ids = sequenceIds('id');
    let library = createBook({ version: 2, activeBookId: 'x', series: [], books: [] }, ids(), 'Harbor');
    library = ensureBookEpubUuid(library, library.activeBookId).library;
    library = {
      ...library,
      books: library.books.map((book) => ({
        ...book,
        epubAuthor: 'Ada Harbor',
        epubIsbn: 'not-an-isbn',
        epubLanguage: 'english',
        copyrightYear: 'soon',
        paperbackIsbn: '978-1-86197-271-2',
        includePublicationPages: 'yes',
      })) as typeof library.books,
    };
    saveLibrary(library);
    const loaded = loadLibrary();
    assert.equal(loaded.ok, true);
    if (!loaded.ok || !loaded.library) return;
    const loadedBook = loaded.library.books[0]!;
    assert.equal(loadedBook.epubUuid, library.books[0]!.epubUuid);
    assert.equal(loadedBook.author, 'Ada Harbor');
    assert.equal(loadedBook.ebookIsbn, undefined);
    assert.equal(loadedBook.epubLanguage, undefined);
    assert.equal(loadedBook.copyrightYear, undefined);
    assert.equal(loadedBook.paperbackIsbn, '9781861972712');
    assert.equal(loadedBook.includePublicationPages, undefined);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: previous });
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('publication pages stay out of the epub until the switch is on', async () => {
  const zip = await unzip(await buildEpubBlob(sample(), options({
    dedication: 'For the harbor cats',
    subtitle: 'A novel',
    copyrightYear: 2026,
    alsoBy: ['Other Book'],
  }), now));
  assert.equal(zip.file('OEBPS/title.xhtml'), null);
  assert.equal(zip.file('OEBPS/copyright.xhtml'), null);
  assert.equal(zip.file('OEBPS/dedication.xhtml'), null);
  assert.equal(zip.file('OEBPS/also-by.xhtml'), null);
  const joined = await Promise.all(
    Object.keys(zip.files)
      .filter((name) => !zip.files[name]!.dir)
      .map((name) => zip.file(name)!.async('string')),
  );
  assert.equal(joined.join('\n').includes('For the harbor cats'), false);
});

test('the ebook spine adds title and copyright and skips empty pages', async () => {
  const zip = await unzip(await buildEpubBlob(sample(), options({
    includePublicationPages: true,
    copyrightYear: 2026,
    subtitle: 'A novel',
    imprint: 'Lantern Press',
    seriesLine: 'Book 2 of Harbor Saga',
    dedication: 'For the harbor cats',
    epigraph: 'The sea keeps lists',
    epigraphAttribution: 'A pilot',
    alsoBy: ['Other Book'],
    aboutAuthor: 'Writes at night',
    isbn: '9780306406157',
    edition: 'First edition',
    disclaimer: 'This is fiction.',
  }), now));
  const opf = await zip.file('OEBPS/content.opf')!.async('string');
  assert.match(opf, /<itemref idref="title"\/>\s*<itemref idref="copyright"\/>\s*<itemref idref="dedication"\/>\s*<itemref idref="epigraph"\/>\s*<itemref idref="nav"\/>/);
  assert.match(opf, /<itemref idref="also-by"\/>\s*<itemref idref="about"\/>/);
  assert.equal(opf.includes('Paperback'), false);
  assert.equal(opf.includes('9781861972712'), false);
  assert.equal(opf.includes('Book 2 of Harbor Saga'), false);
  assert.equal(opf.includes('dc:publisher'), false);
  const titlePage = await zip.file('OEBPS/title.xhtml')!.async('string');
  assert.match(titlePage, /epub:type="titlepage"/);
  assert.match(titlePage, /A novel/);
  assert.match(titlePage, /Ada Harbor/);
  assert.match(titlePage, /Lantern Press/);
  assert.match(titlePage, /Book 2 of Harbor Saga/);
  assert.equal(/\bby Ada\b/i.test(titlePage), false);
  assert.equal(titlePage.includes('bodymatter'), false);
  const copyright = await zip.file('OEBPS/copyright.xhtml')!.async('string');
  assert.match(copyright, /Copyright © 2026 Ada Harbor/);
  assert.match(copyright, /All rights reserved/);
  assert.match(copyright, /This is fiction/);
  assert.match(copyright, /Ebook ISBN 9780306406157/);
  assert.match(copyright, /First edition/);
  assert.equal(copyright.includes('Paperback'), false);
  assert.equal(copyright.includes('Hardcover'), false);
  const nav = await zip.file('OEBPS/nav.xhtml')!.async('string');
  const toc = nav.split('epub:type="landmarks"')[0] ?? '';
  assert.match(toc, /also-by\.xhtml/);
  assert.match(toc, /about\.xhtml/);
  assert.equal(toc.includes('dedication.xhtml'), false);
  assert.equal(toc.includes('title.xhtml'), false);
  assert.equal(toc.includes('copyright.xhtml'), false);
  assert.equal(toc.includes('epigraph.xhtml'), false);
  assert.match(await zip.file('OEBPS/ch-0001.xhtml')!.async('string'), /epub:type="bodymatter"/);
  assert.match(await zip.file('OEBPS/dedication.xhtml')!.async('string'), /For the harbor cats/);
  assert.equal(zip.file('OEBPS/halftitle.xhtml'), null);

  const emptyOptional = await unzip(await buildEpubBlob(sample(), options({
    includePublicationPages: true,
    copyrightYear: 2024,
  }), now));
  assert.equal(emptyOptional.file('OEBPS/dedication.xhtml'), null);
  assert.equal(emptyOptional.file('OEBPS/epigraph.xhtml'), null);
  assert.equal(emptyOptional.file('OEBPS/also-by.xhtml'), null);
  assert.equal(emptyOptional.file('OEBPS/about.xhtml'), null);
  assert.ok(emptyOptional.file('OEBPS/title.xhtml'));
});

test('a missing copyright year blocks publication pages and not a plain ebook', async () => {
  await assert.rejects(
    () => buildEpubBlob(sample(), options({ includePublicationPages: true, copyrightYear: null }), now),
    /copyright year/,
  );
  const zip = await unzip(await buildEpubBlob(sample(), options({ copyrightYear: null }), now));
  assert.equal(zip.file('OEBPS/title.xhtml'), null);
});
