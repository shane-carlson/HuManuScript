const { contextBridge, ipcRenderer, webFrame } = require('electron');

function readAvailableUpdate(payload) {
  const version = payload && typeof payload.version === 'string' ? payload.version.trim() : '';
  return { version: /^[0-9]+(?:\.[0-9A-Za-z]+){1,3}$/.test(version) ? version : '' };
}

let availableUpdate = null;
ipcRenderer.on('humanuscript:update-available', (_event, payload) => {
  availableUpdate = readAvailableUpdate(payload);
});

contextBridge.exposeInMainWorld('humanuscript', {
  getDeviceName: () => ipcRenderer.invoke('humanuscript:device-name'),
  getUpdateAvailable: () => availableUpdate,
  onUpdateAvailable: (listener) => {
    if (typeof listener !== 'function') return () => {};
    const wrapped = (_event, payload) => listener(readAvailableUpdate(payload));
    ipcRenderer.on('humanuscript:update-available', wrapped);
    return () => ipcRenderer.removeListener('humanuscript:update-available', wrapped);
  },
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
