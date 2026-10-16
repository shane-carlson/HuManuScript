const { contextBridge, ipcRenderer, webFrame } = require('electron');

contextBridge.exposeInMainWorld('humanuscript', {
  getDeviceName: () => ipcRenderer.invoke('humanuscript:device-name'),
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
