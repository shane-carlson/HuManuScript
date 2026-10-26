/**
 * Writes the marketing version and build the app and the Mac bundle both read.
 * A numeric HM_BUILD_NUMBER (the GitHub Actions run number) becomes 0.1.<build>
 * from the package.json base (0.1.0). Local and unsigned packs leave it unset
 * and stay on that base version with build "dev".
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const outPath = path.join(root, 'build', 'app-version.json');

function marketingVersion(baseVersion, build) {
  const match = /^(\d+)\.(\d+)\.\d+$/.exec(baseVersion);
  if (!match) {
    throw new Error(`package.json version must look like 0.1.0 (major.minor.patch), got ${baseVersion}`);
  }
  return `${match[1]}.${match[2]}.${build}`;
}

function resolveAppVersion(env, version) {
  const raw = String(env.HM_BUILD_NUMBER ?? '').trim();
  if (!/^[0-9]+$/.test(raw)) return { version, build: 'dev' };
  return { version: marketingVersion(version, raw), build: raw };
}

function formatPackLabel(info) {
  if (info.build === 'dev') return `${info.version} (${info.build})`;
  return info.version;
}

function writeAppVersion(env = process.env) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (typeof pkg.version !== 'string' || pkg.version.length === 0) {
    throw new Error('package.json version is missing');
  }
  const resolved = resolveAppVersion(env, pkg.version);
  const info = { ...resolved, label: formatPackLabel(resolved) };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(info, null, 2)}\n`);
  return info;
}

function readAppVersion() {
  return JSON.parse(fs.readFileSync(outPath, 'utf8'));
}

module.exports = { outPath, resolveAppVersion, formatPackLabel, writeAppVersion, readAppVersion };
