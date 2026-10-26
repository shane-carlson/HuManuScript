const assert = require('node:assert/strict');
const test = require('node:test');
const { HOUR_MS, safeUpdateError, shouldCheckForUpdates, watchForUpdates } = require('./autoUpdate.cjs');

test('only a packaged numeric build checks for a newer release', () => {
  assert.equal(shouldCheckForUpdates({ isPackaged: true, build: '15' }), true);
  assert.equal(shouldCheckForUpdates({ isPackaged: true, build: ' 15 ' }), true);
  assert.equal(shouldCheckForUpdates({ isPackaged: false, build: '15' }), false);
  assert.equal(shouldCheckForUpdates({ isPackaged: true, build: 'dev' }), false);
  assert.equal(shouldCheckForUpdates({ isPackaged: true, build: '' }), false);
  assert.equal(shouldCheckForUpdates({ isPackaged: true, build: '1.2' }), false);
});

test('update errors drop query strings', () => {
  assert.equal(
    safeUpdateError(new Error('https://github.com/example/feed?token=secret')),
    'https://github.com/example/feed',
  );
  assert.equal(safeUpdateError(null), 'unknown error');
});

test('a downloaded update is installed without a manual prompt', async () => {
  const lines = [];
  const calls = [];
  const handlers = {};
  let scheduled = 0;
  const fake = {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    logger: null,
    on(event, fn) {
      handlers[event] = fn;
    },
    checkForUpdates() {
      calls.push('check');
      return Promise.resolve();
    },
    quitAndInstall() {
      calls.push('install');
    },
  };
  watchForUpdates(fake, (line) => lines.push(line), {
    schedule: (_fn, ms) => {
      scheduled = ms;
      return { unref() {} };
    },
    delay: (fn) => {
      fn();
      return { unref() {} };
    },
  });
  assert.equal(fake.autoDownload, true);
  assert.equal(fake.autoInstallOnAppQuit, true);
  assert.equal(scheduled, HOUR_MS);
  assert.deepEqual(calls, ['check']);

  handlers['update-available']({ version: '0.1.16' });
  handlers['update-downloaded']({ version: '0.1.16' });
  handlers['update-downloaded']({ version: '0.1.16' });
  assert.deepEqual(calls, ['check', 'install']);
  assert.deepEqual(lines, ['Update available: 0.1.16.', 'Update downloaded: 0.1.16. Installing.']);

  handlers.error(new Error('https://updates.example/latest-mac.yml?access_token=secret'));
  assert.equal(lines.at(-1), 'Update check failed: https://updates.example/latest-mac.yml');
});
