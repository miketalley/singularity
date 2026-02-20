import { app, shell, BrowserWindow, Menu } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { initDatabase } from './database'
import { initAnthropicClient } from './anthropic'
import { registerIpcHandlers } from './ipc'
import { initLogger, log, getLogPath } from './logger'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hiddenInset',
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Native right-click context menu
  mainWindow.webContents.on('context-menu', (_event, params) => {
    const menuItems: Electron.MenuItemConstructorOptions[] = []

    if (params.selectionText) {
      menuItems.push(
        { label: 'Copy', role: 'copy', accelerator: 'CmdOrCtrl+C' },
        { type: 'separator' },
        { label: 'Select All', role: 'selectAll', accelerator: 'CmdOrCtrl+A' }
      )
    }

    if (params.isEditable) {
      menuItems.length = 0
      menuItems.push(
        { label: 'Cut', role: 'cut', accelerator: 'CmdOrCtrl+X' },
        { label: 'Copy', role: 'copy', accelerator: 'CmdOrCtrl+C' },
        { label: 'Paste', role: 'paste', accelerator: 'CmdOrCtrl+V' },
        { type: 'separator' },
        { label: 'Select All', role: 'selectAll', accelerator: 'CmdOrCtrl+A' }
      )
    }

    if (menuItems.length > 0) {
      Menu.buildFromTemplate(menuItems).popup()
    }
  })

  // HMR for renderer based on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Initialize logger
  initLogger()
  log('app', `Log file: ${getLogPath()}`)

  // Initialize database
  initDatabase()
  log('app', 'Database initialized')

  // Initialize Anthropic client (used for title generation)
  initAnthropicClient()
  log('app', 'Anthropic client initialized')

  // Register IPC handlers (includes get-api-key-status)
  registerIpcHandlers()
  log('app', 'IPC handlers registered')

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
