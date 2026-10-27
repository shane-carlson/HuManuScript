const { contextBridge, ipcRenderer, webFrame } = require('electron');

const UPDATE_PHASES = new Set([
  'available',
  'downloading',
  'downloaded',
  'failed',
  'checking',
  'current',
  'check-failed',
]);
const QUIET_PHASES = new Set(['checking', 'current', 'check-failed']);

/** Sandbox cannot load autoUpdate.cjs, so the same notice check lives here. */
function readAvailableUpdate(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const version = typeof payload.version === 'string' ? payload.version.trim() : '';
  const safeVersion = /^[0-9]+(?:\.[0-9A-Za-z]+){1,3}$/.test(version) ? version : '';
  let phase = payload.phase;
  if (phase == null) phase = 'available';
  if (!UPDATE_PHASES.has(phase)) return null;
  if (QUIET_PHASES.has(phase)) return { phase, version: '', percent: 0 };
  let percent = 0;
  if (phase === 'downloading') {
    const value = Number(payload.percent);
    percent = Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0;
  }
  return { phase, version: safeVersion, percent };
}

let availableUpdate = null;
ipcRenderer.on('humanuscript:update-available', (_event, payload) => {
  const next = readAvailableUpdate(payload);
  if (next) availableUpdate = next;
});

contextBridge.exposeInMainWorld('humanuscript', {
  getDeviceName: () => ipcRenderer.invoke('humanuscript:device-name'),
  getUpdateAvailable: () => availableUpdate,
  onUpdateAvailable: (listener) => {
    if (typeof listener !== 'function') return () => {};
    const wrapped = (_event, payload) => {
      const next = readAvailableUpdate(payload);
      if (next) listener(next);
    };
    ipcRenderer.on('humanuscript:update-available', wrapped);
    return () => ipcRenderer.removeListener('humanuscript:update-available', wrapped);
  },
  downloadUpdate: () => ipcRenderer.invoke('humanuscript:update-download'),
  installUpdate: () => ipcRenderer.invoke('humanuscript:update-install'),
  checkForUpdates: () => ipcRenderer.invoke('humanuscript:update-check'),
  cloudBackup: {
    save: (provider, filename, contents) => ipcRenderer.invoke('humanuscript:cloud-save', provider, filename, contents),
    list: (provider) => ipcRenderer.invoke('humanuscript:cloud-list', provider),
    read: (provider, filename) => ipcRenderer.invoke('humanuscript:cloud-read', provider, filename),
  },
  setCaptureGrant: (grant) => ipcRenderer.invoke('humanuscript:capture-grant', grant),
  license: {
    getStatus: () => ipcRenderer.invoke('humanuscript:license-status'),
    activate: (key) => ipcRenderer.invoke('humanuscript:license-activate', key),
    buy: () => ipcRenderer.invoke('humanuscript:license-buy'),
  },
  getSpellSuggestions: (word) => {
    if (typeof word !== 'string' || !word.trim()) return [];
    try {
      const list = webFrame.getWordSuggestions(word);
      return Array.isArray(list) ? list.filter((item) => typeof item === 'string') : [];
    } catch {
      return [];
    }
  },
});
