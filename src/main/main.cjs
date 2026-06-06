const { app, BrowserWindow, dialog } = require('electron');
const { startServer } = require('../server/index.cjs');
const { createMainWindow } = require('./window-manager.cjs');
const { buildMenu } = require('./menu.cjs');
const { registerHandlers } = require('./ipc-handlers.cjs');
const { isDev, PORT } = require('./constants.cjs');

let mainWindow = null;
let server = null;

async function bootstrap() {
  // Register IPC handlers
  registerHandlers();

  // Start Express server (replaces Python backend)
  try {
    server = await startServer(PORT);
  } catch (err) {
    console.error('Failed to start server:', err.message);
    dialog.showErrorBox(
      '启动失败',
      `无法启动后端服务：\n${err.message}`
    );
    app.quit();
    return;
  }

  // Create window
  mainWindow = createMainWindow();

  // Build native menu
  buildMenu(mainWindow);

  // macOS: re-create window on activate
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
      buildMenu(mainWindow);
    }
  });

  // Handle window being closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ── App lifecycle ──
app.whenReady().then(bootstrap);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (server) {
    server.close();
    server = null;
  }
});

// ── Single instance lock ──
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}
