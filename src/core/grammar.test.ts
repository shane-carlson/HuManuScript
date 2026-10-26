import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GRAMMAR_CHECK_COMMENT,
  contentHash,
  countOriginWords,
  type CertificationPoint,
} from './certification.ts';
import { acceptGrammarSuggestion, editField, emptyDocument, type ManuscriptDocument } from './document.ts';
import { buildCertificationPageModel, certificationPagePlain } from './certificationPage.ts';
import {
  blocksForGrammarScope,
  chooseHarperSource,
  filterLintsToFields,
  grammarEditForSuggestion,
  isNewerVersion,
  parseHarperManifest,
  shiftGrammarLints,
  type GrammarLint,
} from './grammar.ts';
import { sequenceIds } from './uid.ts';
import type { ManuscriptBlock } from './types.ts';

function block(id: string, type: ManuscriptBlock['type'], text = ''): ManuscriptBlock {
  const prose = type === 'paragraph' || type === 'blockquote';
  return { id, type, title: prose ? '' : text, text: prose ? text : '', marks: [] };
}

async function sealedParagraph(text: string, origin: 'keyboard' | 'dictation' = 'keyboard'): Promise<ManuscriptDocument> {
  const hash = await contentHash(text);
  const doc = emptyDocument('ms-grammar');
  const point: CertificationPoint = {
    id: 'p1',
    blockId: 'b1',
    spanId: 's1',
    text,
    contentHash: hash,
    sealedAt: '2026-10-24T18:00:00.000Z',
    updatedAt: '2026-10-24T18:00:00.000Z',
    origin,
    evidence: { inputTypes: [origin === 'dictation' ? 'insertFromDictation' : 'insertText'], eventCount: 1, events: [] },
    priorHashes: [],
  };
  return {
    ...doc,
    blocks: [block('b1', 'paragraph', text)],
    provenance: { b1: { title: [], text: [{ id: 's1', start: 0, end: text.length, origin, certificationId: 'p1' }] } },
    points: [point],
  };
}

test('version choice keeps the bundled Harper binary unless a download is newer', () => {
  assert.equal(isNewerVersion('2.14.0', '2.13.0'), true);
  assert.equal(isNewerVersion('2.13.0', '2.13.0'), false);
  assert.equal(isNewerVersion('not-a-version', '2.13.0'), false);
  assert.equal(
    chooseHarperSource({ bundledVersion: '2.13.0', cachedVersion: '2.13.0', remoteVersion: '2.14.0' }),
    'remote',
  );
  assert.equal(
    chooseHarperSource({ bundledVersion: '2.13.0', cachedVersion: '2.14.0', remoteVersion: null }),
    'cached',
  );
  assert.equal(
    chooseHarperSource({ bundledVersion: '2.13.0', cachedVersion: '2.12.0', remoteVersion: '2.12.9' }),
    'bundled',
  );
  const manifest = parseHarperManifest(
    {
      version: '2.14.0',
      engine: 'harper',
      wasm: 'harper_wasm_bg.wasm',
      sha256: 'a'.repeat(64),
    },
    'https://www.readywriter.one/harper-update/manifest.json',
  );
  assert.equal(manifest?.wasmUrl, 'https://www.readywriter.one/harper-update/harper_wasm_bg.wasm');
  assert.equal(parseHarperManifest({ version: '2.14.0', engine: 'other' }, manifest!.wasmUrl), null);
});

test('grammar scopes stop at the next heading of the same rank', () => {
  const blocks = [
    block('c1', 'chapter', 'One'),
    block('p1', 'paragraph', 'Alpha'),
    block('s1', 'scene', 'Morning'),
    block('p2', 'paragraph', 'Beta'),
    block('sec', 'section', 'Part'),
    block('p3', 'paragraph', 'Gamma'),
    block('c2', 'chapter', 'Two'),
    block('p4', 'paragraph', 'Delta'),
  ];
  assert.deepEqual(blocksForGrammarScope(blocks, 'p2', 'block').map((item) => item.id), ['p2']);
  assert.deepEqual(blocksForGrammarScope(blocks, 'p2', 'scene').map((item) => item.id), ['s1', 'p2', 'sec', 'p3']);
  assert.deepEqual(blocksForGrammarScope(blocks, 'p3', 'section').map((item) => item.id), ['sec', 'p3']);
  assert.deepEqual(blocksForGrammarScope(blocks, 'p2', 'chapter').map((item) => item.id), ['c1', 'p1', 's1', 'p2', 'sec', 'p3']);
  assert.equal(blocksForGrammarScope(blocks, 'p4', 'manuscript').length, blocks.length);
});

