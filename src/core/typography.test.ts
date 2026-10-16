import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyDocument, insertStructure } from './document.ts';
import { loadLibrary, saveLibrary } from '../storage.ts';
import {
  resolveManuscriptTypography,
  setManuscriptTypography,
} from './typography.ts';
import { sequenceIds } from './uid.ts';

test('a font change keeps certification and is not an insertion', () => {
  const ids = sequenceIds('id');
  const doc = insertStructure(emptyDocument(ids()), 'paragraph', 0, ids());
  const next = setManuscriptTypography(doc, { fontFamily: 'courier', fontSize: 18 });
  assert.equal(next.fontFamily, 'courier');
  assert.equal(next.fontSize, 18);
  assert.equal(next.points, doc.points);
  assert.equal(next.provenance, doc.provenance);
  assert.equal(next.blocks, doc.blocks);
  assert.equal(next.moves, doc.moves);
  assert.equal(next.blocks[0]!.text, doc.blocks[0]!.text);
});

test('unknown face and size fall back to Palatino at 12pt', () => {
  const doc = emptyDocument('ms');
  const unset = resolveManuscriptTypography(doc);
  assert.equal(unset.font.id, 'palatino');
  assert.equal(unset.font.exportName, 'Palatino');
  assert.equal(unset.sizePt, 12);
  const junk = resolveManuscriptTypography({ fontFamily: 'comic-sans', fontSize: 99 });
  assert.equal(junk.font.id, 'palatino');
  assert.equal(junk.sizePt, 12);
  assert.equal(setManuscriptTypography(doc, { fontFamily: 'nope', fontSize: 7 }), doc);
});

test('the chosen face and size are saved with the book', () => {
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
    const document = setManuscriptTypography(emptyDocument('ms-font'), {
      fontFamily: 'georgia',
      fontSize: 16,
    });
    saveLibrary({
      version: 2,
      activeBookId: 'book-font',
      series: [],
      books: [{ id: 'book-font', title: 'Font book', document }],
    });
    const loaded = loadLibrary();
    assert.equal(loaded.ok, true);
    if (!loaded.ok || !loaded.library) return;
    const saved = loaded.library.books[0]!.document;
    assert.equal(saved.fontFamily, 'georgia');
    assert.equal(saved.fontSize, 16);
    assert.deepEqual(saved.points, document.points);

    const raw = JSON.parse(memory.get('humanuscript.library.v2')!) as {
      books: { document: { fontFamily: string; fontSize: number } }[];
    };
    raw.books[0]!.document.fontFamily = 'comic-sans';
    raw.books[0]!.document.fontSize = 99;
    memory.set('humanuscript.library.v2', JSON.stringify(raw));
    const dropped = loadLibrary();
    assert.equal(dropped.ok, true);
    if (!dropped.ok || !dropped.library) return;
    assert.equal(dropped.library.books[0]!.document.fontFamily, undefined);
    assert.equal(dropped.library.books[0]!.document.fontSize, undefined);
  } finally {
    if (previous) {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: previous });
    } else {
      Reflect.deleteProperty(globalThis, 'localStorage');
    }
  }
});
