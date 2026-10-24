import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatAppVersion } from './appVersion.ts';

test('formatAppVersion shows the marketing version and the build', () => {
  assert.equal(formatAppVersion({ version: '0.1.0', build: '42' }), '0.1.0 (42)');
  assert.equal(formatAppVersion({ version: '0.1.0', build: 'dev' }), '0.1.0 (dev)');
});
