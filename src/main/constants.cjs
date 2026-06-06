const path = require('path');

/**
 * Detect if running in development mode.
 * Uses multiple fallback checks in case require('electron') is not available at load time.
 */
function detectIsDev() {
  // Method 1: process.defaultApp is set when running from source (reliable in Electron)
  if (process.defaultApp) return true;

  // Method 2: Check if electron module's app is available
  try {
    const { app } = require('electron');
    if (app && typeof app.isPackaged !== 'undefined') {
      return !app.isPackaged;
    }
  } catch {
    // require('electron') may not be available at module load time
  }

  // Method 3: Check exec path for electron
  if (/[\\/]electron[\\/]/.test(process.execPath)) return true;

  // Method 4: resourcesPath check for asar
  if (!process.resourcesPath.includes('.asar')) return true;

  return false;
}

const isDev = detectIsDev();

module.exports = {
  PORT: 18674,
  VITE_DEV_PORT: 5173,
  isDev,

  // Paths
  FRONTEND_DIST: path.join(__dirname, '..', '..', 'dist'),
  PRELOAD_PATH: path.join(__dirname, 'preload.cjs'),
  ELECTRON_DIR: __dirname,
  SERVER_DIR: path.join(__dirname, '..', 'server'),

  // App info
  APP_NAME: '知图',
  APP_DESCRIPTION: 'AI 知识图谱学习助手',

  // Window
  DEFAULT_WIDTH: 1400,
  DEFAULT_HEIGHT: 900,
  MIN_WIDTH: 900,
  MIN_HEIGHT: 600,
};