test('accepting a Harper suggestion keeps the seal and records the fixed comment', async () => {
  const source = 'This is a sentance.';
  const doc = await sealedParagraph(source);
  const start = source.indexOf('sentance');
  const next = await acceptGrammarSuggestion({
    doc,
    blockId: 'b1',
    field: 'text',
    start,
    end: start + 'sentance'.length,
    insert: 'sentence',
    suggestion: 'replace',
    lintKind: 'Spelling',
    message: 'Did you mean sentence?',
    dialect: 'American',
    engineVersion: '2.13.0',
    now: '2026-10-24T18:05:00.000Z',
    newId: sequenceIds('g'),
  });
  const point = next.points[0]!;
  const span = next.provenance.b1!.text[0]!;
  assert.equal(next.blocks[0]!.text, 'This is a sentence.');
  assert.equal(span.origin, 'keyboard');
  assert.equal(span.certificationId, 'p1');
  assert.equal(point.origin, 'keyboard');
  assert.equal(point.id, 'p1');
  assert.equal(point.text, 'This is a sentence.');
  assert.equal(point.contentHash, await contentHash(point.text));
  assert.deepEqual(point.priorHashes, [await contentHash(source)]);
  assert.equal(point.grammar?.generative, false);
  assert.equal(point.grammar?.comment, GRAMMAR_CHECK_COMMENT);
  assert.equal(point.grammar?.comment, 'Grammar Checked without Generative AI Usage via Harper');
  assert.equal(point.grammar?.checks[0]?.before, 'sentance');
  assert.equal(point.grammar?.checks[0]?.after, 'sentence');
  assert.equal(point.grammar?.checks[0]?.beforeHash, await contentHash('sentance'));
  assert.equal(point.grammar?.checks[0]?.afterHash, await contentHash('sentence'));
  assert.deepEqual(point.grammar?.checks[0]?.range, { start, end: start + 'sentence'.length });
  assert.equal(countOriginWords(point.text, next.provenance.b1!.text).certified, 4);
  const plain = certificationPagePlain(buildCertificationPageModel(next, '2026-10-24T18:05:00.000Z'));
  assert.match(plain, /Grammar checks: 1/);
  assert.match(plain, new RegExp(GRAMMAR_CHECK_COMMENT));
  assert.match(plain, /Keyboard-certified words: 4/);
});

test('a grammar change inside dictation stays dictation', async () => {
  const doc = await sealedParagraph('A error.', 'dictation');
  const next = await acceptGrammarSuggestion({
    doc,
    blockId: 'b1',
    field: 'text',
    start: 0,
    end: 1,
    insert: 'An',
    suggestion: 'replace',
    lintKind: 'Miscellaneous',
    message: 'Incorrect indefinite article.',
    dialect: 'American',
    engineVersion: '2.13.0',
    now: '2026-10-24T18:06:00.000Z',
    newId: sequenceIds('g'),
  });
  assert.equal(next.blocks[0]!.text, 'An error.');
  assert.equal(next.provenance.b1!.text[0]!.origin, 'dictation');
  assert.equal(next.points[0]!.origin, 'dictation');
  const page = buildCertificationPageModel(next, '2026-10-24T18:06:00.000Z');
  assert.equal(page.totals.dictationSealed, 2);
  assert.equal(page.totals.keyboardSealed, 0);
});

