import assert from 'node:assert/strict';
import test from 'node:test';
import { editorViewFromStored, editorViewLabel } from '../storage.ts';

test('a new session opens raw write, and a stored choice is kept', () => {
  assert.equal(editorViewFromStored(null), 'raw');
  assert.equal(editorViewFromStored(''), 'raw');
  assert.equal(editorViewFromStored('manuscript'), 'manuscript');
  assert.equal(editorViewFromStored('raw'), 'raw');
  assert.equal(editorViewFromStored('highlights'), 'highlights');
  assert.equal(editorViewFromStored('preview'), 'preview');
  assert.equal(editorViewFromStored('publication'), 'publication');
  assert.equal(editorViewFromStored('notes'), 'raw');
});

test('the label beside the view pill names the selected view', () => {
  assert.equal(editorViewLabel('raw'), 'Raw write');
  assert.equal(editorViewLabel('manuscript'), 'Manuscript view');
  assert.equal(editorViewLabel('highlights'), 'Certification highlights');
  assert.equal(editorViewLabel('preview'), 'Export preview');
  assert.equal(editorViewLabel('publication'), 'Publication');
});
