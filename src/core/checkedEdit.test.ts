import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildCertificationPageModel,
  certificationPagePlain,
} from './certificationPage.ts';
import {
  contentHash,
  countOriginWords,
  GRAMMAR_CHECK_COMMENT,
  SPELL_CHECK_COMMENT,
} from './certification.ts';
import {
  acceptGrammarSuggestion,
  acceptSpellcheckSuggestion,
  certificationExport,
  editField,
  emptyDocument,
  insertStructure,
  reconcileLoadedDocument,
} from './document.ts';
import { sequenceIds } from './uid.ts';

const now = '2026-10-16T12:00:00.000Z';

async function sealed(text: string, origin: 'keyboard' | 'dictation' | 'paste' | 'drop') {
  const ids = sequenceIds('id');
  let doc = insertStructure(emptyDocument(ids()), 'paragraph', 0, ids());
  const blockId = doc.blocks[0]!.id;
  doc = await editField({
    doc,
    blockId,
    field: 'text',
    start: 0,
    end: 0,
    insert: text,
    origin,
    event: {
      at: now,
      inputType: origin === 'dictation' ? 'insertFromDictation' : origin === 'paste' ? 'insertFromPaste' : origin === 'drop' ? 'insertFromDrop' : 'insertText',
      data: text,
      trusted: true,
    },
    now,
    newId: ids,
  });
  return { doc, blockId, ids };
}

const grammar = {
  suggestion: 'replace' as const,
  lintKind: 'Spelling',
  message: 'Did you mean sentence?',
  dialect: 'American' as const,
  engineVersion: '2.13.0',
};

test('a Harper fix inside a keyboard seal stays keyboard and keeps Harper’s note', async () => {
  const source = 'This is a sentance.';
  const { doc, blockId, ids } = await sealed(source, 'keyboard');
  const start = source.indexOf('sentance');
  const pointId = doc.points[0]!.id;
  const next = await acceptGrammarSuggestion({
    doc,
    blockId,
    field: 'text',
    start,
    end: start + 'sentance'.length,
    insert: 'sentence',
    ...grammar,
    now,
    newId: ids,
  });
  const point = next.points[0]!;
  const span = next.provenance[blockId]!.text[0]!;
  assert.equal(next.blocks[0]!.text, 'This is a sentence.');
  assert.equal(span.origin, 'keyboard');
  assert.equal(span.certificationId, pointId);
  assert.equal(point.id, pointId);
  assert.equal(point.origin, 'keyboard');
  assert.equal(point.text, 'This is a sentence.');
  assert.equal(point.contentHash, await contentHash(point.text));
  assert.deepEqual(point.priorHashes, [await contentHash(source)]);
  assert.equal(point.grammar?.engine, 'harper');
  assert.equal(point.grammar?.generative, false);
  assert.equal(point.grammar?.comment, GRAMMAR_CHECK_COMMENT);
  assert.equal(point.grammar?.comment, 'Grammar Checked without Generative AI Usage via Harper');
  assert.equal(point.grammar?.checks[0]?.before, 'sentance');
  assert.equal(point.grammar?.checks[0]?.after, 'sentence');
  assert.equal(point.grammar?.checks[0]?.beforeHash, await contentHash('sentance'));
  assert.equal(point.grammar?.checks[0]?.afterHash, await contentHash('sentence'));
  assert.deepEqual(point.grammar?.checks[0]?.range, { start, end: start + 'sentence'.length });
  assert.equal(point.spellcheck, undefined);
  assert.equal(countOriginWords(point.text, next.provenance[blockId]!.text).certified, 4);
  assert.equal(next.provenance[blockId]!.text.some((item) => item.origin === 'paste' || item.origin === 'drop' || item.origin === 'other'), false);
  const plain = certificationPagePlain(buildCertificationPageModel(next, now));
  assert.match(plain, /Grammar checks: 1/);
  assert.match(plain, /Grammar Checked without Generative AI Usage via Harper/);
  assert.doesNotMatch(plain, /Spell checks:/);
  assert.match(plain, /Keyboard-certified words: 4/);
  const reloaded = await reconcileLoadedDocument(next, now, ids);
  assert.equal(reloaded.points[0]!.grammar?.comment, 'Grammar Checked without Generative AI Usage via Harper');
  assert.equal(reloaded.provenance[blockId]!.text[0]!.origin, 'keyboard');
  assert.equal(certificationExport(reloaded, now).points[0]!.grammar?.comment, GRAMMAR_CHECK_COMMENT);
});

