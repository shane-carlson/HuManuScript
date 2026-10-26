import assert from 'node:assert/strict';
import { test } from 'node:test';
import { editField, emptyDocument, insertHeadingWithParagraph, insertStructure } from './document.ts';
import { certificationSummary } from './document.ts';
import { chapterWordCount, firstProseAfter, manuscriptStats } from './manuscript.ts';
import { notesPanelPhase, readBookNotes } from './notes.ts';
import { sequenceIds } from './uid.ts';
import { typewriterScrollDelta } from './typewriter.ts';
import {
  applyWritingAids,
  bookSceneNotePlaces,
  parseGoalCount,
  readWritingAids,
  sessionWordsWritten,
  setChapterWordGoal,
  wordGoalPhase,
} from './wordGoal.ts';

test('word count includes a chapter title the way certification does', async () => {
  const ids = sequenceIds('id');
  let doc = insertStructure(emptyDocument(ids()), 'chapter', 0, ids());
  const chapterId = doc.blocks[0]!.id;
  doc = await editField({
    doc,
    blockId: chapterId,
    field: 'title',
    start: 0,
    end: 0,
    insert: 'The door stuck. She recieved the note and kept walking.',
    origin: 'keyboard',
    event: { at: '2026-10-24T00:00:00.000Z', inputType: 'insertText', data: 'x', trusted: true },
    now: '2026-10-24T00:00:00.000Z',
    newId: ids,
  });
  const stats = manuscriptStats(doc.blocks);
  const seals = certificationSummary(doc);
  assert.equal(stats.chapters, 1);
  assert.equal(stats.words, 10);
  assert.equal(stats.words, seals.certified + seals.uncertified);
  assert.equal(chapterWordCount(doc.blocks, chapterId), 10);
});

test('a click under a chapter uses the paragraph beneath it', () => {
  const blocks = [
    { id: 'c1', type: 'chapter' as const, title: '', text: '', marks: [] },
    { id: 'p1', type: 'paragraph' as const, title: '', text: 'Body', marks: [] },
    { id: 'c2', type: 'chapter' as const, title: '', text: '', marks: [] },
  ];
  assert.deepEqual(firstProseAfter(blocks, 0), { id: 'p1' });
  assert.deepEqual(firstProseAfter(blocks, 2), { insertAt: 3 });
  assert.deepEqual(firstProseAfter([], -1), { insertAt: 0 });
});

test('starting a chapter also opens a paragraph under the title', () => {
  const ids = sequenceIds('id');
  const doc = insertHeadingWithParagraph(emptyDocument(ids()), 'chapter', 0, 'c1', 'p1');
  assert.deepEqual(doc.blocks.map((block) => block.type), ['chapter', 'paragraph']);
  assert.equal(doc.blocks[1]!.id, 'p1');
});

test('typewriter scrolling moves the page so the caret stays on the line', () => {
  assert.equal(
    typewriterScrollDelta({ caretTop: 400, caretBottom: 420, viewTop: 0, viewBottom: 500 }),
    410 - 210,
  );
  assert.equal(
    typewriterScrollDelta({ caretTop: 200, caretBottom: 220, viewTop: 0, viewBottom: 500, anchorRatio: 0.42 }),
    0,
  );
  assert.equal(typewriterScrollDelta({ caretTop: 0, caretBottom: 10, viewTop: 0, viewBottom: 0 }), 0);
});

test('notes round-trip and the panel phases', () => {
  assert.equal(readBookNotes(undefined), undefined);
  assert.equal(readBookNotes({ characters: 'nope', scenes: [] })?.unreadable, true);
  const notes = readBookNotes({
    characters: [{ id: 'c', name: 'Mara', body: 'Keeps the note.' }],
    scenes: [{ id: 's', blockId: 'scene-1', body: 'The door sticks.' }],
  });
  assert.equal(notes?.characters[0]?.name, 'Mara');
  assert.equal(notes?.scenes[0]?.body, 'The door sticks.');
  assert.equal(notesPanelPhase({ ready: false, unreadable: false, count: 0 }), 'loading');
  assert.equal(notesPanelPhase({ ready: true, unreadable: true, count: 0 }), 'error');
  assert.equal(notesPanelPhase({ ready: true, unreadable: false, count: 0 }), 'empty');
  assert.equal(notesPanelPhase({ ready: true, unreadable: false, count: 1 }), 'ready');
});

test('book notes list every scene, not only the one on the page', () => {
  const blocks = [
    { id: 'c1', type: 'chapter' as const, title: 'Arrival', text: '', marks: [] },
    { id: 's1', type: 'scene' as const, title: '', text: '', marks: [] },
    { id: 'p1', type: 'paragraph' as const, title: '', text: 'She waited.', marks: [] },
    { id: 'c2', type: 'chapter' as const, title: '', text: '', marks: [] },
    { id: 's2', type: 'scene' as const, title: 'The road', text: '', marks: [] },
  ];
  const notes = [
    { blockId: 's1' },
    { blockId: 's2' },
    { blockId: 'gone' },
  ];
  const places = bookSceneNotePlaces(blocks, notes, 'p1');
  assert.deepEqual(places, [
    { blockId: 's1', label: 'Chapter 1 · Arrival · Scene 1', current: true, missing: false },
    { blockId: 's2', label: 'Chapter 2 · The road', current: false, missing: false },
    { blockId: 'gone', label: 'Removed from this book', current: false, missing: true },
  ]);
  const onlyCurrent = bookSceneNotePlaces(blocks, [], 'c2');
  assert.deepEqual(onlyCurrent.map((place) => place.blockId), ['c2']);
  assert.equal(onlyCurrent[0]?.current, true);
});

test('a chapter goal stays put when an undo snapshot is restored', () => {
  const ids = sequenceIds('id');
  let doc = insertStructure(emptyDocument(ids()), 'chapter', 0, ids());
  const chapterId = doc.blocks[0]!.id;
  doc = setChapterWordGoal(doc, chapterId, 1500);
  const aids = readWritingAids(doc);
  const snapshot = setChapterWordGoal(doc, chapterId, null);
  const restored = applyWritingAids(snapshot, aids);
  assert.equal(restored.blocks[0]!.wordGoal, 1500);
  assert.equal(parseGoalCount('1500'), 1500);
  assert.equal(parseGoalCount('0'), null);
  assert.equal(parseGoalCount('1.5'), null);
  assert.equal(sessionWordsWritten(1200, { bookId: 'b', target: 500, baseline: 1000 }, 'b'), 200);
  assert.equal(wordGoalPhase({ ready: true, error: '', target: null }), 'empty');
  assert.equal(wordGoalPhase({ ready: true, error: 'Enter a whole number of words.', target: null }), 'error');
  assert.equal(wordGoalPhase({ ready: false, error: '', target: 10 }), 'loading');
});
