import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatAppVersion } from './appVersion.ts';

test('formatAppVersion shows the baked pack version', () => {
  assert.equal(formatAppVersion({ version: '0.1.42', build: '42', label: '0.1.42' }), '0.1.42');
  assert.equal(formatAppVersion({ version: '0.1.42', build: '42' }), '0.1.42');
  assert.equal(formatAppVersion({ version: '0.1.0', build: 'dev' }), '0.1.0 (dev)');
});
