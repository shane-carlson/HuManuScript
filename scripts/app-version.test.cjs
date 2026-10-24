const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { formatPackLabel, resolveAppVersion, writeAppVersion } = require('./write-app-version.cjs');

const root = path.join(__dirname, '..');

test('a numeric pack build becomes marketing version 0.1.<build>', () => {
  assert.deepEqual(resolveAppVersion({ HM_BUILD_NUMBER: '42' }, '0.1.0'), {
    version: '0.1.42',
    build: '42',
  });
  assert.deepEqual(resolveAppVersion({ HM_BUILD_NUMBER: ' 7 ' }, '0.1.0'), {
    version: '0.1.7',
    build: '7',
  });
  assert.equal(formatPackLabel({ version: '0.1.42', build: '42' }), '0.1.42');
  assert.deepEqual(resolveAppVersion({}, '0.1.0'), { version: '0.1.0', build: 'dev' });
  assert.deepEqual(resolveAppVersion({ HM_BUILD_NUMBER: '' }, '0.1.0'), { version: '0.1.0', build: 'dev' });
  assert.deepEqual(resolveAppVersion({ HM_BUILD_NUMBER: 'dev' }, '0.1.0'), { version: '0.1.0', build: 'dev' });
  assert.deepEqual(resolveAppVersion({ HM_BUILD_NUMBER: '1.2' }, '0.1.0'), { version: '0.1.0', build: 'dev' });
  assert.equal(formatPackLabel({ version: '0.1.0', build: 'dev' }), '0.1.0 (dev)');
});

test('electron-builder uses the computed marketing version for the DMG and the bundle', () => {
  const result = spawnSync(
    process.execPath,
    [
      '-e',
      `const config = require('./electron-builder.config.cjs');
       const { readAppVersion } = require('./scripts/write-app-version.cjs');
       const info = readAppVersion();
       const pkg = require('./package.json');
       if (pkg.version !== '0.1.0') {
         console.error('package.json version changed', pkg.version);
         process.exit(2);
       }
       console.log(JSON.stringify({
         version: info.version,
         build: info.build,
         label: info.label,
         extraMetadata: config.extraMetadata.version,
         bundleShortVersion: config.mac.bundleShortVersion,
         bundleVersion: config.mac.bundleVersion,
         buildVersion: config.buildVersion,
         artifactName: config.mac.artifactName,
         dmgArtifactName: config.dmg.artifactName,
         dmgTitle: config.dmg.title,
         targets: config.mac.target.map((target) => target.target),
         publish: config.publish,
       }));`,
    ],
    { cwd: root, env: { ...process.env, HM_BUILD_NUMBER: '42' }, encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const printed = JSON.parse(result.stdout);
  assert.deepEqual(printed, {
    version: '0.1.42',
    build: '42',
    label: '0.1.42',
    extraMetadata: '0.1.42',
    bundleShortVersion: '0.1.42',
    bundleVersion: '0.1.42',
    buildVersion: '0.1.42',
    artifactName: 'HuManuScript-0.1.42-${arch}.${ext}',
    dmgArtifactName: 'HuManuScript-0.1.42-${arch}.${ext}',
    dmgTitle: 'HuManuScript 0.1.42',
    targets: ['dmg', 'zip'],
    publish: {
      provider: 'github',
      owner: 'shane-carlson',
      repo: 'HuManuScript',
      releaseType: 'release',
    },
  });

  const local = spawnSync(
    process.execPath,
    [
      '-e',
      `delete process.env.HM_BUILD_NUMBER;
       const config = require('./electron-builder.config.cjs');
       const { readAppVersion } = require('./scripts/write-app-version.cjs');
       const info = readAppVersion();
       if (info.version !== '0.1.0' || info.build !== 'dev' || info.label !== '0.1.0 (dev)') process.exit(2);
       if (config.buildVersion != null) process.exit(3);
       if (config.mac.bundleVersion != null) process.exit(4);
       if (config.mac.bundleShortVersion !== '0.1.0') process.exit(5);
       if (config.extraMetadata.version !== '0.1.0') process.exit(6);
       if (config.mac.artifactName !== 'HuManuScript-0.1.0-\${arch}.\${ext}') process.exit(7);
       if (config.dmg.title !== 'HuManuScript 0.1.0') process.exit(8);
       const pkg = require('./package.json');
       if (pkg.version !== '0.1.0') process.exit(9);`,
    ],
    { cwd: root, env: { ...process.env, HM_BUILD_NUMBER: '' }, encoding: 'utf8' },
  );
  assert.equal(local.status, 0, local.stderr || local.stdout);
  writeAppVersion({ ...process.env, HM_BUILD_NUMBER: '' });
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.version, '0.1.0');
});
