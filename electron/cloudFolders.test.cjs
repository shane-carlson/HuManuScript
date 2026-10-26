const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  chooseCloudRoot,
  discoverCloudRoots,
  isCloudBackupFilename,
  listBackupFiles,
  readBackupFile,
  writeBackupFile,
} = require('./cloudFolders.cjs');

test('cloud folders are recognized by the desktop client name', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hm-cloud-'));
  const cloud = path.join(home, 'Library', 'CloudStorage');
  fs.mkdirSync(path.join(cloud, 'GoogleDrive-ada@example.com', 'My Drive'), { recursive: true });
  fs.mkdirSync(path.join(cloud, 'OneDrive-Personal'), { recursive: true });
  fs.mkdirSync(path.join(cloud, 'Box-Box'), { recursive: true });
  fs.mkdirSync(path.join(home, 'Dropbox'), { recursive: true });
  fs.mkdirSync(path.join(home, 'Library', 'Mobile Documents', 'com~apple~CloudDocs'), { recursive: true });
  fs.mkdirSync(path.join(home, 'MEGAsync'), { recursive: true });
  fs.mkdirSync(path.join(home, 'pCloud Drive'), { recursive: true });

  const found = discoverCloudRoots({ home, platform: 'darwin', fs });
  assert.equal(found['google-drive'][0], path.join(cloud, 'GoogleDrive-ada@example.com', 'My Drive'));
  assert.equal(found.onedrive[0], path.join(cloud, 'OneDrive-Personal'));
  assert.equal(found.box[0], path.join(cloud, 'Box-Box'));
  assert.equal(found.dropbox[0], path.join(home, 'Dropbox'));
  assert.equal(found.icloud[0], path.join(home, 'Library', 'Mobile Documents', 'com~apple~CloudDocs'));
  assert.equal(found.mega[0], path.join(home, 'MEGAsync'));
  assert.equal(found.pcloud[0], path.join(home, 'pCloud Drive'));
  assert.equal(chooseCloudRoot(found['google-drive'], '', false), found['google-drive'][0]);
  assert.equal(chooseCloudRoot(found.box, path.join(home, 'chosen-box'), true), path.join(home, 'chosen-box'));
});

test('a backup file stays inside the HuManuScript folder', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hm-backup-'));
  const name = 'humanuscript-library-2026-10-25-12-00-00.json';
  assert.equal(isCloudBackupFilename(name), true);
  assert.equal(isCloudBackupFilename('../secret.json'), false);
  const written = writeBackupFile({ fs, root, filename: name, contents: '{"product":"HuManuScript"}' });
  assert.equal(written, path.join(root, 'HuManuScript', name));
  assert.equal(readBackupFile({ fs, root, filename: name }), '{"product":"HuManuScript"}');
  assert.deepEqual(listBackupFiles({ fs, root }).map((file) => file.name), [name]);
  assert.throws(() => writeBackupFile({ fs, root, filename: '../escape.json', contents: 'no' }));
});
