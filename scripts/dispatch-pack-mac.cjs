#!/usr/bin/env node
/**
 * Dispatch the Pack Mac DMG GitHub Action.
 * electron-builder cannot produce a DMG on Linux, so this starts the macOS
 * workflow_dispatch run for the current branch (or an explicit ref).
 *
 * Usage: npm run dispatch:pack-mac
 *        npm run dispatch:pack-mac -- some-branch
 */
const { spawnSync } = require('node:child_process');

function git(args) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || 'git failed').trim();
    console.error(detail);
    process.exit(result.status ?? 1);
  }
  return result.stdout.trim();
}

const ref = process.argv[2] || git(['rev-parse', '--abbrev-ref', 'HEAD']);
if (!ref || ref === 'HEAD') {
  console.error('Detached HEAD. Pass a branch: npm run dispatch:pack-mac -- <branch>');
  process.exit(1);
}

const remote = git(['config', '--get', 'remote.origin.url']);
const match = remote.match(/github\.com[:/](.+?)(?:\.git)?$/);
if (!match) {
  console.error(`origin is not a GitHub remote: ${remote}`);
  process.exit(1);
}
const repo = match[1];

const remoteHead = spawnSync('git', ['ls-remote', '--heads', 'origin', ref], { encoding: 'utf8' });
if (remoteHead.status !== 0) {
  console.error((remoteHead.stderr || 'git ls-remote failed').trim());
  process.exit(remoteHead.status ?? 1);
}
if (!remoteHead.stdout.trim()) {
  console.error(`origin does not have ${ref}. Push the branch, then run this again.`);
  process.exit(1);
}

console.log(`Dispatching Pack Mac DMG for ${repo} @ ${ref}`);
const result = spawnSync(
  'gh',
  ['workflow', 'run', 'pack-mac.yml', '--repo', repo, '--ref', ref],
  { stdio: 'inherit' },
);
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
if (result.status !== 0) process.exit(result.status ?? 1);

console.log(`Dispatched. https://github.com/${repo}/actions/workflows/pack-mac.yml`);
