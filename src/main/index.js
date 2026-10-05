const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const store = require('../services/store');
const sessionService = require('../services/session');

// Suppress unhandled guest webview navigation rejections
process.on('unhandledRejection', (reason) => {
  if (reason && reason.code === 'ERR_FAILED') return;
});

app.commandLine.appendSwitch('ignore-certificate-errors');
app.commandLine.appendSwitch('allow-insecure-localhost');

let win;
function createWin() {
  win = new BrowserWindow({
    width: 1300,
    height: 800,
    title: 'DashBrowser',
    backgroundColor: '#0b0f19',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true,
      contextIsolation: true
    }
  });

  win.webContents.on('certificate-error', (event, url, error, certificate, callback) => {
    event.preventDefault();
    callback(true);
  });

  // Catch guest webview creation & attach error guards
  app.on('web-contents-created', (_, contents) => {
    if (contents.getType() === 'webview') {
      contents.on('did-fail-load', () => {});
      contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    }
  });

  win.loadFile(path.join(__dirname, '../renderer/index.html'));
  win.once('ready-to-show', () => win.show());
}

app.whenReady().then(createWin);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// IPC Handlers
ipcMain.handle('p:all', () => store.getProfiles());
ipcMain.handle('p:save', (_, data, id) => store.saveProfile(data, id));
ipcMain.handle('p:del', async (_, id) => {
  await sessionService.clear(id);
  store.deleteProfile(id);
  return true;
});
ipcMain.handle('p:prep', (_, id) => sessionService.setup(id));
ipcMain.handle('p:clear', (_, id) => sessionService.clear(id));

ipcMain.handle('e:all', () => store.getExtensions());
ipcMain.handle('e:folder', async () => {
  const res = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
  return res.canceled ? null : store.importExt(res.filePaths[0], false);
});
ipcMain.handle('e:zip', async () => {
  const res = await dialog.showOpenDialog(win, { filters: [{ name: 'Zip', extensions: ['zip', 'crx'] }] });
  return res.canceled ? null : store.importExt(res.filePaths[0], true);
});
ipcMain.handle('e:del', (_, id) => store.deleteExt(id));
