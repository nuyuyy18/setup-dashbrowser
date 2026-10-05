const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getProfiles: () => ipcRenderer.invoke('p:all'),
  saveProfile: (data, id) => ipcRenderer.invoke('p:save', data, id),
  deleteProfile: (id) => ipcRenderer.invoke('p:del', id),
  prepareSession: (id) => ipcRenderer.invoke('p:prep', id),
  clearData: (id) => ipcRenderer.invoke('p:clear', id),
  getExtensions: () => ipcRenderer.invoke('e:all'),
  importFolder: () => ipcRenderer.invoke('e:folder'),
  importZip: () => ipcRenderer.invoke('e:zip'),
  deleteExt: (id) => ipcRenderer.invoke('e:del', id)
});
