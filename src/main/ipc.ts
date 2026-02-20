import { ipcMain, dialog, BrowserWindow } from 'electron'
import { basename } from 'path'
import {
  getAllWorkspaces,
  createWorkspace,
  deleteWorkspace,
  getConversationsByWorkspace,
  getDeletedConversationsByWorkspace,
  createConversation,
  getConversation,
  getDatabase,
  updateConversationTitle,
  updateConversationModel,
  deleteConversation,
  setConversationNeedsReview,
  restoreConversation,
  permanentlyDeleteConversation,
  getWorkspaceForConversation,
  getMessagesByConversation,
  addMessage,
  deleteMessage,
  getSetting,
  setSetting
} from './database'
import { generateTitle, extractMemories } from './anthropic'
import {
  readBrain,
  writeBrain,
  appendEntries,
  removeEntry,
  updateEntry,
  getCategories,
  brainExists,
  scanWorkspace,
  getTokenWarningThreshold
} from './brain'
import type { BrainEntry } from './brain'
import {
  sendClaudeMessage,
  generateSessionId,
  isClaudeAvailable,
  getStreamingContent,
  isProcessActive,
  cancelClaudeProcess
} from './claude-cli'
import { transcribeAudio, getWhisperStatus, downloadWhisperModel } from './whisper'
import { log } from './logger'

