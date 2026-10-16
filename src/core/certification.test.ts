import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyTextChange,
  classifyInputType,
  classifyInsertion,
  contentHash,
  MAX_KEYBOARD_INSERT_CHARS,
  MIN_HUMAN_KEY_INTERVAL_MS,
  relocateRange,
  stripInvalidKeyboardSeals,
  syncBlockPoints,
} from './certification.ts';
import { CERTIFICATION_PURPOSE, TRUST_STATEMENT, buildCertificationPageModel, certificationPagePlain } from './certificationPage.ts';
import {
  editField,
  emptyDocument,
  insertStructure,
  nudgeBlock,
  reorderBlocks,
  splitParagraph,
} from './document.ts';
import { moveBlockRange } from './manuscript.ts';
import { sequenceIds } from './uid.ts';

const now = '2026-10-14T18:00:00.000Z';

function event(inputType: string, data: string | null, trusted = true) {
  return { at: now, inputType, data, trusted };
}

test('classifyInsertion rejects bulk trusted insertText and sub-human intervals', () => {
  assert.deepEqual(
    classifyInsertion({ inputType: 'insertText', trusted: true, data: 'a', sinceLastMs: null }),
    { kind: 'insert', origin: 'keyboard' },
  );
  assert.deepEqual(
    classifyInsertion({
      inputType: 'insertText',
      trusted: true,
      data: 'x'.repeat(MAX_KEYBOARD_INSERT_CHARS + 1),
      sinceLastMs: null,
    }),
    { kind: 'insert', origin: 'other' },
  );
  assert.deepEqual(
    classifyInsertion({
      inputType: 'insertText',
      trusted: true,
      data: 'a',
      sinceLastMs: MIN_HUMAN_KEY_INTERVAL_MS - 1,
    }),
    { kind: 'insert', origin: 'other' },
  );
});

test('classifies keyboard, paste, drop, and other insertions', () => {
  assert.deepEqual(classifyInputType('insertText', true), { kind: 'insert', origin: 'keyboard' });
  assert.deepEqual(classifyInputType('insertText', false), { kind: 'insert', origin: 'other' });
  assert.deepEqual(classifyInputType('insertFromPaste', true), { kind: 'insert', origin: 'paste' });
  assert.deepEqual(classifyInputType('insertFromYank', true), { kind: 'insert', origin: 'paste' });
  assert.deepEqual(classifyInputType('insertFromDrop', true), { kind: 'insert', origin: 'drop' });
  assert.deepEqual(classifyInputType('insertReplacementText', true), { kind: 'insert', origin: 'other' });
  assert.equal(classifyInputType('deleteContentBackward', true).kind, 'delete');
  assert.equal(classifyInputType('insertParagraph', true).kind, 'split');
  assert.equal(classifyInputType('insertCompositionText', true).kind, 'ignore');
});

test('keyboard text is sealed and paste stays uncertified', async () => {
  const ids = sequenceIds('id');
  let doc = insertStructure(emptyDocument(ids()), 'paragraph', 0, ids());
  const blockId = doc.blocks[0]!.id;
  doc = await editField({
    doc,
    blockId,
    field: 'text',
    start: 0,
    end: 0,
    insert: 'Hello',
    origin: 'keyboard',
    event: event('insertText', 'Hello'),
    now,
    newId: ids,
  });
  doc = await editField({
    doc,
    blockId,
    field: 'text',
    start: 5,
    end: 5,
    insert: ' from a chat',
    origin: 'paste',
    event: event('insertFromPaste', ' from a chat'),
    now,
    newId: ids,
  });

  const spans = doc.provenance[blockId]!.text;
  assert.equal(doc.blocks[0]!.text, 'Hello from a chat');
  assert.equal(spans[0]!.origin, 'keyboard');
  assert.equal(spans[0]!.certificationId != null, true);
  assert.equal(spans[1]!.origin, 'paste');
  assert.equal(spans[1]!.certificationId, undefined);
  assert.equal(doc.points.length, 1);
  assert.equal(doc.points[0]!.text, 'Hello');
  assert.equal(doc.points[0]!.contentHash, await contentHash('Hello'));
  assert.equal(doc.points[0]!.evidence.eventCount, 1);
  assert.equal(doc.points[0]!.origin, 'keyboard');
});

