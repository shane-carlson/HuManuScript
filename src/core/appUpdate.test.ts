import assert from 'node:assert/strict';
import test from 'node:test';
import { updateAvailableMessage } from './appUpdate.ts';

test('the header names the release that is available', () => {
  assert.equal(updateAvailableMessage('0.1.32'), 'Update 0.1.32 is available.');
  assert.equal(updateAvailableMessage(' 0.1.32 '), 'Update 0.1.32 is available.');
  assert.equal(updateAvailableMessage(''), 'An update is available.');
  assert.equal(updateAvailableMessage('latest-mac.yml?token=1'), 'An update is available.');
});