export function registerIpcHandlers(): void {
  // Workspace handlers
  ipcMain.handle('get-workspaces', () => {
    return getAllWorkspaces()
  })

  ipcMain.handle('add-workspace', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    const folderPath = result.filePaths[0]
    const name = basename(folderPath)

    try {
      return createWorkspace(name, folderPath)
    } catch {
      // Path might already exist (UNIQUE constraint)
      return null
    }
  })

  ipcMain.handle('delete-workspace', (_event, id: number) => {
    deleteWorkspace(id)
    return true
  })

  // Conversation handlers
  ipcMain.handle('get-conversations', (_event, workspaceId: number) => {
    return getConversationsByWorkspace(workspaceId)
  })

  ipcMain.handle('create-conversation', (_event, workspaceId: number, model: string) => {
    const sessionId = generateSessionId()
    return createConversation(workspaceId, 'New Conversation', model, sessionId)
  })

  ipcMain.handle('update-conversation-title', (_event, id: number, title: string) => {
    updateConversationTitle(id, title)
    return true
  })

  ipcMain.handle('update-conversation-model', (_event, id: number, model: string) => {
    updateConversationModel(id, model)
    return true
  })

  ipcMain.handle('delete-conversation', (_event, id: number) => {
    deleteConversation(id)
    return true
  })

  ipcMain.handle(
    'set-conversation-needs-review',
    (_event, id: number, needsReview: boolean) => {
      setConversationNeedsReview(id, needsReview)
      return true
    }
  )

  ipcMain.handle('get-deleted-conversations', (_event, workspaceId: number) => {
    return getDeletedConversationsByWorkspace(workspaceId)
  })

  ipcMain.handle('restore-conversation', (_event, id: number) => {
    restoreConversation(id)
    return true
  })

  ipcMain.handle('permanently-delete-conversation', (_event, id: number) => {
    permanentlyDeleteConversation(id)
    return true
  })

  // Check if Claude CLI is available
  ipcMain.handle('get-api-key-status', () => {
    return isClaudeAvailable()
  })

  // Settings handlers
  ipcMain.handle('get-setting', (_event, key: string, defaultValue?: string) => {
    return getSetting(key, defaultValue)
  })

  ipcMain.handle('set-setting', (_event, key: string, value: string) => {
    setSetting(key, value)
    return true
  })

  // Message handlers
  ipcMain.handle('get-messages', (_event, conversationId: number) => {
    return getMessagesByConversation(conversationId)
  })

  ipcMain.handle('delete-message', (_event, messageId: number) => {
    deleteMessage(messageId)
    return true
  })

  // Returns accumulated streaming content if a conversation is actively streaming,
  // or null if no stream is in progress. This lets the renderer restore streaming
  // state when the user navigates back to a conversation.
  ipcMain.handle('get-streaming-state', (_event, conversationId: number) => {
    return getStreamingContent(conversationId)
  })

  ipcMain.handle('is-process-active', (_event, conversationId: number) => {
    return isProcessActive(conversationId)
  })

  ipcMain.handle('cancel-message', (_event, conversationId: number) => {
    cancelClaudeProcess(conversationId)
  })

  ipcMain.handle(
    'send-message',
    async (event, conversationId: number, content: string, model: string) => {
      log('ipc', 'send-message', { conversationId, model, contentLength: content.length })

      // Determine if this is the first message BEFORE saving user message.
      // When true, we use --session-id to create a new Claude session;
      // when false, we use --resume to continue the existing one.
      const existingMessages = getMessagesByConversation(conversationId)
      const isFirstMessage = existingMessages.length === 0

      // Save the user message
      addMessage(conversationId, 'user', content)

      // Get the BrowserWindow that sent the message
      const window = BrowserWindow.fromWebContents(event.sender)
      if (!window) {
        throw new Error('Could not find browser window')
      }

      // Look up the conversation's session_id and workspace path
      const conv = getConversation(conversationId) as {
        title: string
        session_id: string | null
      } | undefined
      if (!conv) {
        throw new Error('Conversation not found')
      }

      const workspace = getWorkspaceForConversation(conversationId) as {
        name: string
        path: string
      } | undefined
      if (!workspace) {
        throw new Error('Workspace not found for conversation')
      }

      // Generate a fresh session_id when this is the first message or when
      // the conversation has no session_id (legacy). Regenerating on first
      // message is critical for retries: if the previous attempt created a
      // session on Claude's side but failed before saving a response, the old
      // session_id is "already in use" and cannot be passed with --session-id
      // again. A fresh ID avoids this conflict.
      let sessionId = conv.session_id
      if (!sessionId || isFirstMessage) {
        sessionId = generateSessionId()
        const db = getDatabase()
        db.prepare('UPDATE conversations SET session_id = ? WHERE id = ?').run(
          sessionId,
          conversationId
        )
      }

      // Auto-scan brain on first message if no BRAIN.md exists
      if (!brainExists(workspace.path)) {
        const scanned = scanWorkspace(workspace.path)
        if (scanned.length > 0) {
          writeBrain(workspace.path, scanned)
          log('brain', 'Auto-scanned workspace on first message', {
            workspacePath: workspace.path,
            entriesFound: scanned.length
          })
        }
      }

      // Read brain context for injection
      const brain = readBrain(workspace.path)
      const brainContext = brain.raw || null

      log('ipc', 'Sending via Claude CLI', {
        sessionId,
        isFirstMessage,
        workspacePath: workspace.path,
        hasBrainContext: !!brainContext
      })

      // Start title generation in parallel if conversation still has the default title
      let titlePromise: Promise<void> | null = null
      if (conv.title === 'New Conversation') {
        titlePromise = generateTitle(content)
          .then((title) => {
            updateConversationTitle(conversationId, title)
            window.webContents.send('conversation-title-updated', {
              conversationId,
              title
            })
          })
          .catch((err) => {
            console.error('Failed to generate title:', err)
          })
      }

      // Send via Claude CLI. stream-complete is sent here (not in claude-cli.ts)
      // so the renderer only sees it AFTER the assistant message is saved to DB.
      // This prevents a race where stream-complete triggers a message reload before
      // the assistant response exists in the database.
      try {
        const responseText = await sendClaudeMessage(
          conversationId,
          sessionId,
          content,
          workspace.path,
          model,
          window,
          isFirstMessage,
          brainContext
        )

        // Save the assistant response (skip if empty, e.g. cancelled before any output)
        if (responseText) {
          addMessage(conversationId, 'assistant', responseText)
        }

        // Wait for title generation to finish if it hasn't already
        if (titlePromise) await titlePromise

        return responseText
      } finally {
        if (!window.isDestroyed()) {
          window.webContents.send('stream-complete', { conversationId })
        }
      }
    }
  )

  // Whisper transcription handlers
  ipcMain.handle('transcribe-audio', async (_event, wavData: Uint8Array) => {
    return transcribeAudio(Buffer.from(wavData))
  })

  ipcMain.handle('get-whisper-status', () => {
    return getWhisperStatus()
  })

  ipcMain.handle('download-whisper-model', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) throw new Error('Could not find browser window')
    await downloadWhisperModel(window)
    return true
  })

  // Brain handlers
  ipcMain.handle('brain-read', (_event, workspacePath: string) => {
    return readBrain(workspacePath)
  })

  ipcMain.handle(
    'brain-write',
    (_event, workspacePath: string, entries: BrainEntry[]) => {
      writeBrain(workspacePath, entries)
      return true
    }
  )

  ipcMain.handle(
    'brain-append',
    (_event, workspacePath: string, entries: BrainEntry[]) => {
      appendEntries(workspacePath, entries)
      return true
    }
  )

  ipcMain.handle('brain-remove', (_event, workspacePath: string, index: number) => {
    removeEntry(workspacePath, index)
    return true
  })

  ipcMain.handle(
    'brain-update',
    (_event, workspacePath: string, index: number, entry: BrainEntry) => {
      updateEntry(workspacePath, index, entry)
      return true
    }
  )

  ipcMain.handle('brain-categories', (_event, workspacePath: string) => {
    return getCategories(workspacePath)
  })

  ipcMain.handle('brain-exists', (_event, workspacePath: string) => {
    return brainExists(workspacePath)
  })

  ipcMain.handle('brain-scan', (_event, workspacePath: string) => {
    const entries = scanWorkspace(workspacePath)
    if (entries.length > 0) {
      writeBrain(workspacePath, entries)
    }
    return readBrain(workspacePath)
  })

  ipcMain.handle('brain-extract-memories', async (_event, messageContent: string, sentiment: 'positive' | 'negative') => {
    return extractMemories(messageContent, sentiment)
  })

  ipcMain.handle('brain-token-threshold', () => {
    return getTokenWarningThreshold()
  })
}
