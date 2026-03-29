const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  saveFileDialog: (defaultName) => ipcRenderer.invoke('save-file-dialog', defaultName),
  writeFile: (filePath, content) => ipcRenderer.invoke('write-file', filePath, content),
  getVersion: () => ipcRenderer.invoke('get-version'),
  onCsvLoaded: (callback) => ipcRenderer.on('csv-loaded', (event, content, filename) => callback(content, filename)),
  onShowAbout: (callback) => ipcRenderer.on('show-about', (event, version) => callback(version)),
  openExternal: (url) => ipcRenderer.send('open-external', url)
});
