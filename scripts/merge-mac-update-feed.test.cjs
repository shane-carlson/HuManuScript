const assert = require('node:assert/strict');
const test = require('node:test');
const { mergeMacUpdateFeeds, parseMacUpdateFeed, serializeMacUpdateFeed } = require('./merge-mac-update-feed.cjs');

const arm64 = `version: 0.1.43
files:
  - url: HuManuScript-0.1.43-arm64.zip
    sha512: armZipHash==
    size: 10
  - url: HuManuScript-0.1.43-arm64.dmg
    sha512: armDmgHash==
    size: 11
path: HuManuScript-0.1.43-arm64.zip
sha512: armZipHash==
releaseDate: '2026-10-28T18:00:00.000Z'
`;

const intel = `version: 0.1.43
files:
  - url: HuManuScript-0.1.43-x64.zip
    sha512: intelZipHash==
    size: 20
  - url: HuManuScript-0.1.43-x64.dmg
    sha512: intelDmgHash==
    size: 21
path: HuManuScript-0.1.43-x64.zip
sha512: intelZipHash==
releaseDate: '2026-10-28T18:01:00.000Z'
`;

test('the Mac feed keeps the arm64 zip path and lists the Intel zip', () => {
  const merged = mergeMacUpdateFeeds(arm64, intel);
  assert.equal(merged.version, '0.1.43');
  assert.equal(merged.path, 'HuManuScript-0.1.43-arm64.zip');
  assert.equal(merged.sha512, 'armZipHash==');
  assert.deepEqual(
    merged.files.map((file) => file.url),
    [
      'HuManuScript-0.1.43-arm64.zip',
      'HuManuScript-0.1.43-x64.zip',
      'HuManuScript-0.1.43-arm64.dmg',
      'HuManuScript-0.1.43-x64.dmg',
    ],
  );
  const text = serializeMacUpdateFeed(merged);
  const again = parseMacUpdateFeed(text);
  assert.equal(again.files.find((file) => file.url.endsWith('-x64.zip')).size, 20);
  assert.equal(again.files.find((file) => file.url.endsWith('-x64.zip')).sha512, 'intelZipHash==');
  assert.equal(again.path, 'HuManuScript-0.1.43-arm64.zip');
});

test('a feed for another version is not mixed in', () => {
  assert.throws(() => mergeMacUpdateFeeds(arm64, intel.replace('0.1.43', '0.1.44')), /versions differ/);
});
