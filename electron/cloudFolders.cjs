/**
 * Find the synced folder for a cloud drive and read or write a library backup inside it.
 * No network calls: Google Drive, OneDrive, Box, Dropbox, iCloud, MEGA, and pCloud
 * pick up the file through their desktop apps.
 */

const path = require('node:path');

const CLOUD_PROVIDER_IDS = ['google-drive', 'onedrive', 'box', 'dropbox', 'icloud', 'mega', 'pcloud'];
const BACKUP_DIR = 'HuManuScript';

function isCloudProviderId(id) {
  return CLOUD_PROVIDER_IDS.includes(id);
}

function isCloudBackupFilename(name) {
  return typeof name === 'string' && /^humanuscript-library-[A-Za-z0-9._-]+\.json$/.test(name);
}

function classifyCloudEntry(name) {
  const value = name.toLowerCase();
  if (value.startsWith('googledrive')) return 'google-drive';
  if (value.startsWith('onedrive')) return 'onedrive';
  if (value === 'box' || value.startsWith('box-')) return 'box';
  if (value.startsWith('dropbox')) return 'dropbox';
  if (value.startsWith('mega')) return 'mega';
  if (value.startsWith('pcloud')) return 'pcloud';
  return null;
}

function exists(fs, target) {
  try {
    return fs.existsSync(target);
  } catch {
    return false;
  }
}

function listNames(fs, dir) {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

function pushRoot(found, id, root) {
  if (!found[id]) found[id] = [];
  if (!found[id].includes(root)) found[id].push(root);
}

function googleRoot(fs, dir) {
  const mine = path.join(dir, 'My Drive');
  return exists(fs, mine) ? mine : dir;
}

/**
 * @param {{ home: string, platform: string, env?: Record<string, string | undefined>, fs: { existsSync: Function, readdirSync: Function } }} args
 * @returns {Record<string, string[]>}
 */
function discoverCloudRoots({ home, platform, env = {}, fs }) {
  /** @type {Record<string, string[]>} */
  const found = {};
  const cloud = path.join(home, 'Library', 'CloudStorage');
  for (const name of listNames(fs, cloud)) {
    const id = classifyCloudEntry(name);
    if (!id) continue;
    const dir = path.join(cloud, name);
    pushRoot(found, id, id === 'google-drive' ? googleRoot(fs, dir) : dir);
  }
  const icloud = path.join(home, 'Library', 'Mobile Documents', 'com~apple~CloudDocs');
  if (exists(fs, icloud)) pushRoot(found, 'icloud', icloud);

  const homeFolders = [
    ['Dropbox', 'dropbox'],
    ['Google Drive', 'google-drive'],
    ['OneDrive', 'onedrive'],
    ['Box', 'box'],
    ['MEGA', 'mega'],
    ['MEGAsync', 'mega'],
    ['pCloud Drive', 'pcloud'],
    ['iCloud Drive', 'icloud'],
    ['iCloudDrive', 'icloud'],
  ];
  for (const [folder, id] of homeFolders) {
    const dir = path.join(home, folder);
    if (exists(fs, dir)) pushRoot(found, id, id === 'google-drive' ? googleRoot(fs, dir) : dir);
  }

  if (platform === 'win32') {
    const fromEnv = [
      ['OneDrive', 'onedrive'],
      ['OneDriveConsumer', 'onedrive'],
      ['OneDriveCommercial', 'onedrive'],
    ];
    for (const [key, id] of fromEnv) {
      const dir = env[key];
      if (dir && exists(fs, dir)) pushRoot(found, id, dir);
    }
  }
  return found;
}

function chooseCloudRoot(roots, saved, savedExists) {
  if (saved && savedExists) return saved;
  if (!roots?.length) return null;
  return roots[0];
}

function backupPaths(root, filename) {
  if (!isCloudBackupFilename(filename)) throw new Error('Unexpected backup name.');
  const dir = path.resolve(root, BACKUP_DIR);
  const file = path.resolve(dir, filename);
  const relative = path.relative(dir, file);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Unexpected backup name.');
  }
  return { dir, file };
}

function writeBackupFile({ fs, root, filename, contents }) {
  if (typeof contents !== 'string') throw new Error('Backup could not be written.');
  const { dir, file } = backupPaths(root, filename);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, contents, 'utf8');
  return file;
}

function listBackupFiles({ fs, root }) {
  const dir = path.resolve(root, BACKUP_DIR);
  return listNames(fs, dir)
    .filter(isCloudBackupFilename)
    .map((name) => {
      let modified = '';
      try {
        modified = fs.statSync(path.join(dir, name)).mtime.toISOString();
      } catch {
        modified = '';
      }
      return { name, modified };
    })
    .sort((a, b) => (a.modified < b.modified ? 1 : -1));
}

function readBackupFile({ fs, root, filename }) {
  const { file } = backupPaths(root, filename);
  return fs.readFileSync(file, 'utf8');
}

module.exports = {
  BACKUP_DIR,
  CLOUD_PROVIDER_IDS,
  chooseCloudRoot,
  discoverCloudRoots,
  isCloudBackupFilename,
  isCloudProviderId,
  listBackupFiles,
  readBackupFile,
  writeBackupFile,
};