test('a Harper fix inside dictation stays dictation', async () => {
  const { doc, blockId, ids } = await sealed('A error.', 'dictation');
  const next = await acceptGrammarSuggestion({
    doc,
    blockId,
    field: 'text',
    start: 0,
    end: 1,
    insert: 'An',
    ...grammar,
    lintKind: 'Miscellaneous',
    message: 'Incorrect indefinite article.',
    now,
    newId: ids,
  });
  assert.equal(next.blocks[0]!.text, 'An error.');
  assert.equal(next.provenance[blockId]!.text[0]!.origin, 'dictation');
  assert.equal(next.points[0]!.origin, 'dictation');
  assert.equal(next.points[0]!.grammar?.comment, 'Grammar Checked without Generative AI Usage via Harper');
  const page = buildCertificationPageModel(next, now);
  assert.equal(page.totals.dictationSealed, 2);
  assert.equal(page.totals.keyboardSealed, 0);
  assert.equal(page.totals.paste, 0);
  assert.equal(page.totals.other, 0);
});

test('Harper does not seal pasted text and does not reclassify it', async () => {
  const { doc, blockId, ids } = await sealed('Keep this.', 'paste');
  const next = await acceptGrammarSuggestion({
    doc,
    blockId,
    field: 'text',
    start: 0,
    end: 4,
    insert: 'Held',
    ...grammar,
    now,
    newId: ids,
  });
  assert.equal(next, doc);
  assert.equal(next.blocks[0]!.text, 'Keep this.');
  assert.equal(next.provenance[blockId]!.text[0]!.origin, 'paste');
  assert.equal(next.points.length, 0);
});

test('spellcheck inside dictation stays dictation and records the spellcheck note', async () => {
  const { doc, blockId, ids } = await sealed('teh light', 'dictation');
  const pointId = doc.points[0]!.id;
  const next = await acceptSpellcheckSuggestion({
    doc,
    blockId,
    field: 'text',
    start: 0,
    end: 3,
    insert: 'the',
    now,
    newId: ids,
  });
  assert.equal(next.blocks[0]!.text, 'the light');
  assert.equal(next.provenance[blockId]!.text[0]!.origin, 'dictation');
  assert.equal(next.provenance[blockId]!.text[0]!.certificationId, pointId);
  assert.equal(next.points[0]!.origin, 'dictation');
  assert.equal(next.points[0]!.spellcheck?.comment, SPELL_CHECK_COMMENT);
  assert.equal(next.points[0]!.spellcheck?.comment, 'Spell Checked without Generative AI Usage');
  assert.equal(next.points[0]!.spellcheck?.generative, false);
  assert.equal(next.points[0]!.grammar, undefined);
  assert.equal(countOriginWords(next.blocks[0]!.text, next.provenance[blockId]!.text).certified, 2);
  const plain = certificationPagePlain(buildCertificationPageModel(next, now));
  assert.match(plain, /Spell checks: 1/);
  assert.match(plain, /Spell Checked without Generative AI Usage/);
  assert.doesNotMatch(plain, /Grammar checks:/);
  assert.match(plain, /Dictation-certified words: 2/);
  const record = certificationExport(next, now);
  assert.equal(record.points[0]!.spellcheck?.comment, SPELL_CHECK_COMMENT);
  assert.equal(record.points[0]!.origin, 'dictation');
});

test('spellcheck inside paste stays paste and does not create a seal', async () => {
  const { doc, blockId, ids } = await sealed('teh light', 'paste');
  const next = await acceptSpellcheckSuggestion({
    doc,
    blockId,
    field: 'text',
    start: 0,
    end: 3,
    insert: 'the',
    now,
    newId: ids,
  });
  assert.equal(next.blocks[0]!.text, 'the light');
  assert.equal(next.provenance[blockId]!.text.length, 1);
  assert.equal(next.provenance[blockId]!.text[0]!.origin, 'paste');
  assert.equal(next.provenance[blockId]!.text[0]!.certificationId, undefined);
  assert.equal(next.points.length, 0);
});

test('spellcheck and Harper notes stay on the same keyboard seal', async () => {
  const source = 'teh sentance.';
  const { doc, blockId, ids } = await sealed(source, 'keyboard');
  const grammarStart = source.indexOf('sentance');
  const withGrammar = await acceptGrammarSuggestion({
    doc,
    blockId,
    field: 'text',
    start: grammarStart,
    end: grammarStart + 'sentance'.length,
    insert: 'sentence',
    ...grammar,
    now,
    newId: ids,
  });
  const next = await acceptSpellcheckSuggestion({
    doc: withGrammar,
    blockId,
    field: 'text',
    start: 0,
    end: 3,
    insert: 'the',
    now,
    newId: ids,
  });
  assert.equal(next.blocks[0]!.text, 'the sentence.');
  assert.equal(next.provenance[blockId]!.text.length, 1);
  assert.equal(next.provenance[blockId]!.text[0]!.origin, 'keyboard');
  assert.equal(next.points.length, 1);
  assert.equal(next.points[0]!.origin, 'keyboard');
  assert.equal(next.points[0]!.grammar?.comment, 'Grammar Checked without Generative AI Usage via Harper');
  assert.equal(next.points[0]!.spellcheck?.comment, 'Spell Checked without Generative AI Usage');
  assert.equal(next.points[0]!.contentHash, await contentHash('the sentence.'));
  const plain = certificationPagePlain(buildCertificationPageModel(next, now));
  assert.match(plain, /Spell checks: 1/);
  assert.match(plain, /Grammar checks: 1/);
  assert.match(plain, /Spell Checked without Generative AI Usage/);
  assert.match(plain, /Grammar Checked without Generative AI Usage via Harper/);
});

