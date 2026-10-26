#!/usr/bin/env node
/**
 * Mac pack script (Speak Fiction / StoryBind pattern).
 * Signs when CSC_NAME, CSC_LINK, or CSC_IDENTITY is set; notarizes when Apple API creds are set.
 */
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { formatPackLabel, writeAppVersion } = require('./write-app-version.cjs');

const root = path.join(__dirname, '..');

if (process.platform !== 'darwin') {
  console.error('pack:mac must run on macOS. electron-builder cannot produce a DMG on Linux or Windows.');
  console.error('On a Mac: git pull && npm ci && npm run make:icns && npm run pack:mac');
  console.error('Or trigger the "Pack Mac DMG" GitHub Action on main (artifact in Actions).');
  process.exit(1);
}

const extra = process.argv.slice(2);
const intelOnly = extra.includes('--intel') || extra.includes('--x64');
const allArches = extra.includes('--all');
const env = { ...process.env };

const canSign = Boolean(env.CSC_NAME || env.CSC_LINK || env.CSC_IDENTITY);
const canNotarize = Boolean(
  (env.APPLE_API_KEY && env.APPLE_API_KEY_ID && env.APPLE_API_ISSUER) ||
    (env.APPLE_ID && (env.APPLE_APP_SPECIFIC_PASSWORD || env.APPLE_PASSWORD) && env.APPLE_TEAM_ID),
);

if (!canSign) {
  env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
  console.log('No CSC_* signing identity in env — building an unsigned DMG (local test).');
} else {
  console.log('Signing with Developer ID from CSC_* / keychain.');
}

function run(command, args, extraEnv = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: { ...env, ...extraEnv },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const appVersion = writeAppVersion();
const bakedLabel = formatPackLabel(appVersion);
console.log(`Baking app version ${bakedLabel} into the DMG.`);

const wantPublish = env.HM_PUBLISH === 'always';
if (wantPublish && (!canSign || !canNotarize)) {
  console.error('Refusing to publish without Apple signing and notarization.');
  process.exit(1);
}
const publish = wantPublish ? 'always' : 'never';
if (publish === 'always') {
  console.log('Publishing the signed build to a GitHub Release for auto-update.');
}

run('npm', ['run', 'build:electron']);

const arches = allArches ? ['arm64', 'x64'] : intelOnly ? ['x64'] : ['arm64'];
const builder = path.join(root, 'node_modules', '.bin', 'electron-builder');

for (const arch of arches) {
  const archEnv = { HM_MAC_ARCH: arch };
  const builderArgs = [
    '--mac',
    `--${arch}`,
    '--config',
    path.join(root, 'electron-builder.config.cjs'),
    '--publish',
    publish,
    ...extra.filter((a) => a !== '--intel' && a !== '--x64' && a !== '--all'),
  ];
  builderArgs.push(canNotarize ? '--config.mac.notarize=true' : '--config.mac.notarize=false');
  console.log(`DMG filename: HuManuScript-${appVersion.version}-${arch}.dmg`);
  run(builder, builderArgs, archEnv);
}

console.log('Done. Installers are in release/');
