import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyDocument, insertStructure } from './document.ts';
import { sequenceIds } from './uid.ts';
import { applyRawFormat, assignRawKind, flattenRaw, rawHighlightFields, rawSegmentAt, replaceRawRange } from './rawWrite.ts';

const now = '2026-10-25T12:00:00.000Z';

test('typing on a blank page creates a sealed paragraph', async () => {
  const ids = sequenceIds('id');
  const next = await replaceRawRange({
    doc: emptyDocument('ms'),
    start: 0,
    end: 0,
    insert: 'Hello',
    origin: 'keyboard',
    now,
    newId: ids,
  });
  assert.equal(flattenRaw(next).text, 'Hello');
  assert.equal(next.blocks[0]?.type, 'paragraph');
  assert.equal(next.points.length, 1);
  assert.equal(next.points[0]?.origin, 'keyboard');
});

test('enter splits a paragraph and backspace joins it again', async () => {
  const ids = sequenceIds('id');
  const first = await replaceRawRange({
    doc: emptyDocument('ms'),
    start: 0,
    end: 0,
    insert: 'Hello',
    origin: 'keyboard',
    now,
    newId: ids,
  });
  const split = await replaceRawRange({
    doc: first,
    start: 5,
    end: 5,
    insert: '\n',
    origin: 'keyboard',
    now,
    newId: ids,
  });
  assert.deepEqual(
    split.blocks.filter((block) => block.type === 'paragraph').map((block) => block.text),
    ['Hello', ''],
  );
  const joined = await replaceRawRange({
    doc: split,
    start: 5,
    end: 6,
    insert: '',
    origin: null,
    now,
    newId: ids,
  });
  assert.equal(flattenRaw(joined).text, 'Hello');
  assert.equal(joined.blocks.filter((block) => block.type === 'paragraph').length, 1);
});

test('a highlight becomes a chapter and the rest stays a paragraph', async () => {
  const ids = sequenceIds('id');
  const typed = await replaceRawRange({
    doc: emptyDocument('ms'),
    start: 0,
    end: 0,
    insert: 'Dawn\nThe road was empty.',
    origin: 'keyboard',
    now,
    newId: ids,
  });
  const flat = flattenRaw(typed);
  const start = flat.text.indexOf('Dawn');
  const next = await assignRawKind({
    doc: typed,
    start,
    end: start + 'Dawn'.length,
    kind: 'chapter',
    now,
    newId: ids,
  });
  assert.equal(next.blocks[0]?.type, 'chapter');
  assert.equal(next.blocks[0]?.title, 'Dawn');
  assert.equal(next.blocks[1]?.type, 'paragraph');
  assert.equal(next.blocks[1]?.text, 'The road was empty.');
  assert.ok(next.points.some((point) => point.text === 'Dawn'));
});

test('a highlighted word does not leave a leading space on the paragraph', async () => {
  const ids = sequenceIds('id');
  const doc = await replaceRawRange({
    doc: emptyDocument('ms'),
    start: 0,
    end: 0,
    insert: 'Dawn arrives at the gate.',
    origin: 'keyboard',
    now,
    newId: ids,
  });
  const next = await assignRawKind({
    doc,
    start: 0,
    end: 4,
    kind: 'chapter',
    now,
    newId: ids,
  });
  assert.equal(next.blocks[0]?.title, 'Dawn');
  assert.equal(next.blocks[1]?.text, 'arrives at the gate.');
});

test('a highlight across lines becomes one block quote', async () => {
  const ids = sequenceIds('id');
  let doc = emptyDocument('ms');
  doc = await replaceRawRange({
    doc,
    start: 0,
    end: 0,
    insert: 'Keep this. Quoted line.',
    origin: 'keyboard',
    now,
    newId: ids,
  });
  doc = await replaceRawRange({
    doc,
    start: 'Keep this. '.length,
    end: 'Keep this. '.length,
    insert: '\n',
    origin: 'keyboard',
    now,
    newId: ids,
  });
  const flat = flattenRaw(doc);
  const start = flat.text.indexOf('Quoted');
  const next = await assignRawKind({
    doc,
    start,
    end: flat.text.length,
    kind: 'blockquote',
    now,
    newId: ids,
  });
  assert.equal(next.blocks[0]?.text, 'Keep this. ');
  assert.equal(next.blocks[1]?.type, 'blockquote');
  assert.equal(next.blocks[1]?.text, 'Quoted line.');
});

