import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { test } from 'node:test';
import { emptyDocument, type ManuscriptDocument } from './document.ts';
import type { PublicationFileOptions } from './exportManuscript.ts';
import { latin1, readPdfFacts } from './printPdf.ts';
import {
  buildPrintInteriorSource,
  gutterBandLabel,
  insideMarginIn,
  printInteriorFilename,
  printInteriorRefusal,
  printSheetWarnings,
  printTrim,
  PRINT_TRIMS,
} from './printInterior.ts';
import { compilePrintInterior, configurePrintTypstWasm, printPreviewSvg } from './printTypst.ts';
import type { InlineMark, ManuscriptBlock } from './types.ts';

const require = createRequire(import.meta.url);

configurePrintTypstWasm({
  compiler: readFileSync(require.resolve('@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm')),
  renderer: readFileSync(require.resolve('@myriaddreamin/typst-ts-renderer/pkg/typst_ts_renderer_bg.wasm')),
});

const fonts = ['Regular', 'Italic', 'Bold', 'BoldItalic'].map(
  (style) => new Uint8Array(readFileSync(require.resolve(`../fonts/CrimsonText-${style}.ttf`))),
);

function block(partial: Pick<ManuscriptBlock, 'id' | 'type'> & Partial<ManuscriptBlock>): ManuscriptBlock {
  return {
    title: '',
    text: '',
    marks: [],
    ...partial,
  };
}

function book(blocks: ManuscriptBlock[], title = 'Harbor Light'): ManuscriptDocument {
  return { ...emptyDocument('ms-print'), title, blocks };
}

function pages(over: Partial<PublicationFileOptions> = {}): PublicationFileOptions {
  return {
    includePublicationPages: true,
    author: 'Ada Quinn',
    subtitle: 'A night novel',
    imprint: 'Harbor Press',
    copyrightYear: '2024',
    copyrightHolder: '',
    rightsLine: '',
    disclaimer: '',
    paperbackIsbn: '9780306406157',
    hardcoverIsbn: '',
    ebookIsbn: '',
    edition: 'First edition',
    dedication: '',
    epigraph: '',
    epigraphAttribution: '',
    alsoBy: [],
    aboutAuthor: '',
    seriesLine: 'Book 2 of Harbor Saga',
    ...over,
  };
}

function source(doc: ManuscriptDocument, formatId: string, over: Partial<PublicationFileOptions> = {}) {
  return buildPrintInteriorSource({ doc, options: pages(over), formatId, insideIn: 0.5, language: 'en' });
}

test('trim files use the press size, not the preview box', () => {
  assert.equal(printTrim('trade')?.fileLabel, '6 × 9 in');
  assert.equal(printTrim('hardcover')?.widthIn, 6);
  assert.equal(printTrim('hardcover')?.heightIn, 9);
  assert.match(printTrim('hardcover')?.note ?? '', /6 × 9/);
  assert.equal(printTrim('mass-market')?.widthIn, 4.25);
  assert.equal(printTrim('mass-market')?.heightIn, 6.875);
  assert.equal(printTrim('mass-market')?.halfTitle, false);
  assert.match(printTrim('mass-market')?.note ?? '', /Lulu pocket/);
  assert.equal(printTrim('ereader'), null);
  assert.equal(printTrim('tablet'), null);
  assert.equal(PRINT_TRIMS.some((item) => item.id === 'ereader'), false);
});

test('inside margin follows the gutter band and stays at least half an inch', () => {
  assert.equal(insideMarginIn(24), 0.5);
  assert.equal(insideMarginIn(150), 0.5);
  assert.equal(insideMarginIn(151), 0.5);
  assert.equal(insideMarginIn(301), 0.625);
  assert.equal(insideMarginIn(501), 0.75);
  assert.equal(insideMarginIn(701), 0.875);
  assert.match(gutterBandLabel(40), /0\.5 in/);
  assert.match(gutterBandLabel(800), /0\.875/);
});

test('sheet warnings use the KDP floors and caps and do not pad', () => {
  const trade = printTrim('trade')!;
  const hardcover = printTrim('hardcover')!;
  const pocket = printTrim('mass-market')!;
  const letter = printTrim('hardcover-8-5x11')!;
  assert.match(printSheetWarnings(trade, 10).join(' '), /24/);
  assert.match(printSheetWarnings(hardcover, 40).join(' '), /75/);
  assert.match(printSheetWarnings(trade, 900).join(' '), /828/);
  assert.match(printSheetWarnings(hardcover, 600).join(' '), /550/);
  assert.match(printSheetWarnings(letter, 600).join(' '), /590/);
  assert.equal(printSheetWarnings(pocket, 900).length, 0);
  assert.match(printSheetWarnings(pocket, 10).join(' '), /24/);
  assert.match(letter.note, /8\.25 × 11/);
  assert.equal(printInteriorFilename('Harbor Light', trade), 'harbor-light-print-6x9.pdf');
  assert.equal(printInteriorFilename('Harbor Light', pocket), 'harbor-light-print-4-25x6-875.pdf');
});

