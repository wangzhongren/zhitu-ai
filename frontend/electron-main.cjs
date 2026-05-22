const { app, BrowserWindow, dialog } = require('electron')
const { spawn } = require('child_process')
const path = require('path')
const http = require('http')

const PORT = 18674
const isDev = !app.isPackaged
const BACKEND_DIR = isDev
  ? path.join(__dirname, '..', 'backend')
  : path.join(process.resourcesPath, 'backend')
const FRONTEND_DIST = isDev
  ? path.join(__dirname, 'dist')
  : path.join(__dirname, 'dist')

let mainWindow = null
let pythonProcess = null

function startBackend() {
  return new Promise((resolve, reject) => {
    pythonProcess = spawn('python3', ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', String(PORT)], {
      cwd: BACKEND_DIR,
      stdio: ['ignore', 'inherit', 'inherit'],
    })

    pythonProcess.on('error', (err) => {
      reject(new Error(`无法启动 Python: ${err.message}`))
    })

    // Just wait for health endpoint
    setTimeout(() => resolve(), 500)
  })
}

function waitForBackend(retries = 60) {
  return new Promise((resolve) => {
    function check(n) {
      if (n <= 0) { resolve(false); return }
      http.get(`http://127.0.0.1:${PORT}/api/health`, (res) => {
        resolve(res.statusCode === 200)
      }).on('error', () => {
        setTimeout(() => check(n - 1), 500)
      })
    }
    check(retries)
  })
}

async function createWindow() {
  // Start Python backend
  try {
    await startBackend()
    const ok = await waitForBackend()
    if (!ok) console.warn('Backend not reachable, UI may show errors')
  } catch (e) {
    console.error(e.message)
  }

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: '知图',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  // Try loading built frontend first, fallback to dev server
  const fs = require('fs')
  const indexPath = path.join(FRONTEND_DIST, 'index.html')
  if (fs.existsSync(indexPath)) {
    mainWindow.loadFile(indexPath)
  } else {
    mainWindow.loadURL('http://localhost:5173')
  }

  // DevTools: uncomment for debugging
  // mainWindow.webContents.openDevTools()

  mainWindow.on('closed', () => { mainWindow = null })
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

app.on('before-quit', () => {
  if (pythonProcess) {
    pythonProcess.kill('SIGTERM')
    pythonProcess = null
  }
})

app.on('quit', () => {
  if (pythonProcess) {
    pythonProcess.kill('SIGKILL')
    pythonProcess = null
  }
})
