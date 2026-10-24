/**
 * Writes the marketing version and build the app and the Mac bundle both read.
 * The signed DMG workflow sets HM_BUILD_NUMBER to the GitHub Actions run number.
 * Local dev and unsigned packs leave it unset and get build "dev".
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const outPath = path.join(root, 'build', 'app-version.json');

function resolveAppVersion(env, version) {
  const raw = String(env.HM_BUILD_NUMBER ?? '').trim();
  const build = /^[0-9]+$/.test(raw) ? raw : 'dev';
  return { version, build };
}

function writeAppVersion(env = process.env) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (typeof pkg.version !== 'string' || pkg.version.length === 0) {
    throw new Error('package.json version is missing');
  }
  const info = resolveAppVersion(env, pkg.version);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(info, null, 2)}\n`);
  return info;
}

function readAppVersion() {
  return JSON.parse(fs.readFileSync(outPath, 'utf8'));
}

module.exports = { outPath, resolveAppVersion, writeAppVersion, readAppVersion };