test('the print source keeps author text literal and omits the certification summary', () => {
  const doc = book([
    block({ id: 'c', type: 'chapter', title: 'Chapter #1 *stars*' }),
    block({
      id: 'p',
      type: 'paragraph',
      text: 'She said #hello and *no*.',
      marks: [{ kind: 'italic', start: 9, end: 15 }] satisfies InlineMark[],
    }),
  ]);
  const trade = source(doc, 'trade');
  const pocket = source(doc, 'mass-market');
  assert.match(trade, /leaf half-title/);
  assert.doesNotMatch(pocket, /leaf half-title/);
  assert.match(trade, /"Chapter #1 \*stars\*"/);
  assert.match(trade, /#text\("She said "\)#emph\[#text\("#hello"\)\]#text\(" and \*no\*\."\)/);
  assert.doesNotMatch(trade, /HuManuScript/);
  assert.doesNotMatch(trade, /certification summary/);
  assert.doesNotMatch(trade, /Certified Manuscript Registry/);
  assert.doesNotMatch(trade, /readywriter\.one/);
  assert.match(trade, /Paperback ISBN 9780306406157/);
  assert.match(trade, /width: 6in/);
  assert.match(pocket, /width: 4\.25in/);
  assert.match(pocket, /height: 6\.875in/);
  assert.match(trade, /binding: left/);
  assert.match(trade, /inside: 0\.5in/);
});

test('half title verso holds a short also-by list, and mass market moves it to the back', () => {
  const doc = book([block({ id: 'c', type: 'chapter', title: 'Opening' }), block({ id: 'p', type: 'paragraph', text: 'One line.' })]);
  const short = ['Salt', 'Cedar'];
  const trade = source(doc, 'trade', { alsoBy: short });
  const pocket = source(doc, 'mass-market', { alsoBy: short });
  const long = source(doc, 'trade', { alsoBy: Array.from({ length: 9 }, (_, index) => `Book ${index}`) });
  assert.match(trade, /leaf also-by-front/);
  assert.doesNotMatch(trade, /leaf also-by-back/);
  assert.match(pocket, /leaf also-by-back/);
  assert.doesNotMatch(pocket, /leaf also-by-front/);
  assert.match(long, /leaf also-by-back/);
  assert.doesNotMatch(long, /leaf also-by-front/);
});

test('pictures and tables stop the interior, and publication pages stay the gate', () => {
  const prose = book([block({ id: 'c', type: 'chapter', title: 'Opening' })]);
  assert.match(printInteriorRefusal(prose, pages({ includePublicationPages: false }), 'trade') ?? '', /publication pages/);
  assert.match(
    printInteriorRefusal(book([block({ id: 'i', type: 'image', imageSrc: 'data:image/png;base64,aa' })]), pages(), 'trade') ?? '',
    /picture/,
  );
  assert.match(
    printInteriorRefusal(book([block({ id: 't', type: 'table', tableRows: [['A']] })]), pages(), 'hardcover') ?? '',
    /table/,
  );
  assert.equal(printInteriorRefusal(prose, pages(), 'trade'), null);
});

test('the same Typst source compiles the trade PDF and the Lulu pocket PDF', async () => {
  const doc = book([
    block({ id: 'c1', type: 'chapter', title: 'Opening' }),
    block({
      id: 'p1',
      type: 'paragraph',
      text: 'The harbor was already dark.',
      marks: [{ kind: 'italic', start: 15, end: 22 }],
    }),
    block({ id: 's', type: 'section', title: 'Night' }),
    block({ id: 'p2', type: 'paragraph', text: 'A bell rang once.' }),
    block({ id: 'd', type: 'divider' }),
    block({ id: 'c2', type: 'chapter', title: 'Second' }),
    block({ id: 'p3', type: 'paragraph', text: 'Morning.' }),
  ]);
  const options = pages({ aboutAuthor: 'Ada lives by the water.' });
  const tradeSource = buildPrintInteriorSource({ doc, options, formatId: 'trade', insideIn: 0.5 });
  const trade = await compilePrintInterior(doc, options, 'trade', fonts);
  assert.equal(trade.source, tradeSource);
  const facts = readPdfFacts(trade.pdf);
  assert.equal(facts.pages, trade.sheets);
  assert.ok(facts.pages >= 7);
  assert.ok(facts.mediaBoxes.every((box) => box.width === 432 && box.height === 648));
  assert.equal(facts.outlines, false);
  assert.ok(facts.fontFiles >= 1);
  assert.ok(facts.baseFonts.some((name) => /^[A-Z]{6}\+CrimsonText-Regular$/.test(name)));
  assert.ok(facts.baseFonts.some((name) => /^[A-Z]{6}\+CrimsonText-Italic$/.test(name)));
  const text = inflatedText(trade.pdf);
  assert.equal(/certification/i.test(text), false);
  assert.equal(text.includes('HuManuScript'), false);
  assert.match(text, /Harbor Light/);
  assert.match(text, /Ada Quinn/);
  const pocket = await compilePrintInterior(doc, options, 'mass-market', fonts);
  const pocketFacts = readPdfFacts(pocket.pdf);
  assert.ok(pocketFacts.mediaBoxes.every((box) => box.width === 306 && box.height === 495));
  assert.equal(pocketFacts.outlines, false);
  const blank = svgPageTextCount(trade.svg);
  assert.equal(blank[1], 0, 'the half-title verso stays blank');
  assert.match(trade.svg, /<script/);
  const preview = printPreviewSvg(trade.svg);
  assert.doesNotMatch(preview, /<script/);
  assert.doesNotMatch(preview, /foreignObject/);
  assert.match(preview, /typst-doc/);
  assert.match(preview, /glyph/);
});

function inflatedText(bytes: Uint8Array): string {
  const raw = latin1(bytes);
  const parts = [raw];
  for (const match of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    const chunk = match[1] ?? '';
    const packed = Uint8Array.from(chunk, (char) => char.charCodeAt(0) & 0xff);
    try {
      parts.push(Buffer.from(inflateSync(packed)).toString('latin1'));
    } catch {
      // Not a Flate stream.
    }
  }
  return parts.join('\n');
}

function svgPageTextCount(svg: string): number[] {
  return svg
    .split(/<g class="typst-page"/)
    .slice(1)
    .map((page) => (page.match(/class="typst-text"/g) ?? []).length);
}
