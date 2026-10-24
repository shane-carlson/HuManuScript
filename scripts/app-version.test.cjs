const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');
const { resolveAppVersion, writeAppVersion } = require('./write-app-version.cjs');

const root = path.join(__dirname, '..');

test('a numeric pack build is kept and anything else is dev', () => {
  assert.deepEqual(resolveAppVersion({ HM_BUILD_NUMBER: '42' }, '0.1.0'), {
    version: '0.1.0',
    build: '42',
  });
  assert.deepEqual(resolveAppVersion({ HM_BUILD_NUMBER: ' 7 ' }, '0.1.0'), {
    version: '0.1.0',
    build: '7',
  });
  assert.equal(resolveAppVersion({}, '0.1.0').build, 'dev');
  assert.equal(resolveAppVersion({ HM_BUILD_NUMBER: '' }, '0.1.0').build, 'dev');
  assert.equal(resolveAppVersion({ HM_BUILD_NUMBER: 'dev' }, '0.1.0').build, 'dev');
  assert.equal(resolveAppVersion({ HM_BUILD_NUMBER: '1.2' }, '0.1.0').build, 'dev');
});

test('electron-builder bundle versions come from the written app version', () => {
  const result = spawnSync(
    process.execPath,
    [
      '-e',
      `const config = require('./electron-builder.config.cjs');
       const { readAppVersion } = require('./scripts/write-app-version.cjs');
       const info = readAppVersion();
       if (info.version !== '0.1.0' || info.build !== '42') {
         console.error('unexpected file', info);
         process.exit(2);
       }
       if (config.mac.bundleShortVersion !== info.version) process.exit(3);
       if (config.buildVersion !== info.build) process.exit(4);
       if (config.mac.bundleVersion !== info.build) process.exit(5);
       console.log(JSON.stringify({
         version: info.version,
         build: info.build,
         bundleShortVersion: config.mac.bundleShortVersion,
         bundleVersion: config.mac.bundleVersion,
       }));`,
    ],
    { cwd: root, env: { ...process.env, HM_BUILD_NUMBER: '42' }, encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const printed = JSON.parse(result.stdout);
  assert.deepEqual(printed, {
    version: '0.1.0',
    build: '42',
    bundleShortVersion: '0.1.0',
    bundleVersion: '42',
  });

  const local = spawnSync(
    process.execPath,
    [
      '-e',
      `delete process.env.HM_BUILD_NUMBER;
       const config = require('./electron-builder.config.cjs');
       const { readAppVersion } = require('./scripts/write-app-version.cjs');
       const info = readAppVersion();
       if (info.build !== 'dev') process.exit(2);
       if (config.buildVersion != null) process.exit(3);
       if (config.mac.bundleVersion != null) process.exit(4);
       if (config.mac.bundleShortVersion !== info.version) process.exit(5);`,
    ],
    { cwd: root, env: { ...process.env, HM_BUILD_NUMBER: '' }, encoding: 'utf8' },
  );
  assert.equal(local.status, 0, local.stderr || local.stdout);
  writeAppVersion({ ...process.env, HM_BUILD_NUMBER: '' });
});
