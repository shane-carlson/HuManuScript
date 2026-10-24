import assert from 'node:assert/strict';
import test from 'node:test';
import { lintBlockText } from './harperEngine.ts';

test('Harper flags a local spelling mistake without leaving the machine', async () => {
  const hits = await lintBlockText('This is a test sentance.');
  const spelling = hits.find((hit) => hit.problem === 'sentance');
  assert.ok(spelling);
  assert.equal(spelling.lintKind, 'Spelling');
  assert.equal(spelling.suggestions.some((suggestion) => suggestion.kind === 'replace' && suggestion.text === 'sentence'), true);
});
