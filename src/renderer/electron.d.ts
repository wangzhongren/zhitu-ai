interface FileDialogResult {
  canceled: boolean
  filePaths: string[]
}

interface SaveDialogResult {
  canceled: boolean
  filePath?: string
}

interface BackendStatus {
  running: boolean
  port: number
}

interface ElectronAPI {
  openFileDialog: (options?: { filters?: Array<{ name: string; extensions: string[] }> }) => Promise<FileDialogResult>
  saveFileDialog: (options?: { defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }) => Promise<SaveDialogResult>
  getAppVersion: () => Promise<string>
  getAppPath: (name: string) => Promise<string>
  isPackaged: () => Promise<boolean>
  minimizeWindow: () => void
  maximizeWindow: () => void
  closeWindow: () => void
  isMaximized: () => Promise<boolean>
  onBackendStatus: (callback: (status: BackendStatus) => void) => () => void
  getBackendStatus: () => Promise<BackendStatus>
  onMenuAction: (callback: (action: string) => void) => () => void
}

interface Window {
  electronAPI?: ElectronAPI
}
