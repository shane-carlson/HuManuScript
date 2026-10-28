#!/usr/bin/env node
/**
 * Join the Apple silicon and Intel latest-mac.yml feeds into one file.
 * electron-updater keeps an arm64 zip on Apple silicon and skips it on Intel.
 */
const fs = require('node:fs');

function unquote(value) {
  const text = value.trim();
  if ((text.startsWith("'") && text.endsWith("'")) || (text.startsWith('"') && text.endsWith('"'))) {
    return text.slice(1, -1);
  }
  return text;
}

function parseMacUpdateFeed(text) {
  const version = unquote((text.match(/^version:\s*(.+)$/m) || [])[1] || '');
  const pathLine = text.match(/^path:\s*(.+)$/m);
  const path = unquote((pathLine || [])[1] || '');
  const afterPath = pathLine ? text.slice(pathLine.index + pathLine[0].length) : '';
  const sha512 = unquote((afterPath.match(/^\s*sha512:\s*(.+)$/m) || [])[1] || '');
  const releaseDate = unquote((text.match(/^releaseDate:\s*(.+)$/m) || [])[1] || '');
  const files = [];
  const filePattern = /- url:\s*(.+)\r?\n\s+sha512:\s*(.+)\r?\n\s+size:\s*(\d+)/g;
  for (const match of text.matchAll(filePattern)) {
    files.push({ url: unquote(match[1]), sha512: unquote(match[2]), size: Number(match[3]) });
  }
  if (!version || !path || !sha512 || files.length === 0) {
    throw new Error('latest-mac.yml is missing version, path, sha512, or files.');
  }
  return { version, files, path, sha512, releaseDate };
}

function zipNamed(feed, arch) {
  return feed.files.find((file) => file.url.endsWith('.zip') && file.url.includes(arch));
}

function mergeMacUpdateFeeds(arm64Text, intelText) {
  const arm64 = parseMacUpdateFeed(arm64Text);
  const intel = parseMacUpdateFeed(intelText);
  if (arm64.version !== intel.version) {
    throw new Error(`Mac feed versions differ: ${arm64.version} and ${intel.version}.`);
  }
  const armZip = zipNamed(arm64, 'arm64');
  const intelZip = zipNamed(intel, 'x64');
  if (!armZip) throw new Error('Apple silicon feed has no arm64 zip.');
  if (!intelZip) throw new Error('Intel feed has no x64 zip.');
  if (intelZip.url.includes('arm64')) throw new Error('Intel zip must not be named arm64.');
  const seen = new Set();
  const files = [];
  for (const file of [...arm64.files, ...intel.files]) {
    if (seen.has(file.url)) continue;
    seen.add(file.url);
    files.push(file);
  }
  files.sort((a, b) => {
    const zipDelta = Number(b.url.endsWith('.zip')) - Number(a.url.endsWith('.zip'));
    if (zipDelta !== 0) return zipDelta;
    return Number(b.url.includes('arm64')) - Number(a.url.includes('arm64'));
  });
  return {
    version: arm64.version,
    files,
    path: armZip.url,
    sha512: armZip.sha512,
    releaseDate: arm64.releaseDate || intel.releaseDate,
  };
}

function quoteScalar(value) {
  if (/^[A-Za-z0-9+/=._-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", "''")}'`;
}

function serializeMacUpdateFeed(feed) {
  const lines = [`version: ${quoteScalar(feed.version)}`, 'files:'];
  for (const file of feed.files) {
    lines.push(`  - url: ${quoteScalar(file.url)}`);
    lines.push(`    sha512: ${quoteScalar(file.sha512)}`);
    lines.push(`    size: ${file.size}`);
  }
  lines.push(`path: ${quoteScalar(feed.path)}`);
  lines.push(`sha512: ${quoteScalar(feed.sha512)}`);
  if (feed.releaseDate) lines.push(`releaseDate: '${feed.releaseDate}'`);
  lines.push('');
  return lines.join('\n');
}

function mergeMacUpdateFeedFiles(arm64Path, intelPath, outPath) {
  const merged = mergeMacUpdateFeeds(fs.readFileSync(arm64Path, 'utf8'), fs.readFileSync(intelPath, 'utf8'));
  const text = serializeMacUpdateFeed(merged);
  if (outPath) fs.writeFileSync(outPath, text);
  return text;
}

module.exports = {
  mergeMacUpdateFeedFiles,
  mergeMacUpdateFeeds,
  parseMacUpdateFeed,
  serializeMacUpdateFeed,
};

if (require.main === module) {
  const [arm64Path, intelPath, outPath] = process.argv.slice(2);
  if (!arm64Path || !intelPath || !outPath) {
    console.error('Usage: node scripts/merge-mac-update-feed.cjs <arm64.yml> <intel.yml> <out.yml>');
    process.exit(1);
  }
  mergeMacUpdateFeedFiles(arm64Path, intelPath, outPath);
}
