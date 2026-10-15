const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('humanuscript', {
  getDeviceName: () => ipcRenderer.invoke('humanuscript:device-name'),
});