test('paste in the middle splits a certified span and leaves both remnants sealed', async () => {
  const ids = sequenceIds('id');
  let doc = insertStructure(emptyDocument(ids()), 'paragraph', 0, ids());
  const blockId = doc.blocks[0]!.id;
  doc = await editField({
    doc,
    blockId,
    field: 'text',
    start: 0,
    end: 0,
    insert: 'Hello',
    origin: 'keyboard',
    event: event('insertText', 'Hello'),
    now,
    newId: ids,
  });
  const original = doc.points[0]!.id;
  doc = await editField({
    doc,
    blockId,
    field: 'text',
    start: 2,
    end: 2,
    insert: 'AI',
    origin: 'paste',
    event: event('insertFromPaste', 'AI'),
    now,
    newId: ids,
  });
  const spans = doc.provenance[blockId]!.text;
  assert.deepEqual(
    spans.map((s) => s.origin),
    ['keyboard', 'paste', 'keyboard'],
  );
  assert.equal(spans[1]!.certificationId, undefined);
  assert.equal(doc.points.length, 2);
  const texts = doc.points.map((p) => p.text).sort();
  assert.deepEqual(texts, ['He', 'llo']);
  assert.equal(doc.points.some((p) => p.id === original), true);
  assert.equal(doc.points.some((p) => p.lineage?.includes(original)), true);
  for (const point of doc.points) {
    assert.equal(point.contentHash, await contentHash(point.text));
  }
});

test('untrusted insertion is not keyboard-certified', async () => {
  const ids = sequenceIds('id');
  const blockId = 'b';
  const changed = applyTextChange({
    text: '',
    spans: [],
    marks: [],
    start: 0,
    end: 0,
    insert: 'scripted',
    origin: classifyInputType('insertText', false).kind === 'insert' ? 'other' : 'keyboard',
    newId: ids,
  });
  const sealed = await syncBlockPoints({
    blockId,
    text: changed.text,
    spans: changed.spans,
    points: [],
    evidence: null,
    now,
    newId: ids,
  });
  assert.equal(sealed.spans[0]!.origin, 'other');
  assert.equal(sealed.points.length, 0);
});

test('reorder keeps certification on the moved paragraph', async () => {
  const ids = sequenceIds('id');
  let doc = emptyDocument(ids());
  doc = insertStructure(doc, 'chapter', 0, ids());
  doc = insertStructure(doc, 'paragraph', 1, ids());
  doc = insertStructure(doc, 'chapter', 2, ids());
  const paragraphId = doc.blocks[1]!.id;
  doc = await editField({
    doc,
    blockId: paragraphId,
    field: 'text',
    start: 0,
    end: 0,
    insert: 'Typed',
    origin: 'keyboard',
    event: event('insertText', 'Typed'),
    now,
    newId: ids,
  });
  const pointId = doc.points[0]!.id;
  const hash = doc.points[0]!.contentHash;
  doc = reorderBlocks(doc, 0, 3, now, ids());
  assert.deepEqual(
    doc.blocks.map((b) => b.type),
    ['chapter', 'chapter', 'paragraph'],
  );
  assert.equal(doc.points[0]!.id, pointId);
  assert.equal(doc.points[0]!.contentHash, hash);
  assert.equal(doc.provenance[paragraphId]!.text[0]!.certificationId, pointId);
  assert.equal(doc.moves.length, 1);
});

test('nudging a paragraph preserves the seal', async () => {
  const ids = sequenceIds('id');
  let doc = insertStructure(emptyDocument(ids()), 'paragraph', 0, ids());
  doc = insertStructure(doc, 'paragraph', 1, ids());
  const first = doc.blocks[0]!.id;
  doc = await editField({
    doc,
    blockId: first,
    field: 'text',
    start: 0,
    end: 0,
    insert: 'One',
    origin: 'keyboard',
    event: event('insertText', 'One'),
    now,
    newId: ids,
  });
  const pointId = doc.points[0]!.id;
  doc = nudgeBlock(doc, first, 1, now, ids());
  assert.equal(doc.blocks[1]!.id, first);
  assert.equal(doc.points[0]!.id, pointId);
  assert.equal(doc.points[0]!.text, 'One');
});

test('splitting a paragraph carries certification onto the new block', async () => {
  const ids = sequenceIds('id');
  let doc = insertStructure(emptyDocument(ids()), 'paragraph', 0, ids());
  const blockId = doc.blocks[0]!.id;
  doc = await editField({
    doc,
    blockId,
    field: 'text',
    start: 0,
    end: 0,
    insert: 'Hello',
    origin: 'keyboard',
    event: event('insertText', 'Hello'),
    now,
    newId: ids,
  });
  doc = await splitParagraph({ doc, blockId, offset: 2, now, newId: ids });
  assert.equal(doc.blocks.length, 2);
  assert.equal(doc.blocks[0]!.text, 'He');
  assert.equal(doc.blocks[1]!.text, 'llo');
  assert.equal(doc.points.length, 2);
  assert.equal(doc.provenance[doc.blocks[0]!.id]!.text[0]!.origin, 'keyboard');
  assert.equal(doc.provenance[doc.blocks[1]!.id]!.text[0]!.origin, 'keyboard');
  for (const point of doc.points) assert.equal(point.contentHash, await contentHash(point.text));
});

