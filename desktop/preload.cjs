// The only things the setup screen can ask of the app.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('amara', {
  ready: () => ipcRenderer.invoke('setup:ready'),
  download: () => ipcRenderer.invoke('setup:download'),
  locale: () => ipcRenderer.invoke('setup:locale'),
  quit: () => ipcRenderer.invoke('setup:quit'),
  onSetup: callback => ipcRenderer.on('setup', (_event, payload) => callback(payload)),
});
