import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  collectSpellSuggestions,
  contextMenuLabels,
  menuSpellSuggestions,
  placeContextMenu,
  spellcheckReplacement,
  suggestionsFromPlatformEvent,
  wordAroundOffset,
} from './contextMenu.ts';
import { suggestSpellings } from './spellSuggest.ts';
import { contentHash, countOriginWords, SPELL_CHECK_COMMENT } from './certification.ts';
import { acceptSpellcheckSuggestion, editField, emptyDocument, insertStructure } from './document.ts';
import { sequenceIds } from './uid.ts';

test('wordAroundOffset returns the word under the caret, including the trailing boundary', () => {
  const text = 'Say teh again';
  assert.deepEqual(wordAroundOffset(text, 6), { word: 'teh', start: 4, end: 7 });
  assert.deepEqual(wordAroundOffset(text, 7), { word: 'teh', start: 4, end: 7 });
  assert.equal(wordAroundOffset(text, 8)?.word, 'again');
  assert.equal(wordAroundOffset('  ', 1), null);
});

test('platform suggestions are used and a missing platform does not invent any', () => {
  assert.deepEqual(collectSpellSuggestions({ word: 'teh' }), []);
  assert.deepEqual(collectSpellSuggestions({ word: 'recieve', platform: () => [] }), []);
  assert.deepEqual(
    collectSpellSuggestions({
      word: 'teh',
      platform: () => ['the', 'teh', '  ', 'the', 'tea'],
    }),
    ['the', 'tea'],
  );
  assert.deepEqual(
    suggestionsFromPlatformEvent({ dictionarySuggestions: ['receive', 'relieve'] }, 'recieve'),
    ['receive', 'relieve'],
  );
  assert.equal(suggestionsFromPlatformEvent({}, 'teh'), null);
  assert.deepEqual(
    collectSpellSuggestions({
      word: 'teh',
      event: { dictionarySuggestions: [] },
      platform: () => ['the'],
    }),
    [],
  );
});

test('the editor menu is suggestions, then clipboard, then inserts', () => {
  assert.deepEqual(contextMenuLabels([]), [
    'Cut',
    'Copy',
    'Paste',
    'Select all',
    'Insert page break',
    'Insert scene break',
    'Insert block quote',
    'Insert table…',
    'Insert image…',
  ]);
  assert.deepEqual(contextMenuLabels(['received']), [
    'received',
    'Cut',
    'Copy',
    'Paste',
    'Select all',
    'Insert page break',
    'Insert scene break',
    'Insert block quote',
    'Insert table…',
    'Insert image…',
  ]);
});

test('browser spelling falls back only when the system list cannot be read', () => {
  assert.equal(suggestSpellings('recieved')[0], 'received');
  assert.equal(suggestSpellings('Recieved')[0], 'Received');
  assert.deepEqual(suggestSpellings('the'), []);
  assert.deepEqual(
    menuSpellSuggestions({ word: 'recieved', fallback: suggestSpellings }),
    suggestSpellings('recieved'),
  );
  assert.deepEqual(
    menuSpellSuggestions({
      word: 'recieved',
      platform: () => ['receive'],
      fallback: () => ['should-not-run'],
    }),
    ['receive'],
  );
  assert.deepEqual(
    menuSpellSuggestions({
      word: 'recieved',
      event: { dictionarySuggestions: [] },
      fallback: () => ['should-not-run'],
    }),
    [],
  );
});

test('placeContextMenu keeps the menu inside every viewport edge', () => {
  const menu = { menuWidth: 220, menuHeight: 360, viewportWidth: 800, viewportHeight: 600 };
  const corners = [
    { anchorX: 4, anchorY: 4 },
    { anchorX: 790, anchorY: 4 },
    { anchorX: 4, anchorY: 590 },
    { anchorX: 790, anchorY: 590 },
    { anchorX: -40, anchorY: 700 },
  ];
  for (const anchor of corners) {
    const placed = placeContextMenu({ ...menu, ...anchor });
    const height = Math.min(menu.menuHeight, placed.maxHeight);
    const width = Math.min(menu.menuWidth, placed.maxWidth);
    assert.ok(placed.top >= 8, `top ${placed.top} for ${anchor.anchorX},${anchor.anchorY}`);
    assert.ok(placed.left >= 8, `left ${placed.left}`);
    assert.ok(placed.top + height <= 600 - 8, `bottom ${placed.top + height}`);
    assert.ok(placed.left + width <= 800 - 8, `right ${placed.left + width}`);
  }
});

test('placeContextMenu flips above and to the left when the anchor is near that edge', () => {
  const placed = placeContextMenu({
    anchorX: 760,
    anchorY: 540,
    menuWidth: 200,
    menuHeight: 180,
    viewportWidth: 800,
    viewportHeight: 600,
  });
  assert.ok(placed.top < 540, 'opens above the anchor');
  assert.ok(placed.left < 760, 'opens to the left of the anchor');
  assert.equal(placed.top, 540 - 180);
  assert.equal(placed.left, 760 - 200);
});

test('spellcheck replacement stays inside the keyboard seal and records the spellcheck note', async () => {
  const ids = sequenceIds('id');
  const now = '2026-10-16T12:00:00.000Z';
  let doc = insertStructure(emptyDocument(ids()), 'paragraph', 0, ids());
  const blockId = doc.blocks[0]!.id;
  doc = await editField({
    doc,
    blockId,
    field: 'text',
    start: 0,
    end: 0,
    insert: 'teh light',
    origin: 'keyboard',
    event: { at: now, inputType: 'insertText', data: 'teh light', trusted: true },
    now,
    newId: ids,
  });
  const before = countOriginWords(doc.blocks[0]!.text, doc.provenance[blockId]!.text);
  assert.equal(before.certified, 2);
  assert.equal(doc.points.length, 1);
  const pointId = doc.points[0]!.id;

  const change = spellcheckReplacement({ start: 0, end: 3, insert: 'the', at: now });
  assert.equal(change.origin, null);
  assert.equal(change.check, 'spellcheck');
  assert.equal(change.event, null);

  doc = await acceptSpellcheckSuggestion({
    doc,
    blockId,
    field: 'text',
    start: change.start,
    end: change.end,
    insert: change.insert,
    now,
    newId: ids,
  });
  const text = doc.blocks[0]!.text;
  assert.equal(text, 'the light');
  const spans = doc.provenance[blockId]!.text;
  assert.equal(spans.length, 1);
  assert.equal(spans[0]!.origin, 'keyboard');
  assert.equal(spans[0]!.certificationId, pointId);
  assert.equal(spans.some((span) => span.origin === 'paste' || span.origin === 'drop' || span.origin === 'other'), false);
  const after = countOriginWords(text, spans);
  assert.equal(after.certified, 2);
  assert.equal(after.uncertified, 0);
  assert.equal(doc.points.length, 1);
  assert.equal(doc.points[0]!.id, pointId);
  assert.equal(doc.points[0]!.origin, 'keyboard');
  assert.equal(doc.points[0]!.text, 'the light');
  assert.equal(doc.points[0]!.contentHash, await contentHash('the light'));
  assert.equal(doc.points[0]!.spellcheck?.comment, SPELL_CHECK_COMMENT);
  assert.equal(doc.points[0]!.spellcheck?.generative, false);
});
