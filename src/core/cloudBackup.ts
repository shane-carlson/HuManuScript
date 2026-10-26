/**
 * Save and read a library backup in a cloud drive.
 * Electron writes the synced folder directly. A browser asks once for that folder.
 */

import type { CloudBackupEntry } from './deviceName.ts';
import {
  CLOUD_BACKUP_DIR,
  cloudProviderLabel,
  isCloudBackupFilename,
  isCloudProviderId,
  type CloudProviderId,
} from './cloudProviders.ts';

type Permission = 'granted' | 'denied' | 'prompt';

type FileHandle = {
  kind?: string;
  name: string;
  getFile: () => Promise<{ text: () => Promise<string>; lastModified: number }>;
  createWritable: () => Promise<{ write: (data: string) => Promise<void>; close: () => Promise<void> }>;
};

type DirectoryHandle = {
  kind?: string;
  name?: string;
  queryPermission?: (options: { mode: 'readwrite' }) => Promise<Permission>;
  requestPermission?: (options: { mode: 'readwrite' }) => Promise<Permission>;
  getDirectoryHandle: (name: string, options?: { create?: boolean }) => Promise<DirectoryHandle>;
  getFileHandle: (name: string, options?: { create?: boolean }) => Promise<FileHandle>;
  entries?: () => AsyncIterable<[string, { kind: string; name: string }]>;
  values?: () => AsyncIterable<{ kind: string; name: string }>;
};

const sessionFolders = new Map<CloudProviderId, DirectoryHandle>();

function bridge() {
  const cloud = (globalThis as { window?: Window }).window?.humanuscript?.cloudBackup;
  return cloud ?? null;
}

function picker(): ((options: { id?: string; mode?: 'readwrite' }) => Promise<DirectoryHandle>) | null {
  const win = (globalThis as { window?: { showDirectoryPicker?: (options: { id?: string; mode?: 'readwrite' }) => Promise<DirectoryHandle> } }).window;
  return typeof win?.showDirectoryPicker === 'function' ? win.showDirectoryPicker.bind(win) : null;
}

async function allow(handle: DirectoryHandle): Promise<boolean> {
  const mode = { mode: 'readwrite' as const };
  const current = handle.queryPermission ? await handle.queryPermission(mode) : 'granted';
  if (current === 'granted') return true;
  const next = handle.requestPermission ? await handle.requestPermission(mode) : 'granted';
  return next === 'granted';
}

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('humanuscript-cloud', 1);
    open.onupgradeneeded = () => {
      open.result.createObjectStore('folders');
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error ?? new Error('Could not open cloud folder storage.'));
  });
}

async function storedHandle(provider: CloudProviderId): Promise<DirectoryHandle | null> {
  try {
    const db = await database();
    return await new Promise((resolve) => {
      const request = db.transaction('folders').objectStore('folders').get(provider);
      request.onsuccess = () => resolve((request.result as DirectoryHandle | undefined) ?? null);
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function rememberHandle(provider: CloudProviderId, handle: DirectoryHandle): Promise<void> {
  try {
    const db = await database();
    await new Promise<void>((resolve) => {
      const request = db.transaction('folders', 'readwrite').objectStore('folders').put(handle, provider);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    });
  } catch {
    /* The folder still works for this session. */
  }
}

async function folderFor(provider: CloudProviderId): Promise<DirectoryHandle> {
  const remembered = sessionFolders.get(provider) ?? (await storedHandle(provider));
  if (remembered && (await allow(remembered))) {
    sessionFolders.set(provider, remembered);
    return remembered;
  }
  const choose = picker();
  if (!choose) {
    throw new Error(
      `${cloudProviderLabel(provider)} needs the HuManuScript app, or a browser that can choose a folder.`,
    );
  }
  let picked: DirectoryHandle;
  try {
    picked = await choose({ id: `humanuscript-${provider}`, mode: 'readwrite' });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`${cloudProviderLabel(provider)} folder was not chosen.`);
    }
    throw error;
  }
  if (!(await allow(picked))) throw new Error(`${cloudProviderLabel(provider)} folder was not allowed.`);
  sessionFolders.set(provider, picked);
  await rememberHandle(provider, picked);
  return picked;
}

async function backupDirectory(provider: CloudProviderId): Promise<DirectoryHandle> {
  const root = await folderFor(provider);
  return root.getDirectoryHandle(CLOUD_BACKUP_DIR, { create: true });
}

async function fileNames(dir: DirectoryHandle): Promise<string[]> {
  const names: string[] = [];
  if (dir.entries) {
    for await (const [name, handle] of dir.entries()) {
      if (handle.kind === 'file' && isCloudBackupFilename(name)) names.push(name);
    }
    return names;
  }
  if (dir.values) {
    for await (const handle of dir.values()) {
      if (handle.kind === 'file' && isCloudBackupFilename(handle.name)) names.push(handle.name);
    }
  }
  return names;
}

function requireProvider(provider: string): CloudProviderId {
  if (!isCloudProviderId(provider)) throw new Error('Unknown cloud drive.');
  return provider;
}

export async function saveCloudBackup(provider: string, filename: string, contents: string): Promise<void> {
  const id = requireProvider(provider);
  if (!isCloudBackupFilename(filename)) throw new Error('Unexpected backup name.');
  const desktop = bridge();
  if (desktop) {
    await desktop.save(id, filename, contents);
    return;
  }
  const dir = await backupDirectory(id);
  const handle = await dir.getFileHandle(filename, { create: true });
  const writable = await handle.createWritable();
  await writable.write(contents);
  await writable.close();
}

export async function listCloudBackups(provider: string): Promise<CloudBackupEntry[]> {
  const id = requireProvider(provider);
  const desktop = bridge();
  if (desktop) {
    const listed = await desktop.list(id);
    return listed.filter((entry) => isCloudBackupFilename(entry.name));
  }
  const dir = await backupDirectory(id);
  const names = await fileNames(dir);
  const entries: CloudBackupEntry[] = [];
  for (const name of names) {
    const handle = await dir.getFileHandle(name);
    const file = await handle.getFile();
    entries.push({ name, modified: new Date(file.lastModified).toISOString() });
  }
  return entries.sort((a, b) => (a.modified < b.modified ? 1 : -1));
}

export async function readCloudBackup(provider: string, filename: string): Promise<string> {
  const id = requireProvider(provider);
  if (!isCloudBackupFilename(filename)) throw new Error('Unexpected backup name.');
  const desktop = bridge();
  if (desktop) return desktop.read(id, filename);
  const dir = await backupDirectory(id);
  const handle = await dir.getFileHandle(filename);
  return (await handle.getFile()).text();
}
