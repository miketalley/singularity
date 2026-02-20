import { app, shell, BrowserWindow, Menu } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { initDatabase } from './database'
import { initAnthropicClient } from './anthropic'
import { registerIpcHandlers } from './ipc'
import { initLogger, log, getLogPath } from './logger'
import { startUsagePolling, stopUsagePolling } from './usage'

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

// Set app name early so macOS menu bar shows "singularity"
app.name = 'singularity'

// Prevent duplicate instances — second launch focuses existing window instead
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const windows = BrowserWindow.getAllWindows()
    if (windows.length > 0) {
      if (windows[0].isMinimized()) windows[0].restore()
      windows[0].focus()
    }
  })

  app.whenReady().then(() => {
    // Set app user model id for windows
    electronApp.setAppUserModelId('com.electron')

    // Set macOS application menu with correct app name
    if (process.platform === 'darwin') {
      const template: Electron.MenuItemConstructorOptions[] = [
        {
          label: app.name,
          submenu: [
            { role: 'about' },
            { type: 'separator' },
            { role: 'services' },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' }
          ]
        },
        { role: 'editMenu' },
        { role: 'viewMenu' },
        { role: 'windowMenu' }
      ]
      Menu.setApplicationMenu(Menu.buildFromTemplate(template))
    }

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

    // Start polling Claude API usage data every 5 minutes
    startUsagePolling()
    log('app', 'Usage polling started')

    createWindow()

    app.on('activate', function () {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    stopUsagePolling()
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
}
