const { contextBridge, ipcRenderer, webFrame } = require('electron');

contextBridge.exposeInMainWorld('humanuscript', {
  getDeviceName: () => ipcRenderer.invoke('humanuscript:device-name'),
  cloudBackup: {
    save: (provider, filename, contents) => ipcRenderer.invoke('humanuscript:cloud-save', provider, filename, contents),
    list: (provider) => ipcRenderer.invoke('humanuscript:cloud-list', provider),
    read: (provider, filename) => ipcRenderer.invoke('humanuscript:cloud-read', provider, filename),
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
