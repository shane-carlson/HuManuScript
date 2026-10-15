import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatMixLabel, mixPercentages, provenanceMix } from './provenanceMix.ts';

test('mix percentages by character', () => {
  const mix = provenanceMix('abcdef', [
    { id: 'a', start: 0, end: 3, origin: 'keyboard', certificationId: 'p1' },
    { id: 'b', start: 3, end: 6, origin: 'paste' },
  ]);
  assert.equal(mix.sealedChars, 3);
  assert.equal(mix.pasteChars, 3);
  const p = mixPercentages(mix);
  assert.equal(p.sealed, 50);
  assert.equal(p.paste, 50);
  assert.equal(formatMixLabel(mix), '50% sealed · 50% pasted');
});