test('a correction that crosses a seal boundary does not uncertify the seal', async () => {
  const { doc, blockId, ids } = await sealed('te', 'keyboard');
  const pointId = doc.points[0]!.id;
  const pasted = await editField({
    doc,
    blockId,
    field: 'text',
    start: 2,
    end: 2,
    insert: 'h',
    origin: 'paste',
    event: { at: now, inputType: 'insertFromPaste', data: 'h', trusted: true },
    now,
    newId: ids,
  });
  assert.equal(pasted.blocks[0]!.text, 'teh');
  const next = await acceptSpellcheckSuggestion({
    doc: pasted,
    blockId,
    field: 'text',
    start: 0,
    end: 3,
    insert: 'the',
    now,
    newId: ids,
  });
  assert.equal(next, pasted);
  assert.equal(next.blocks[0]!.text, 'teh');
  const keyboard = next.provenance[blockId]!.text.find((span) => span.origin === 'keyboard');
  assert.equal(keyboard?.certificationId, pointId);
  assert.equal(next.points[0]!.origin, 'keyboard');
  assert.equal(next.points[0]!.text, 'te');
});

test('a later keystroke moves the check note and an overlapping edit keeps the comment', async () => {
  const source = 'This is a sentance.';
  const { doc, blockId, ids } = await sealed(source, 'keyboard');
  const start = source.indexOf('sentance');
  const accepted = await acceptSpellcheckSuggestion({
    doc,
    blockId,
    field: 'text',
    start,
    end: start + 'sentance'.length,
    insert: 'sentence',
    now,
    newId: ids,
  });
  const shifted = await editField({
    doc: accepted,
    blockId,
    field: 'text',
    start: 0,
    end: 0,
    insert: 'X',
    origin: 'keyboard',
    event: { at: now, inputType: 'insertText', data: 'X', trusted: true },
    now,
    newId: ids,
  });
  const moved = shifted.points[0]!.spellcheck!.checks[0]!.range;
  assert.deepEqual(moved, { start: start + 1, end: start + 1 + 'sentence'.length });
  assert.equal(shifted.blocks[0]!.text.slice(moved!.start, moved!.end), 'sentence');
  assert.equal(shifted.provenance[blockId]!.text[0]!.origin, 'keyboard');
  assert.equal(shifted.points[0]!.spellcheck?.comment, SPELL_CHECK_COMMENT);

  const cleared = await editField({
    doc: shifted,
    blockId,
    field: 'text',
    start: moved!.start,
    end: moved!.end,
    insert: 'line',
    origin: 'keyboard',
    event: { at: now, inputType: 'insertText', data: 'line', trusted: true },
    now,
    newId: ids,
  });
  assert.equal(cleared.provenance[blockId]!.text[0]!.origin, 'keyboard');
  assert.equal(cleared.points[0]!.spellcheck?.checks.length, 1);
  assert.equal(cleared.points[0]!.spellcheck?.checks[0]?.range, undefined);
  assert.equal(cleared.points[0]!.spellcheck?.comment, SPELL_CHECK_COMMENT);
  assert.equal(cleared.points[0]!.contentHash, await contentHash(cleared.points[0]!.text));
});

test('a saved check note with the wrong sentence is dropped and the seal remains', async () => {
  const { doc, blockId, ids } = await sealed('teh light', 'keyboard');
  const accepted = await acceptSpellcheckSuggestion({
    doc,
    blockId,
    field: 'text',
    start: 0,
    end: 3,
    insert: 'the',
    now,
    newId: ids,
  });
  const pointId = accepted.points[0]!.id;
  const tampered = {
    ...accepted,
    points: accepted.points.map((point) => ({
      ...point,
      spellcheck: {
        ...point.spellcheck!,
        comment: 'Checked by a cloud model' as typeof SPELL_CHECK_COMMENT,
      },
      grammar: {
        schema: 1 as const,
        used: true as const,
        engine: 'harper' as const,
        generative: false as const,
        comment: 'Grammar checked in the cloud' as typeof GRAMMAR_CHECK_COMMENT,
        checks: [],
      },
    })),
  };
  const loaded = await reconcileLoadedDocument(tampered, now, ids);
  assert.equal(loaded.points[0]!.id, pointId);
  assert.equal(loaded.points[0]!.origin, 'keyboard');
  assert.equal(loaded.points[0]!.text, 'the light');
  assert.equal(loaded.points[0]!.spellcheck, undefined);
  assert.equal(loaded.points[0]!.grammar, undefined);
  assert.equal(loaded.provenance[blockId]!.text[0]!.origin, 'keyboard');
  assert.equal(loaded.provenance[blockId]!.text[0]!.certificationId, pointId);
});
