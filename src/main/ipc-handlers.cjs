const { ipcMain, dialog, app, BrowserWindow, shell } = require('electron');
const { PORT } = require('./constants.cjs');

function registerHandlers() {
  // ── File dialogs ──
  ipcMain.handle('dialog:openFile', async (event, options) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [
        {
          name: '文档文件',
          extensions: ['txt', 'md', 'docx', 'json', 'py', 'js', 'ts', 'html', 'css', 'yaml', 'yml', 'xml', 'csv'],
        },
        { name: '所有文件', extensions: ['*'] },
      ],
      ...options,
    });
    return result;
  });

  ipcMain.handle('dialog:saveFile', async (event, options) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showSaveDialog(win, options);
    return result;
  });

  // ── App info ──
  ipcMain.handle('app:getVersion', () => app.getVersion());
  ipcMain.handle('app:getPath', (_event, name) => app.getPath(name));
  ipcMain.handle('app:isPackaged', () => app.isPackaged);

  // ── Window controls ──
  ipcMain.on('window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });

  ipcMain.on('window:maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  });

  ipcMain.on('window:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });

  ipcMain.handle('window:isMaximized', (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false;
  });

  // ── Backend status (Express server runs in-process, always available) ──
  ipcMain.handle('backend:getStatus', () => {
    return { running: true, port: PORT };
  });

  // ── Open external URLs in system browser ──
  ipcMain.on('shell:openExternal', (_event, url) => {
    shell.openExternal(url);
  });
}

module.exports = { registerHandlers };
