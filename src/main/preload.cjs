const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // File dialogs
  openFileDialog: (options) => ipcRenderer.invoke('dialog:openFile', options),
  saveFileDialog: (options) => ipcRenderer.invoke('dialog:saveFile', options),

  // App info
  getAppVersion: () => ipcRenderer.invoke('app:getVersion'),
  getAppPath: (name) => ipcRenderer.invoke('app:getPath', name),
  isPackaged: () => ipcRenderer.invoke('app:isPackaged'),

  // Window controls
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),

  // Backend status
  onBackendStatus: (callback) => {
    const handler = (_event, status) => callback(status);
    ipcRenderer.on('backend:status', handler);
    // Return unsubscribe function
    return () => ipcRenderer.removeListener('backend:status', handler);
  },
  getBackendStatus: () => ipcRenderer.invoke('backend:getStatus'),

  // Menu actions from main process
  onMenuAction: (callback) => {
    const handler = (_event, action) => callback(action);
    ipcRenderer.on('menu:action', handler);
    return () => ipcRenderer.removeListener('menu:action', handler);
  },
});