test('moving text inside a paragraph keeps the certification id', async () => {
  const ids = sequenceIds('id');
  const changed = applyTextChange({
    text: '',
    spans: [],
    marks: [],
    start: 0,
    end: 0,
    insert: 'abcd',
    origin: 'keyboard',
    newId: ids,
  });
  const sealed = await syncBlockPoints({
    blockId: 'b',
    text: changed.text,
    spans: changed.spans,
    points: [],
    evidence: { spanIds: changed.evidenceSpanIds, event: event('insertText', 'abcd') },
    now,
    newId: ids,
  });
  const moved = relocateRange({
    text: sealed.spans.length ? 'abcd' : '',
    spans: sealed.spans,
    marks: [],
    fromStart: 0,
    fromEnd: 2,
    dropAt: 4,
    newId: ids,
  });
  assert.ok(moved);
  assert.equal(moved!.text, 'cdab');
  assert.equal(moved!.spans[0]!.origin, 'keyboard');
  assert.equal(moved!.spans[0]!.certificationId, sealed.points[0]!.id);
});

test('stripInvalidKeyboardSeals downgrades tampered spans', async () => {
  const ids = sequenceIds('id');
  const hash = await contentHash('real');
  const points = [
    {
      id: 'p1',
      blockId: 'b',
      spanId: 's1',
      text: 'real',
      contentHash: hash,
      sealedAt: now,
      updatedAt: now,
      origin: 'keyboard' as const,
      evidence: { inputTypes: ['insertText'], eventCount: 1, events: [] },
      priorHashes: [],
    },
  ];
  const spans = await stripInvalidKeyboardSeals({
    text: 'fake',
    spans: [{ id: 's1', start: 0, end: 4, origin: 'keyboard', certificationId: 'p1' }],
    points,
    newId: ids,
  });
  assert.equal(spans[0]!.origin, 'other');
  assert.equal(spans[0]!.certificationId, undefined);
});

test('certification summary is one page of facts, not a passage dump', async () => {
  const ids = sequenceIds('id');
  let doc = insertStructure(emptyDocument(ids()), 'chapter', 0, ids());
  doc = insertStructure(doc, 'paragraph', 1, ids());
  doc = { ...doc, title: 'Harbor Light' };
  const blockId = doc.blocks[1]!.id;
  doc = await editField({
    doc,
    blockId,
    field: 'text',
    start: 0,
    end: 0,
    insert: 'Hi',
    origin: 'keyboard',
    event: event('insertText', 'Hi'),
    now,
    newId: ids,
  });
  doc = await editField({
    doc,
    blockId,
    field: 'text',
    start: 2,
    end: 2,
    insert: ' paste',
    origin: 'paste',
    event: event('insertFromPaste', ' paste'),
    now,
    newId: ids,
  });
  const model = buildCertificationPageModel(doc, now, {
    bookTitle: 'Harbor Light',
    seriesLabel: 'Book 2 of Harbor Saga',
  });
  const plain = certificationPagePlain(model);
  assert.equal(model.totals.keyboardSealed, 1);
  assert.equal(model.totals.paste, 1);
  assert.equal(model.totals.drop, 0);
  assert.equal(model.totals.pastedUncertified, 1);
  assert.equal(model.totals.totalWords, 2);
  assert.equal(model.chapters, 1);
  assert.equal(model.paragraphs, 1);
  assert.equal(model.seriesLabel, 'Book 2 of Harbor Saga');
  assert.equal(model.exportedAtLabel, '14 October 2026, 18:00 UTC');
  assert.match(plain, /Keyboard-certified words: 1/);
  assert.match(plain, /Pasted \/ uncertified words: 1/);
  assert.match(plain, /Paste: 1/);
  assert.match(plain, /Drop: 0/);
  assert.match(plain, /Other: 0/);
  assert.match(plain, /Chapters: 1/);
  assert.match(plain, /Series: Book 2 of Harbor Saga/);
  assert.match(plain, /Exported: 14 October 2026, 18:00 UTC/);
  assert.match(plain, new RegExp(CERTIFICATION_PURPOSE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(plain, /Trust limit/);
  assert.match(plain, new RegExp(TRUST_STATEMENT.slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(plain, /how much was typed in/);
  assert.doesNotMatch(plain, /Hash:/);
  assert.doesNotMatch(plain, /\[paste\]/);
  assert.equal(plain.split('\f').length, 1);
});

test('chapter drag moves the following paragraph with the chapter', () => {
  const blocks = [
    { id: 'c1', type: 'chapter' as const, title: 'One', text: '', marks: [] },
    { id: 'p1', type: 'paragraph' as const, title: '', text: 'Body', marks: [] },
    { id: 'c2', type: 'chapter' as const, title: 'Two', text: '', marks: [] },
  ];
  const next = moveBlockRange(blocks, 0, 3);
  assert.deepEqual(
    next.map((b) => b.id),
    ['c2', 'c1', 'p1'],
  );
});
