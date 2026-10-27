const assert = require('node:assert/strict');
const test = require('node:test');
const {
  HOUR_MS,
  readUpdateState,
  releasedVersion,
  safeUpdateError,
  shouldCheckForUpdates,
  watchForUpdates,
} = require('./autoUpdate.cjs');

test('only a packaged numeric build checks for a newer release', () => {
  assert.equal(shouldCheckForUpdates({ isPackaged: true, build: '15' }), true);
  assert.equal(shouldCheckForUpdates({ isPackaged: true, build: ' 15 ' }), true);
  assert.equal(shouldCheckForUpdates({ isPackaged: false, build: '15' }), false);
  assert.equal(shouldCheckForUpdates({ isPackaged: true, build: 'dev' }), false);
  assert.equal(shouldCheckForUpdates({ isPackaged: true, build: '' }), false);
  assert.equal(shouldCheckForUpdates({ isPackaged: true, build: '1.2' }), false);
});

test('a release version is the only string shown for an update', () => {
  assert.equal(releasedVersion({ version: '0.1.32' }), '0.1.32');
  assert.equal(releasedVersion({ version: ' 0.1.32 ' }), '0.1.32');
  assert.equal(releasedVersion({ version: 'latest-mac.yml?token=secret' }), '');
  assert.equal(releasedVersion(null), '');
});

test('update errors drop query strings', () => {
  assert.equal(
    safeUpdateError(new Error('https://github.com/example/feed?token=secret')),
    'https://github.com/example/feed',
  );
  assert.equal(safeUpdateError(null), 'unknown error');
});

test('a notice keeps the release version and drops anything else', () => {
  assert.deepEqual(readUpdateState({ phase: 'downloading', version: '0.1.36', percent: 140.2 }), {
    phase: 'downloading',
    version: '0.1.36',
    percent: 100,
  });
  assert.deepEqual(readUpdateState({ version: '0.1.36' }), {
    phase: 'available',
    version: '0.1.36',
    percent: 0,
  });
  assert.equal(readUpdateState({ phase: 'nope', version: '0.1.36' }), null);
  assert.deepEqual(readUpdateState({ phase: 'available', version: 'latest-mac.yml?token=1' }), {
    phase: 'available',
    version: '',
    percent: 0,
  });
  assert.equal(readUpdateState(null), null);
});

function fakeUpdater(calls) {
  const handlers = {};
  const fake = {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    logger: null,
    on(event, fn) {
      handlers[event] = fn;
    },
    checkForUpdates() {
      calls.push('check');
      return Promise.resolve();
    },
    downloadUpdate() {
      calls.push('download');
      return Promise.resolve();
    },
    quitAndInstall() {
      calls.push('install');
    },
  };
  return { fake, handlers };
}

function start(fake, lines, shown) {
  let scheduled = 0;
  const controls = watchForUpdates(
    fake,
    (line) => lines.push(line),
    {
      schedule: (_fn, ms) => {
        scheduled = ms;
        return { unref() {} };
      },
      delay: (fn) => {
        fn();
        return { unref() {} };
      },
    },
    (info) => shown.push(info),
  );
  return { controls, scheduled: () => scheduled };
}

test('a newer release waits for a download confirmation and a restart confirmation', () => {
  const lines = [];
  const shown = [];
  const calls = [];
  const { fake, handlers } = fakeUpdater(calls);
  const { controls, scheduled } = start(fake, lines, shown);

  assert.equal(fake.autoDownload, false);
  assert.equal(fake.autoInstallOnAppQuit, false);
  assert.equal(scheduled(), HOUR_MS);
  assert.deepEqual(calls, ['check']);

  handlers['update-available']({ version: '0.1.36' });
  assert.deepEqual(shown, [{ phase: 'available', version: '0.1.36', percent: 0 }]);
  assert.deepEqual(calls, ['check']);

  controls.download();
  assert.deepEqual(calls, ['check', 'download']);
  assert.deepEqual(shown.at(-1), { phase: 'downloading', version: '0.1.36', percent: 0 });

  handlers['download-progress']({ percent: 42.2 });
  assert.deepEqual(shown.at(-1), { phase: 'downloading', version: '0.1.36', percent: 42 });

  handlers['update-available']({ version: '9.9.9' });
  assert.equal(shown.at(-1).phase, 'downloading');
  assert.equal(shown.at(-1).version, '0.1.36');

  handlers['update-downloaded']({ version: '0.1.36' });
  handlers['update-downloaded']({ version: '0.1.36' });
  assert.equal(shown.at(-1).phase, 'downloaded');
  assert.deepEqual(calls, ['check', 'download']);

  controls.install();
  controls.install();
  assert.deepEqual(calls, ['check', 'download', 'install']);
  assert.deepEqual(lines, [
    'Update available: 0.1.36.',
    'Downloading update: 0.1.36.',
    'Update downloaded: 0.1.36. Waiting for restart.',
    'Restarting to apply update: 0.1.36.',
  ]);
});

test('a check failure stays a log line and does not download', () => {
  const lines = [];
  const shown = [];
  const calls = [];
  const { fake, handlers } = fakeUpdater(calls);
  const { controls } = start(fake, lines, shown);

  controls.download();
  controls.install();
  assert.deepEqual(calls, ['check']);

  handlers['update-available']({ version: '0.1.36' });
  handlers.error(new Error('https://updates.example/latest-mac.yml?access_token=secret'));
  assert.equal(lines.at(-1), 'Update check failed: https://updates.example/latest-mac.yml');
  assert.equal(shown.at(-1).phase, 'available');
  assert.deepEqual(calls, ['check']);

  handlers['update-available']({ version: 'latest.yml?access_token=secret' });
  assert.equal(shown.at(-1).version, '0.1.36');
  assert.equal(lines.at(-1), 'Update available.');
});

test('a failed download is shown and does not restart the app', () => {
  const lines = [];
  const shown = [];
  const calls = [];
  const { fake, handlers } = fakeUpdater(calls);
  const { controls } = start(fake, lines, shown);

  handlers['update-available']({ version: '0.1.36' });
  controls.download();
  handlers.error(new Error('https://updates.example/latest.yml?access_token=secret'));
  fake.logger.error('https://updates.example/latest.yml?access_token=secret');
  assert.equal(lines.at(-1), 'Update download failed: https://updates.example/latest.yml');
  assert.equal(lines.filter((line) => line.startsWith('Update check failed')).length, 0);
  assert.equal(shown.at(-1).phase, 'failed');

  controls.install();
  assert.equal(calls.includes('install'), false);

  controls.download();
  assert.equal(calls.filter((call) => call === 'download').length, 2);
  assert.equal(shown.at(-1).phase, 'downloading');
});
