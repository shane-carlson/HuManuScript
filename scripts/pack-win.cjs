#!/usr/bin/env node
/**
 * Windows NSIS installer (electron-updater reads latest.yml from this target).
 * Signs when WIN_CSC_LINK or CSC_LINK is set with a password. The Apple Developer ID
 * secret stays on the Mac job and is not used here.
 */
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { formatPackLabel, writeAppVersion } = require('./write-app-version.cjs');

const root = path.join(__dirname, '..');

if (process.platform !== 'win32') {
  console.error('pack:win must run on Windows. electron-builder’s NSIS installer is built on the Windows runner.');
  console.error('Push to main, or run the Pack workflow on GitHub Actions. The installer is attached to the release.');
  process.exit(1);
}

const env = { ...process.env };
const link = env.WIN_CSC_LINK || env.CSC_LINK || '';
const password = env.WIN_CSC_KEY_PASSWORD || env.CSC_KEY_PASSWORD || '';
const canSign = Boolean(link && password);

if (!canSign) {
  for (const key of [
    'CSC_LINK',
    'CSC_KEY_PASSWORD',
    'CSC_NAME',
    'CSC_IDENTITY',
    'WIN_CSC_LINK',
    'WIN_CSC_KEY_PASSWORD',
  ]) {
    delete env[key];
  }
  env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
  console.log(
    'No Windows code-signing certificate (WIN_CSC_LINK). Building an unsigned installer. SmartScreen will warn.',
  );
} else if (env.WIN_CSC_LINK) {
  delete env.CSC_LINK;
  delete env.CSC_NAME;
  delete env.CSC_IDENTITY;
  console.log('Signing the Windows installer from WIN_CSC_LINK.');
} else {
  console.log('Signing the Windows installer from CSC_LINK.');
}

function run(command, args, extraEnv = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: { ...env, ...extraEnv },
  });
  if (result.error) {
    console.error(`Could not start ${command}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const appVersion = writeAppVersion();
const bakedLabel = formatPackLabel(appVersion);
console.log(`Baking app version ${bakedLabel} into the Windows installer.`);

const wantPublish = env.HM_PUBLISH === 'always';
const publish = wantPublish ? 'always' : 'never';
if (publish === 'always') {
  console.log(
    canSign
      ? 'Publishing the signed Windows installer to the GitHub Release.'
      : 'Publishing the unsigned Windows installer to the GitHub Release.',
  );
}

// npm on Windows is npm.cmd. spawn cannot run that without a shell, so the
// electron build is the same three steps as the npm script, started with node.
const electronEnv = { ELECTRON: '1' };
run(process.execPath, [path.join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '-b'], electronEnv);
run(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build'], electronEnv);
run(process.execPath, [path.join(root, 'scripts', 'bundle-updater.cjs')]);

const builderArgs = [
  path.join(root, 'node_modules', 'electron-builder', 'cli.js'),
  '--win',
  '--x64',
  '--config',
  path.join(root, 'electron-builder.config.cjs'),
  '--publish',
  publish,
];
console.log(`Installer filename: HuManuScript-${appVersion.version}-x64.exe`);
run(process.execPath, builderArgs);

console.log('Done. The installer is in release/');
