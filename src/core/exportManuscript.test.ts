import assert from 'node:assert/strict';
import { test } from 'node:test';
import JSZip from 'jszip';
import { emptyDocument, insertStructure, type ManuscriptDocument } from './document.ts';
import {
  EXPORT_FORMAT_LABELS,
  exportManuscriptBlob,
  MARKDOWN_PAGE_BREAK,
  PLAIN_PAGE_BREAK,
  type ExportFormat,
} from './exportManuscript.ts';
import { sequenceIds } from './uid.ts';

const now = '2026-10-14T18:00:00.000Z';
const identity = { bookTitle: 'Harbor Light', seriesLabel: 'Book 2 of Harbor Saga' };

function manuscriptWithBreaks(): ManuscriptDocument {
  const ids = sequenceIds('id');
  let doc = { ...emptyDocument(ids()), title: 'Harbor Light' };
  doc = insertStructure(doc, 'chapter', doc.blocks.length, ids());
  doc = {
    ...doc,
    blocks: doc.blocks.map((block, index) => (index === 0 ? { ...block, title: 'Opening' } : block)),
  };
  doc = insertStructure(doc, 'paragraph', doc.blocks.length, ids());
  doc = {
    ...doc,
    blocks: doc.blocks.map((block) =>
      block.type === 'paragraph' ? { ...block, text: 'Before the break' } : block,
    ),
  };
  doc = insertStructure(doc, 'divider', doc.blocks.length, ids());
  doc = insertStructure(doc, 'pageBreak', doc.blocks.length, ids());
  doc = insertStructure(doc, 'paragraph', doc.blocks.length, ids());
  const afterId = doc.blocks[doc.blocks.length - 1]!.id;
  doc = {
    ...doc,
    blocks: doc.blocks.map((block) => (block.id === afterId ? { ...block, text: 'After the break' } : block)),
  };
  return doc;
}

function assertOrder(label: string, parts: string[]) {
  assert.equal(parts.length, 3, `${label} should have a summary break and one manuscript page break`);
  assert.match(parts[0]!, /HuManuScript certification summary/);
  assert.match(parts[0]!, /on what devices specific parts of the manuscript were introduced/);
  assert.match(parts[0]!, /not proof against someone simulating those events/);
  assert.doesNotMatch(parts[0]!, /Trust limit/);
  assert.match(parts[0]!, /Keyboard-certified words:/);
  assert.match(parts[0]!, /Book 2 of Harbor Saga/);
  assert.match(parts[0]!, /14 October 2026, 18:00 UTC/);
  assert.doesNotMatch(parts[0]!, /Before the break/);
  assert.match(parts[1]!, /Before the break/);
  assert.match(parts[1]!, /\* \* \*/);
  assert.doesNotMatch(parts[1]!, /After the break/);
  assert.match(parts[2]!, /After the break/);
  assert.doesNotMatch(parts[2]!, /Before the break/);
}

test('plain text and markdown keep the summary break and the author page break', async () => {
  const doc = manuscriptWithBreaks();
  const plain = await (await exportManuscriptBlob(doc, 'plain', now, identity)).text();
  const markdown = await (await exportManuscriptBlob(doc, 'markdown', now, identity)).text();
  assertOrder('plain', plain.split(PLAIN_PAGE_BREAK));
  assertOrder('markdown', markdown.split(MARKDOWN_PAGE_BREAK));
  assert.match(markdown, /# HuManuScript certification summary/);
  assert.equal(plain.includes('[PAGE BREAK]'), false);
});

test('rtf and scrivener rtf page-break after the summary and inside the manuscript', async () => {
  const doc = manuscriptWithBreaks();
  const rtf = await (await exportManuscriptBlob(doc, 'rtf', now, identity)).text();
  const scrivener = await (await exportManuscriptBlob(doc, 'scrivener-rtf', now, identity)).text();
  assertOrder('rtf', rtf.split('\\page'));
  assertOrder('scrivener', scrivener.split('\\page'));
  assert.match(scrivener, /\\pard #\\par/);
  assert.match(rtf, /Opening/);
});

test('word, odt, and pdf start the manuscript on the next page and keep the author page break', async () => {
  const doc = manuscriptWithBreaks();
  const docxBuf = Buffer.from(await (await exportManuscriptBlob(doc, 'docx', now, identity)).arrayBuffer());
  const docxZip = await JSZip.loadAsync(docxBuf);
  const documentXml = await docxZip.file('word/document.xml')!.async('string');
  const docxParts = documentXml.split(/<w:br[^>]*w:type="page"[^/]*\/>|<w:br[^>]*w:type="page"[^>]*>/);
  assertOrder('docx', docxParts);

  const odtBuf = Buffer.from(await (await exportManuscriptBlob(doc, 'odt', now, identity)).arrayBuffer());
  const odtZip = await JSZip.loadAsync(odtBuf);
  const contentXml = await odtZip.file('content.xml')!.async('string');
  assert.match(contentXml, /fo:break-before="page"/);
  assertOrder('odt', contentXml.split('<text:p text:style-name="PageBreak"/>'));

  const pdfBuf = Buffer.from(await (await exportManuscriptBlob(doc, 'pdf', now, identity)).arrayBuffer());
  const pdf = pdfBuf.toString('latin1');
  const pageCount = pdf.match(/\/Type\s*\/Page(?!s)/g)?.length ?? 0;
  assert.equal(pageCount, 3, `pdf pages: ${pageCount}`);
  assert.ok(pdf.includes('on what devices specific parts of the manuscript were introduced'));
  assert.ok(pdf.includes('Browser keystroke'));
  assert.equal(pdf.includes('Trust limit'), false);
  const summaryAt = pdf.indexOf('HuManuScript certification summary');
  const beforeAt = pdf.indexOf('Before the break');
  const sceneAt = pdf.indexOf('* * *');
  const afterAt = pdf.indexOf('After the break');
  assert.ok(summaryAt >= 0 && beforeAt > summaryAt && sceneAt > beforeAt && afterAt > sceneAt);
});

test('every exporter is covered by the page-break checks', () => {
  const covered: ExportFormat[] = ['plain', 'markdown', 'rtf', 'scrivener-rtf', 'docx', 'odt', 'pdf'];
  assert.deepEqual(covered.sort(), (Object.keys(EXPORT_FORMAT_LABELS) as ExportFormat[]).sort());
});
