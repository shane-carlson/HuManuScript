import assert from 'node:assert/strict';
import test from 'node:test';
import { editorViewFromStored } from '../storage.ts';

test('a new session opens raw write, and a stored choice is kept', () => {
  assert.equal(editorViewFromStored(null), 'raw');
  assert.equal(editorViewFromStored(''), 'raw');
  assert.equal(editorViewFromStored('manuscript'), 'manuscript');
  assert.equal(editorViewFromStored('raw'), 'raw');
  assert.equal(editorViewFromStored('highlights'), 'highlights');
  assert.equal(editorViewFromStored('preview'), 'preview');
  assert.equal(editorViewFromStored('notes'), 'raw');
});