test('bold, italic, and strike apply to the highlighted words', async () => {
  const ids = sequenceIds('id');
  const doc = await replaceRawRange({
    doc: emptyDocument('ms'),
    start: 0,
    end: 0,
    insert: 'a bold claim',
    origin: 'keyboard',
    now,
    newId: ids,
  });
  const bold = applyRawFormat(doc, 2, 6, 'bold');
  const italic = applyRawFormat(bold, 7, 12, 'italic');
  const strike = applyRawFormat(italic, 0, 1, 'strike');
  const marks = strike.blocks[0]?.marks ?? [];
  assert.deepEqual(marks.map((mark) => [mark.kind, mark.start, mark.end]), [
    ['bold', 2, 6],
    ['italic', 7, 12],
    ['strike', 0, 1],
  ]);
});

test('turning a whole paragraph into a section keeps the sealed words', async () => {
  const ids = sequenceIds('id');
  const doc = await replaceRawRange({
    doc: emptyDocument('ms'),
    start: 0,
    end: 0,
    insert: 'Night market',
    origin: 'keyboard',
    now,
    newId: ids,
  });
  const next = await assignRawKind({
    doc,
    start: 0,
    end: 'Night market'.length,
    kind: 'section',
    now,
    newId: ids,
  });
  assert.equal(next.blocks[0]?.type, 'section');
  assert.equal(next.blocks[0]?.title, 'Night market');
  assert.equal(next.points[0]?.text, 'Night market');
  assert.equal(next.points[0]?.origin, 'keyboard');
});

test('an image stays beside the paragraph that precedes it', async () => {
  const ids = sequenceIds('id');
  let doc = await replaceRawRange({
    doc: emptyDocument('ms'),
    start: 0,
    end: 0,
    insert: 'Before',
    origin: 'keyboard',
    now,
    newId: ids,
  });
  doc = insertStructure(doc, 'image', doc.blocks.length, ids());
  doc = await replaceRawRange({
    doc,
    start: flattenRaw(doc).text.length,
    end: flattenRaw(doc).text.length,
    insert: '\nAfter',
    origin: 'keyboard',
    now,
    newId: ids,
  });
  const types = doc.blocks.map((block) => block.type);
  assert.deepEqual(types, ['paragraph', 'image', 'paragraph']);
  assert.equal(doc.blocks[2]?.text, 'After');
});

test('a raw highlight maps back to the blocks it covers', async () => {
  const ids = sequenceIds('id');
  const typed = await replaceRawRange({
    doc: emptyDocument('ms'),
    start: 0,
    end: 0,
    insert: 'Dawn\nThe road was empty.',
    origin: 'keyboard',
    now,
    newId: ids,
  });
  const flat = flattenRaw(typed);
  const dawn = flat.text.indexOf('Dawn');
  const chaptered = await assignRawKind({
    doc: typed,
    start: dawn,
    end: dawn + 'Dawn'.length,
    kind: 'chapter',
    now,
    newId: ids,
  });
  const page = flattenRaw(chaptered);
  const caret = rawSegmentAt(page, page.text.indexOf('road'));
  assert.equal(caret?.kind, 'paragraph');
  const fields = rawHighlightFields(chaptered, 0, page.text.length);
  assert.deepEqual(
    fields.map((field) => field.field),
    ['title', 'text'],
  );
  assert.equal(fields[0]?.end, 'Dawn'.length);
  assert.equal(fields[1]?.start, 0);
});
