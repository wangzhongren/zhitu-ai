const path = require('path');
const fs = require('fs');
const {
  PRELOAD_PATH, FRONTEND_DIST, DEFAULT_WIDTH, DEFAULT_HEIGHT,
  MIN_WIDTH, MIN_HEIGHT, isDev, VITE_DEV_PORT, APP_NAME,
} = require('./constants.cjs');

function getStateFilePath() {
  const { app } = require('electron');
  return path.join(app.getPath('userData'), 'window-state.json');
}

function loadWindowState() {
  const stateFile = getStateFilePath();
  try {
    if (fs.existsSync(stateFile)) {
      const data = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
      return {
        width: data.width || DEFAULT_WIDTH,
        height: data.height || DEFAULT_HEIGHT,
        x: data.x,
        y: data.y,
        isMaximized: data.isMaximized || false,
      };
    }
  } catch {
    // Corrupted state file — ignore and use defaults
  }
  return {
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    x: undefined,
    y: undefined,
    isMaximized: false,
  };
}

function saveWindowState(win) {
  if (!win || win.isDestroyed()) return;
  try {
    const stateFile = getStateFilePath();
    const bounds = win.getBounds();
    const state = {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      isMaximized: win.isMaximized(),
    };
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
  } catch {
    // Ignore — window state persistence is best-effort
  }
}

function createMainWindow() {
  const { BrowserWindow, shell } = require('electron');
  const state = loadWindowState();
  const isMac = process.platform === 'darwin';

  const win = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    title: APP_NAME,
    show: false,
    backgroundColor: '#1e1e2e',
    frame: isMac,                    // macOS: needs frame for traffic lights; Win/Linux: frameless
    titleBarStyle: isMac ? 'hidden' : undefined,  // macOS: hide title bar text, keep traffic lights
    webPreferences: {
      preload: PRELOAD_PATH,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  if (state.isMaximized) {
    win.maximize();
  }

  // Load content
  const indexPath = path.join(FRONTEND_DIST, 'index.html');
  if (fs.existsSync(indexPath)) {
    win.loadFile(indexPath);
  } else if (isDev) {
    win.loadURL(`http://localhost:${VITE_DEV_PORT}`);
  }

  // Show window when content is ready (prevents white flash)
  win.once('ready-to-show', () => {
    win.show();
  });

  // Save state on move/resize
  win.on('resize', () => saveWindowState(win));
  win.on('move', () => saveWindowState(win));
  win.on('close', () => saveWindowState(win));

  // Open external links in system browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // DevTools in dev mode
  if (isDev) {
    win.webContents.openDevTools({ mode: 'detach' });
  }

  return win;
}

module.exports = { createMainWindow, saveWindowState };