test('Harper cannot seal pasted text', async () => {
  const doc = await sealedParagraph('Keep this.');
  doc.provenance.b1!.text[0]!.origin = 'paste';
  delete doc.provenance.b1!.text[0]!.certificationId;
  doc.points = [];
  const next = await acceptGrammarSuggestion({
    doc,
    blockId: 'b1',
    field: 'text',
    start: 0,
    end: 4,
    insert: 'Held',
    suggestion: 'replace',
    lintKind: 'Spelling',
    message: 'suggestion',
    dialect: 'American',
    engineVersion: '2.13.0',
    now: '2026-10-24T18:07:00.000Z',
    newId: sequenceIds('g'),
  });
  assert.equal(next, doc);
  assert.equal(next.blocks[0]!.text, 'Keep this.');
});

test('a later keystroke moves the grammar flag and an overlapping edit clears it', async () => {
  const source = 'This is a sentance.';
  const start = source.indexOf('sentance');
  const accepted = await acceptGrammarSuggestion({
    doc: await sealedParagraph(source),
    blockId: 'b1',
    field: 'text',
    start,
    end: start + 'sentance'.length,
    insert: 'sentence',
    suggestion: 'replace',
    lintKind: 'Spelling',
    message: 'Did you mean sentence?',
    dialect: 'American',
    engineVersion: '2.13.0',
    now: '2026-10-24T18:05:00.000Z',
    newId: sequenceIds('g'),
  });
  const shifted = await editField({
    doc: accepted,
    blockId: 'b1',
    field: 'text',
    start: 0,
    end: 0,
    insert: 'X',
    origin: 'keyboard',
    event: null,
    now: '2026-10-24T18:08:00.000Z',
    newId: sequenceIds('k'),
  });
  const moved = shifted.points[0]!.grammar!.checks[0]!.range;
  assert.deepEqual(moved, { start: start + 1, end: start + 1 + 'sentence'.length });
  assert.equal(shifted.blocks[0]!.text.slice(moved!.start, moved!.end), 'sentence');
  assert.equal(shifted.provenance.b1!.text[0]!.origin, 'keyboard');

  const cleared = await editField({
    doc: shifted,
    blockId: 'b1',
    field: 'text',
    start: moved!.start,
    end: moved!.end,
    insert: 'line',
    origin: 'keyboard',
    event: null,
    now: '2026-10-24T18:09:00.000Z',
    newId: sequenceIds('k'),
  });
  assert.equal(cleared.points[0]!.grammar?.checks.length, 1);
  assert.equal(cleared.points[0]!.grammar?.checks[0]?.range, undefined);
  assert.equal(cleared.points[0]!.grammar?.comment, GRAMMAR_CHECK_COMMENT);
});

test('accepting one finding shifts the next finding in that paragraph', () => {
  const first: GrammarLint = {
    id: 'a',
    blockId: 'b1',
    field: 'text',
    start: 10,
    end: 18,
    message: 'spelling',
    lintKind: 'Spelling',
    problem: 'sentance',
    suggestions: [{ kind: 'replace', text: 'sentence' }],
  };
  const second: GrammarLint = {
    id: 'b',
    blockId: 'b1',
    field: 'text',
    start: 24,
    end: 25,
    message: 'article',
    lintKind: 'Miscellaneous',
    problem: 'a',
    suggestions: [{ kind: 'replace', text: 'an' }],
  };
  const edit = grammarEditForSuggestion(first, { kind: 'replace', text: 'line' });
  assert.equal(edit.insert, 'line');
  const shifted = shiftGrammarLints([first, second], first, edit.insert.length);
  assert.equal(shifted.length, 1);
  assert.equal(shifted[0]!.start, 20);
  assert.equal(shifted[0]!.end, 21);
});

test('a highlight keeps only the findings inside it', () => {
  const inside: GrammarLint = {
    id: 'in',
    blockId: 'b1',
    field: 'text',
    start: 2,
    end: 6,
    message: 'spelling',
    lintKind: 'Spelling',
    problem: 'word',
    suggestions: [],
  };
  const outside: GrammarLint = {
    id: 'out',
    blockId: 'b1',
    field: 'text',
    start: 10,
    end: 14,
    message: 'spelling',
    lintKind: 'Spelling',
    problem: 'else',
    suggestions: [],
  };
  const kept = filterLintsToFields([inside, outside], [{ blockId: 'b1', field: 'text', start: 0, end: 8 }]);
  assert.deepEqual(kept.map((lint) => lint.id), ['in']);
});
